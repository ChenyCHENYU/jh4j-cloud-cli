import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const EXCLUDED_TEMPLATE_PATHS = new Set([
  ".git",
  ".jhlc",
  "dist",
  "node_modules"
]);

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function isDirectory(directory: string): Promise<boolean> {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

export async function isDirectoryEmpty(directory: string): Promise<boolean> {
  if (!existsSync(directory)) return true;
  const { readdir } = await import("node:fs/promises");
  return (await readdir(directory)).length === 0;
}

export async function copyTemplateTree(
  sourceRoot: string,
  targetRoot: string
): Promise<void> {
  await mkdir(targetRoot, { recursive: true });
  await cp(sourceRoot, targetRoot, {
    recursive: true,
    force: true,
    filter(source) {
      const relative = path.relative(sourceRoot, source);
      if (!relative) return true;
      const [topLevel] = relative.split(path.sep);
      return !EXCLUDED_TEMPLATE_PATHS.has(topLevel);
    }
  });
}

export async function removePath(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true, maxRetries: 3 });
}
