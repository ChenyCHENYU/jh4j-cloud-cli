import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { getJh4jHome } from "./user-config.js";
import { readJson, removePath, writeJson } from "../utils/fs.js";
import type { TemplateCacheMetadata } from "../types.js";

const CACHE_SCHEMA_VERSION = 1;

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
  return createHash("sha256").update(`${source}\0${ref}`).digest("hex").slice(0, 20);
}

function getEntryPaths(key: string) {
  const entryRoot = path.join(getTemplateCacheRoot(), key);
  return {
    entryRoot,
    templateRoot: path.join(entryRoot, "template"),
    metadataPath: path.join(entryRoot, "metadata.json")
  };
}

export async function readTemplateCacheEntry(
  source: string,
  ref: string
): Promise<TemplateCacheEntry | null> {
  const key = getTemplateCacheKey(source, ref);
  const paths = getEntryPaths(key);
  if (!existsSync(paths.templateRoot) || !existsSync(paths.metadataPath)) return null;
  try {
    const metadata = await readJson<TemplateCacheMetadata>(paths.metadataPath);
    if (
      metadata.schemaVersion !== CACHE_SCHEMA_VERSION ||
      metadata.source !== source ||
      metadata.ref !== ref
    ) {
      return null;
    }
    return {
      key,
      root: paths.templateRoot,
      metadata,
      sizeBytes: await calculateDirectorySize(paths.entryRoot)
    };
  } catch {
    return null;
  }
}

export function isTemplateCacheFresh(
  entry: TemplateCacheEntry,
  ttlMinutes: number
): boolean {
  if (ttlMinutes <= 0) return false;
  const cachedAt = Date.parse(entry.metadata.cachedAt);
  return Number.isFinite(cachedAt) && Date.now() - cachedAt < ttlMinutes * 60_000;
}

export async function createTemplateCacheStaging(
  source: string,
  ref: string
): Promise<{
  key: string;
  entryRoot: string;
  stagingRoot: string;
  templateRoot: string;
  commit(): Promise<void>;
  cleanup(): Promise<void>;
}> {
  const key = getTemplateCacheKey(source, ref);
  const cacheRoot = getTemplateCacheRoot();
  await mkdir(cacheRoot, { recursive: true });
  const stagingRoot = path.join(
    cacheRoot,
    `.${key}.tmp-${process.pid}-${Date.now()}`
  );
  const templateRoot = path.join(stagingRoot, "template");
  const entryRoot = path.join(cacheRoot, key);
  await mkdir(stagingRoot, { recursive: true });

  return {
    key,
    entryRoot,
    stagingRoot,
    templateRoot,
    async commit() {
      await writeJson(path.join(stagingRoot, "metadata.json"), {
        schemaVersion: CACHE_SCHEMA_VERSION,
        source,
        ref,
        cachedAt: new Date().toISOString()
      } satisfies TemplateCacheMetadata);
      await removePath(entryRoot);
      await rename(stagingRoot, entryRoot);
    },
    cleanup: () => removePath(stagingRoot)
  };
}

async function calculateDirectorySize(directory: string): Promise<number> {
  let total = 0;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await calculateDirectorySize(absolute);
    else if (entry.isFile()) total += (await stat(absolute)).size;
  }
  return total;
}

export async function listTemplateCache(): Promise<TemplateCacheEntry[]> {
  const cacheRoot = getTemplateCacheRoot();
  if (!existsSync(cacheRoot)) return [];
  const entries: TemplateCacheEntry[] = [];
  for (const directory of await readdir(cacheRoot, { withFileTypes: true })) {
    if (!directory.isDirectory() || directory.name.startsWith(".")) continue;
    const paths = getEntryPaths(directory.name);
    if (!existsSync(paths.metadataPath) || !existsSync(paths.templateRoot)) continue;
    try {
      entries.push({
        key: directory.name,
        root: paths.templateRoot,
        metadata: await readJson<TemplateCacheMetadata>(paths.metadataPath),
        sizeBytes: await calculateDirectorySize(paths.entryRoot)
      });
    } catch {
      // 损坏条目由 clear 或下一次拉取覆盖。
    }
  }
  return entries.sort((a, b) =>
    b.metadata.cachedAt.localeCompare(a.metadata.cachedAt)
  );
}

export async function clearTemplateCache(): Promise<void> {
  await removePath(getTemplateCacheRoot());
}
