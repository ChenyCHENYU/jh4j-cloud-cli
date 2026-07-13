import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { x as extractTar } from "tar";
import type { CatalogTemplate } from "../types.js";
import { isDirectory } from "../utils/fs.js";
import { runCommand } from "../utils/process.js";
import {
  createTemplateCacheStaging,
  isTemplateCacheFresh,
  readTemplateCacheEntry
} from "./template-cache.js";

const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;

export interface AcquiredTemplate {
  root: string;
  source: string;
  cleanup(): Promise<void>;
}

export function resolveTemplateSource(
  template: CatalogTemplate,
  override?: string,
  configuredSource?: string
): string {
  return resolveTemplateSources(template, override, configuredSource)[0];
}

export function resolveTemplateSources(
  template: CatalogTemplate,
  override?: string,
  configuredSource?: string
): string[] {
  const exclusiveSource =
    override ||
    (template.sourceEnvironment
      ? process.env[template.sourceEnvironment]
      : undefined) ||
    configuredSource;
  if (exclusiveSource) return [exclusiveSource];
  return [...new Set([template.defaultSource, ...(template.sources ?? [])])];
}

function isGitSource(source: string): boolean {
  return (
    source.startsWith("git@") ||
    source.startsWith("ssh://") ||
    source.startsWith("file://") ||
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    source.endsWith(".git")
  );
}

function isArchiveSource(source: string): boolean {
  const pathname = source.split(/[?#]/, 1)[0].toLowerCase();
  return pathname.endsWith(".tgz") || pathname.endsWith(".tar.gz") || pathname.endsWith(".tar");
}

async function getFreshCache(
  source: string,
  ref: string,
  options: { noCache?: boolean; cacheTtlMinutes?: number }
): Promise<AcquiredTemplate | null> {
  const cacheEntry = await readTemplateCacheEntry(source, ref);
  if (
    !options.noCache &&
    cacheEntry &&
    isTemplateCacheFresh(cacheEntry, options.cacheTtlMinutes ?? 60)
  ) {
    return {
      root: cacheEntry.root,
      source: `${source}#${ref} (cache)`,
      async cleanup() {}
    };
  }
  return null;
}

async function normalizeExtractedTemplate(
  stagingRoot: string,
  templateRoot: string
): Promise<void> {
  if (existsSync(path.join(templateRoot, "template.manifest.json"))) return;
  const children = await readdir(templateRoot, { withFileTypes: true });
  const candidates = children.filter(
    (entry) =>
      entry.isDirectory() &&
      existsSync(path.join(templateRoot, entry.name, "template.manifest.json"))
  );
  if (candidates.length !== 1) {
    throw new Error("压缩包根目录或唯一一级目录中未找到 template.manifest.json");
  }
  const normalizedRoot = path.join(stagingRoot, ".normalized-template");
  await rename(path.join(templateRoot, candidates[0].name), normalizedRoot);
  await rm(templateRoot, { recursive: true, force: true });
  await rename(normalizedRoot, templateRoot);
}

async function acquireArchiveTemplate(
  source: string,
  ref: string,
  options: { noCache?: boolean; cacheTtlMinutes?: number }
): Promise<AcquiredTemplate> {
  const cached = await getFreshCache(source, ref, options);
  if (cached) return cached;

  const cacheStaging = await createTemplateCacheStaging(source, ref);
  const archiveFile = path.join(cacheStaging.stagingRoot, "template.tgz");
  try {
    if (source.startsWith("http://") || source.startsWith("https://")) {
      const response = await fetch(source, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) {
        throw new Error(`模板压缩包下载失败: HTTP ${response.status}`);
      }
      const declaredLength = Number(response.headers.get("content-length") || 0);
      if (declaredLength > MAX_ARCHIVE_BYTES) {
        throw new Error("模板压缩包超过 200 MB 限制");
      }
      const archiveBuffer = Buffer.from(await response.arrayBuffer());
      if (archiveBuffer.byteLength > MAX_ARCHIVE_BYTES) {
        throw new Error("模板压缩包超过 200 MB 限制");
      }
      await writeFile(archiveFile, archiveBuffer);
    } else {
      const { copyFile } = await import("node:fs/promises");
      await copyFile(path.resolve(source), archiveFile);
    }
    await mkdir(cacheStaging.templateRoot, { recursive: true });
    await extractTar({ file: archiveFile, cwd: cacheStaging.templateRoot });
    await normalizeExtractedTemplate(
      cacheStaging.stagingRoot,
      cacheStaging.templateRoot
    );
    await rm(archiveFile, { force: true });
    await cacheStaging.commit();
    return {
      root: path.join(cacheStaging.entryRoot, "template"),
      source: `${source} (archive)`,
      async cleanup() {}
    };
  } catch (error) {
    await cacheStaging.cleanup();
    throw error;
  }
}

export async function acquireTemplate(
  source: string,
  ref: string,
  options: { noCache?: boolean; cacheTtlMinutes?: number } = {}
): Promise<AcquiredTemplate> {
  const localPath = path.resolve(source);
  if (existsSync(localPath)) {
    if (await isDirectory(localPath)) {
      return {
        root: localPath,
        source: localPath,
        async cleanup() {}
      };
    }
    if (isArchiveSource(localPath)) {
      return acquireArchiveTemplate(localPath, ref, options);
    }
    throw new Error(`模板源不是目录或支持的 tar 压缩包: ${localPath}`);
  }

  if (isArchiveSource(source)) {
    return acquireArchiveTemplate(source, ref, options);
  }

  if (!isGitSource(source)) {
    throw new Error(`模板源不存在: ${source}`);
  }

  const cached = await getFreshCache(source, ref, options);
  if (cached) return cached;

  const cacheStaging = await createTemplateCacheStaging(source, ref);
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
        source,
        cacheStaging.templateRoot
      ],
      { stdio: "pipe", env: { GIT_TERMINAL_PROMPT: "0" } }
    );
    await cacheStaging.commit();
    return {
      root: path.join(cacheStaging.entryRoot, "template"),
      source: `${source}#${ref}`,
      async cleanup() {}
    };
  } catch (error) {
    await cacheStaging.cleanup();
    throw error;
  }
}

export async function acquireTemplateFromSources(
  sources: string[],
  ref: string,
  options: { noCache?: boolean; cacheTtlMinutes?: number } = {}
): Promise<AcquiredTemplate> {
  if (!sources.length) throw new Error("没有可用的模板源");
  const failures: string[] = [];
  for (const source of [...new Set(sources)]) {
    try {
      return await acquireTemplate(source, ref, options);
    } catch (error) {
      failures.push(`${source}: ${(error as Error).message}`);
    }
  }
  throw new Error(`所有模板源均不可用：\n- ${failures.join("\n- ")}`);
}
