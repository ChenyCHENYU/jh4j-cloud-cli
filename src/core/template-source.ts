import path from "node:path";
import os from "node:os";
import { existsSync, createWriteStream, createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { x as extractTar } from "tar";
import type {
  CatalogTemplate,
  TemplateCategory,
  TemplateProvenance,
} from "../types.js";
import { copyTemplateTree, isDirectory, removePath } from "../utils/fs.js";
import { runCommand } from "../utils/process.js";
import { redactSource, redactText } from "../utils/redact.js";
import { CliError, throwIfAborted } from "./errors.js";
import { validateTemplateContract } from "./template-manifest.js";
import {
  createTemplateCacheStaging,
  isTemplateCacheFresh,
  readTemplateCacheEntry,
  withTemplateCacheLock,
} from "./template-cache.js";

export const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 1024 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100_000;
export interface AcquisitionOptions {
  noCache?: boolean;
  cacheTtlMinutes?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  offline?: boolean;
  expectedTemplateId?: string;
  expectedCategory?: TemplateCategory;
}
export interface AcquiredTemplate {
  root: string;
  source: string;
  provenance: TemplateProvenance;
  cleanup(): Promise<void>;
}
export function resolveTemplateSource(
  template: CatalogTemplate,
  override?: string,
  configuredSource?: string,
): string {
  return resolveTemplateSources(template, override, configuredSource)[0];
}
export function resolveTemplateSources(
  template: CatalogTemplate,
  override?: string,
  configuredSource?: string,
): string[] {
  const exclusive =
    override ||
    (template.sourceEnvironment
      ? process.env[template.sourceEnvironment]
      : undefined) ||
    configuredSource;
  return exclusive
    ? [exclusive]
    : [...new Set([template.defaultSource, ...(template.sources ?? [])])];
}
export function isGitSource(source: string): boolean {
  return (
    /^(?:git@|ssh:\/\/|file:\/\/|https?:\/\/)/.test(source) ||
    source.endsWith(".git")
  );
}
function isArchiveSource(source: string): boolean {
  return /\.(?:tgz|tar\.gz|tar)$/i.test(source.split(/[?#]/, 1)[0]);
}
async function snapshot(
  root: string,
  source: string,
  provenance: TemplateProvenance,
  signal?: AbortSignal,
): Promise<AcquiredTemplate> {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "jh4j-template-"));
  const snapshotRoot = path.join(temporary, "template");
  try {
    await copyTemplateTree(root, snapshotRoot, { signal });
  } catch (error) {
    await removePath(temporary);
    throw error;
  }
  return {
    root: snapshotRoot,
    source,
    provenance,
    cleanup: () => removePath(temporary),
  };
}
async function getFreshCache(
  source: string,
  ref: string,
  options: AcquisitionOptions,
): Promise<AcquiredTemplate | null> {
  if (options.noCache) return null;
  return withTemplateCacheLock(async () => {
    const entry = await readTemplateCacheEntry(source, ref);
    if (
      !entry ||
      (!options.offline &&
        !isTemplateCacheFresh(entry, options.cacheTtlMinutes ?? 60))
    )
      return null;
    try {
      await validateTemplateContract(
        entry.root,
        options.expectedTemplateId,
        options.expectedCategory,
      );
      return await snapshot(
        entry.root,
        `${redactSource(source)}#${ref} (cache)`,
        {
          source: redactSource(source),
          ref: entry.metadata.archiveSha256 ? null : ref,
          commit: entry.metadata.commit ?? null,
          archiveSha256: entry.metadata.archiveSha256,
          cached: true,
        },
        options.signal,
      );
    } catch {
      throwIfAborted(options.signal);
      return null;
    }
  }, options.signal);
}
async function normalizeExtractedTemplate(
  stagingRoot: string,
  templateRoot: string,
): Promise<void> {
  if (existsSync(path.join(templateRoot, "template.manifest.json"))) return;
  const candidates = (
    await readdir(templateRoot, { withFileTypes: true })
  ).filter(
    (entry) =>
      entry.isDirectory() &&
      existsSync(path.join(templateRoot, entry.name, "template.manifest.json")),
  );
  if (candidates.length !== 1)
    throw new CliError(
      "压缩包根目录或唯一一级目录中未找到 template.manifest.json",
      "INVALID_TEMPLATE",
    );
  const normalized = path.join(stagingRoot, ".normalized-template");
  await rename(path.join(templateRoot, candidates[0].name), normalized);
  await removePath(templateRoot);
  await rename(normalized, templateRoot);
}
async function hashArchive(
  file: string,
  signal?: AbortSignal,
): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, { signal }))
    hash.update(chunk);
  return hash.digest("hex");
}
async function acquireArchiveTemplate(
  source: string,
  ref: string,
  options: AcquisitionOptions,
): Promise<AcquiredTemplate> {
  const cached = await getFreshCache(source, ref, options);
  if (cached) return cached;
  if (options.offline && /^https?:\/\//.test(source))
    throw new CliError("离线模式没有可用的压缩包缓存", "OFFLINE_CACHE_MISS");
  const staging = await createTemplateCacheStaging(source, ref, options.signal);
  const archive = path.join(staging.stagingRoot, "template.tgz");
  let acquired: AcquiredTemplate | undefined;
  try {
    if (/^https?:\/\//.test(source)) {
      const signal = AbortSignal.any([
        ...(options.signal ? [options.signal] : []),
        AbortSignal.timeout(options.timeoutMs ?? 60_000),
      ]);
      const response = await fetch(source, { signal });
      if (!response.ok || !response.body)
        throw new CliError(
          `模板压缩包下载失败: HTTP ${response.status}`,
          "DOWNLOAD_FAILED",
        );
      if (
        Number(response.headers.get("content-length") ?? 0) > MAX_ARCHIVE_BYTES
      ) {
        await response.body.cancel();
        throw new CliError("模板压缩包超过 200 MB 限制", "ARCHIVE_LIMIT");
      }
      let bytes = 0;
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          callback(
            bytes > MAX_ARCHIVE_BYTES
              ? new CliError("模板压缩包超过 200 MB 限制", "ARCHIVE_LIMIT")
              : null,
            chunk,
          );
        },
      });
      await pipeline(
        Readable.fromWeb(
          response.body as unknown as import("node:stream/web").ReadableStream,
        ),
        limiter,
        createWriteStream(archive, { flags: "wx", mode: 0o600 }),
        { signal },
      );
    } else {
      if ((await stat(path.resolve(source))).size > MAX_ARCHIVE_BYTES)
        throw new CliError("模板压缩包超过 200 MB 限制", "ARCHIVE_LIMIT");
      await copyFile(path.resolve(source), archive);
    }
    throwIfAborted(options.signal);
    await mkdir(staging.templateRoot, { recursive: true });
    let bytes = 0,
      entries = 0;
    let invalid: Error | undefined;
    const extraction = extractTar({
      cwd: staging.templateRoot,
      strict: true,
      filter(entryPath, entry) {
        entries++;
        bytes += entry.size;
        if (entries > MAX_ARCHIVE_ENTRIES || bytes > MAX_EXTRACTED_BYTES)
          invalid ??= new CliError(
            "模板解压超过 1 GB 或 100000 个条目限制",
            "ARCHIVE_LIMIT",
          );
        if (
          path.isAbsolute(entryPath) ||
          entryPath.includes("\\") ||
          entryPath.split("/").includes("..") ||
          !["File", "Directory", "SymbolicLink", "Link"].includes(
            "type" in entry ? entry.type : "File",
          )
        )
          invalid ??= new CliError(
            `压缩包包含不安全的条目: ${entryPath}`,
            "INVALID_TEMPLATE",
          );
        if (invalid) {
          queueMicrotask(() => extraction.abort(invalid!));
          return false;
        }
        if (options.signal?.aborted) {
          queueMicrotask(() => extraction.abort(options.signal?.reason));
          return false;
        }
        return true;
      },
    });
    try {
      await pipeline(createReadStream(archive), extraction, {
        signal: options.signal,
      });
    } catch (error) {
      if (invalid) throw invalid;
      throw error;
    }
    if (invalid) throw invalid;
    await normalizeExtractedTemplate(staging.stagingRoot, staging.templateRoot);
    const manifest = await validateTemplateContract(
      staging.templateRoot,
      options.expectedTemplateId,
      options.expectedCategory,
    );
    const archiveSha256 = await hashArchive(archive, options.signal);
    acquired = await snapshot(
      staging.templateRoot,
      `${redactSource(source)} (archive)`,
      {
        source: redactSource(source),
        ref: null,
        commit: null,
        archiveSha256,
        cached: false,
      },
      options.signal,
    );
    await rm(archive, { force: true });
    await staging.commit({
      templateId: manifest.id,
      templateVersion: manifest.version,
      archiveSha256,
    });
    return acquired;
  } catch (error) {
    await acquired?.cleanup();
    throwIfAborted(options.signal);
    throw error;
  } finally {
    await staging.cleanup();
  }
}
export async function acquireTemplate(
  source: string,
  ref: string,
  options: AcquisitionOptions = {},
): Promise<AcquiredTemplate> {
  throwIfAborted(options.signal);
  if (options.offline && options.noCache)
    throw new CliError("--offline 与 --no-cache 不能同时使用", "INVALID_INPUT");
  const local = path.resolve(source);
  if (existsSync(local)) {
    if (await isDirectory(local)) {
      await validateTemplateContract(
        local,
        options.expectedTemplateId,
        options.expectedCategory,
      );
      return {
        root: local,
        source: local,
        provenance: { source: local, ref: null, commit: null, cached: false },
        async cleanup() {},
      };
    }
    if (isArchiveSource(local))
      return acquireArchiveTemplate(local, ref, options);
    throw new CliError(
      `模板源不是目录或支持的 tar 压缩包: ${local}`,
      "INVALID_INPUT",
    );
  }
  if (isArchiveSource(source))
    return acquireArchiveTemplate(source, ref, options);
  if (!isGitSource(source))
    throw new CliError(`模板源不存在: ${source}`, "INVALID_INPUT");
  const cached = await getFreshCache(source, ref, options);
  if (cached) return cached;
  if (options.offline)
    throw new CliError(
      `离线模式没有可用模板缓存: ${redactSource(source)}#${ref}`,
      "OFFLINE_CACHE_MISS",
    );
  const staging = await createTemplateCacheStaging(source, ref, options.signal);
  let acquired: AcquiredTemplate | undefined;
  try {
    await runCommand(
      "git",
      [
        "-c",
        "http.lowSpeedLimit=1024",
        "-c",
        "http.lowSpeedTime=15",
        "clone",
        "--depth",
        "1",
        "--branch",
        ref,
        "--",
        source,
        staging.templateRoot,
      ],
      {
        stdio: "pipe",
        env: { GIT_TERMINAL_PROMPT: "0" },
        signal: options.signal,
        timeoutMs: options.timeoutMs ?? 60_000,
      },
    );
    const manifest = await validateTemplateContract(
      staging.templateRoot,
      options.expectedTemplateId,
      options.expectedCategory,
    );
    const commit = await runCommand("git", ["rev-parse", "HEAD"], {
      cwd: staging.templateRoot,
      stdio: "pipe",
      signal: options.signal,
      timeoutMs: 10_000,
    });
    acquired = await snapshot(
      staging.templateRoot,
      `${redactSource(source)}#${ref}`,
      { source: redactSource(source), ref, commit, cached: false },
      options.signal,
    );
    await staging.commit({
      templateId: manifest.id,
      templateVersion: manifest.version,
      commit,
    });
    return acquired;
  } catch (error) {
    await acquired?.cleanup();
    throwIfAborted(options.signal);
    throw error;
  } finally {
    await staging.cleanup();
  }
}
export async function acquireTemplateFromSources(
  sources: string[],
  ref: string,
  options: AcquisitionOptions = {},
): Promise<AcquiredTemplate> {
  if (!sources.length)
    throw new CliError("没有可用的模板源", "INVALID_TEMPLATE");
  const failures: string[] = [];
  for (const source of [...new Set(sources)]) {
    throwIfAborted(options.signal);
    try {
      return await acquireTemplate(source, ref, options);
    } catch (error) {
      throwIfAborted(options.signal);
      failures.push(
        `${redactSource(source)}: ${redactText((error as Error).message)}`,
      );
    }
  }
  throw new CliError(
    `所有模板源均不可用：\n- ${failures.join("\n- ")}`,
    "TEMPLATE_UNAVAILABLE",
  );
}
