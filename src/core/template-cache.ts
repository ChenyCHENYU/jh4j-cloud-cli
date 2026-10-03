import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { valid } from "semver";
import { getJh4jHome } from "./user-config.js";
import { readJson, removePath, writeJson } from "../utils/fs.js";
import { withFileLock } from "../utils/file-lock.js";
import { redactSource } from "../utils/redact.js";
import { record, textValue } from "./validation.js";
import type { TemplateCacheMetadata } from "../types.js";

export interface TemplateCacheEntry {
  key: string;
  root: string;
  metadata: TemplateCacheMetadata;
  sizeBytes: number;
}
export function getTemplateCacheRoot(): string {
  return path.join(getJh4jHome(), "cache", "templates");
}
export function getTemplateCacheKey(source: string, ref: string): string {
  return createHash("sha256")
    .update(`${source}\0${ref}`)
    .digest("hex")
    .slice(0, 20);
}
export function withTemplateCacheLock<T>(
  action: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return withFileLock(`${getTemplateCacheRoot()}.lock`, action, { signal });
}
function entryPaths(key: string) {
  const entryRoot = path.join(getTemplateCacheRoot(), key);
  return {
    entryRoot,
    templateRoot: path.join(entryRoot, "template"),
    metadataPath: path.join(entryRoot, "metadata.json"),
  };
}
function parseCacheMetadata(value: unknown): TemplateCacheMetadata | null {
  try {
    const metadata = record(value, "缓存元数据");
    if (
      metadata.schemaVersion !== 1 ||
      !Number.isFinite(Date.parse(textValue(metadata.cachedAt, "cachedAt")))
    )
      return null;
    textValue(metadata.source, "source");
    textValue(metadata.ref, "ref");
    if (
      metadata.sizeBytes !== undefined &&
      (!Number.isSafeInteger(metadata.sizeBytes) ||
        (metadata.sizeBytes as number) < 0)
    )
      return null;
    if (
      metadata.commit !== undefined &&
      metadata.commit !== null &&
      !/^[a-f0-9]{40,64}$/.test(textValue(metadata.commit, "commit"))
    )
      return null;
    if (
      metadata.archiveSha256 !== undefined &&
      !/^[a-f0-9]{64}$/.test(textValue(metadata.archiveSha256, "archiveSha256"))
    )
      return null;
    if (metadata.templateId !== undefined)
      textValue(metadata.templateId, "templateId");
    if (
      metadata.templateVersion !== undefined &&
      !valid(textValue(metadata.templateVersion, "templateVersion"))
    )
      return null;
    return {
      ...metadata,
      source: redactSource(metadata.source as string),
    } as unknown as TemplateCacheMetadata;
  } catch {
    return null;
  }
}
export async function readTemplateCacheEntry(
  source: string,
  ref: string,
): Promise<TemplateCacheEntry | null> {
  const key = getTemplateCacheKey(source, ref);
  const paths = entryPaths(key);
  try {
    if (!existsSync(paths.templateRoot)) return null;
    const metadata = parseCacheMetadata(await readJson(paths.metadataPath));
    if (
      !metadata ||
      redactSource(metadata.source) !== redactSource(source) ||
      metadata.ref !== ref ||
      !Number.isFinite(Date.parse(metadata.cachedAt))
    )
      return null;
    return {
      key,
      root: paths.templateRoot,
      metadata,
      sizeBytes: metadata.sizeBytes ?? 0,
    };
  } catch {
    return null;
  }
}
export function isTemplateCacheFresh(
  entry: TemplateCacheEntry,
  ttlMinutes: number,
): boolean {
  const age = Date.now() - Date.parse(entry.metadata.cachedAt);
  return ttlMinutes > 0 && age >= 0 && age < ttlMinutes * 60_000;
}
export async function createTemplateCacheStaging(
  source: string,
  ref: string,
  signal?: AbortSignal,
): Promise<{
  key: string;
  entryRoot: string;
  stagingRoot: string;
  templateRoot: string;
  commit(details?: Partial<TemplateCacheMetadata>): Promise<void>;
  cleanup(): Promise<void>;
}> {
  const key = getTemplateCacheKey(source, ref);
  const cacheRoot = getTemplateCacheRoot();
  await mkdir(path.dirname(cacheRoot), { recursive: true });
  // Download staging lives beside the cache; cache clear cannot delete an in-flight download.
  const stagingRoot = await mkdtemp(
    path.join(path.dirname(cacheRoot), `.${key}.tmp-`),
  );
  const templateRoot = path.join(stagingRoot, "template");
  const entryRoot = entryPaths(key).entryRoot;
  return {
    key,
    entryRoot,
    stagingRoot,
    templateRoot,
    async commit(details = {}) {
      const sizeBytes = await calculateDirectorySize(templateRoot);
      await writeJson(path.join(stagingRoot, "metadata.json"), {
        ...details,
        schemaVersion: 1,
        source: redactSource(source),
        ref,
        cachedAt: new Date().toISOString(),
        sizeBytes,
      } satisfies TemplateCacheMetadata);
      await withTemplateCacheLock(async () => {
        await mkdir(cacheRoot, { recursive: true });
        const backup = path.join(cacheRoot, `.backup-${key}-${randomUUID()}`);
        const hasExisting = existsSync(entryRoot);
        if (hasExisting) await rename(entryRoot, backup);
        try {
          await rename(stagingRoot, entryRoot);
        } catch (error) {
          if (hasExisting) await rename(backup, entryRoot);
          throw error;
        }
        // A leftover backup is harmless and will be removed by cache clear.
        if (hasExisting) await removePath(backup).catch(() => {});
      }, signal);
    },
    cleanup: () => removePath(stagingRoot),
  };
}
async function calculateDirectorySize(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await calculateDirectorySize(absolute);
    else if (entry.isFile()) total += (await stat(absolute)).size;
  }
  return total;
}
export async function listTemplateCache(
  signal?: AbortSignal,
): Promise<TemplateCacheEntry[]> {
  return withTemplateCacheLock(async () => {
    const cacheRoot = getTemplateCacheRoot();
    if (!existsSync(cacheRoot)) return [];
    const entries: TemplateCacheEntry[] = [];
    for (const directory of await readdir(cacheRoot, { withFileTypes: true })) {
      if (!directory.isDirectory() || !/^[a-f0-9]{20}$/.test(directory.name))
        continue;
      const paths = entryPaths(directory.name);
      try {
        const metadata = parseCacheMetadata(await readJson(paths.metadataPath));
        if (!metadata) continue;
        entries.push({
          key: directory.name,
          root: paths.templateRoot,
          metadata,
          sizeBytes:
            metadata.sizeBytes ??
            (await calculateDirectorySize(paths.entryRoot)),
        });
      } catch {
        /* Corrupt entries are refreshed on the next acquisition. */
      }
    }
    return entries.sort((a, b) =>
      b.metadata.cachedAt.localeCompare(a.metadata.cachedAt),
    );
  }, signal);
}
export async function clearTemplateCache(signal?: AbortSignal): Promise<void> {
  await withTemplateCacheLock(() => removePath(getTemplateCacheRoot()), signal);
}
