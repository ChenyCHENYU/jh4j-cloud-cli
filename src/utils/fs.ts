import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  stat,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { CliError, throwIfAborted } from "../core/errors.js";

const EXCLUDED_TEMPLATE_PATHS = new Set([
  ".git",
  ".jhlc",
  "dist",
  "node_modules",
  ".DS_Store",
]);

export async function readJson<T>(file: string): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new CliError(
        `JSON 格式无效: ${file}\n${error.message}`,
        "INVALID_CONFIG",
      );
    throw error;
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

export function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

export function resolveContainedPath(
  root: string,
  relative: string,
  label: string,
): string {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.includes("\\") ||
    /^[a-z]:/i.test(relative)
  ) {
    throw new CliError(`${label} 必须是模板内的相对路径`, "INVALID_TEMPLATE");
  }
  const target = path.resolve(root, relative);
  if (target === path.resolve(root) || !isWithin(path.resolve(root), target))
    throw new CliError(`${label} 不得越出模板目录`, "INVALID_TEMPLATE");
  return target;
}

export async function assertContainedFile(
  root: string,
  relative: string,
  label: string,
): Promise<string> {
  const target = resolveContainedPath(root, relative, label);
  const canonicalRoot = await realpath(root);
  let canonical: string;
  try {
    canonical = await realpath(target);
  } catch {
    throw new CliError(`${label} 文件不存在: ${relative}`, "INVALID_TEMPLATE");
  }
  if (!isWithin(canonicalRoot, canonical) || !(await stat(canonical)).isFile())
    throw new CliError(
      `${label} 必须是模板内的普通文件: ${relative}`,
      "INVALID_TEMPLATE",
    );
  return target;
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
  return (await readdir(directory)).length === 0;
}

export async function copyTemplateTree(
  sourceRoot: string,
  targetRoot: string,
  options: { signal?: AbortSignal; exclude?: string[] } = {},
): Promise<void> {
  const source = await realpath(sourceRoot);
  // Resolve existing ancestors even when the final destination does not yet
  // exist, so a symlinked parent cannot hide a copy back into the source.
  let ancestor = path.resolve(targetRoot);
  const missing: string[] = [];
  let target: string;
  while (true) {
    try {
      target = path.join(await realpath(ancestor), ...missing.reverse());
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      missing.push(path.basename(ancestor));
      ancestor = parent;
    }
  }
  if (isWithin(source, target) || isWithin(target, source))
    throw new CliError("模板与目标目录不能互相包含", "INVALID_INPUT");
  const excluded = new Set(options.exclude ?? []);
  const visit = async (relative: string): Promise<void> => {
    throwIfAborted(options.signal);
    const origin = path.join(source, relative);
    const destination = path.join(target, relative);
    if (
      relative &&
      (relative
        .split(path.sep)
        .some((part) => EXCLUDED_TEMPLATE_PATHS.has(part)) ||
        excluded.has(relative))
    )
      return;
    const info = await lstat(origin);
    if (info.isSymbolicLink()) {
      let resolved: string;
      try {
        resolved = await realpath(origin);
      } catch {
        throw new CliError(
          `模板包含无效符号链接: ${relative} → ${await readlink(origin)}`,
          "INVALID_TEMPLATE",
        );
      }
      const linkedRelative = path.relative(source, resolved);
      if (
        !isWithin(source, resolved) ||
        linkedRelative
          .split(path.sep)
          .some((part) => EXCLUDED_TEMPLATE_PATHS.has(part)) ||
        excluded.has(linkedRelative)
      ) {
        throw new CliError(
          `模板符号链接指向模板外部或排除目录: ${relative}`,
          "INVALID_TEMPLATE",
        );
      }
      const link =
        path.relative(
          path.dirname(destination),
          path.join(target, linkedRelative),
        ) || ".";
      await symlink(
        link,
        destination,
        process.platform === "win32" && (await stat(resolved)).isDirectory()
          ? "dir"
          : "file",
      );
    } else if (info.isDirectory()) {
      await mkdir(destination, { recursive: true });
      for (const entry of await readdir(origin))
        await visit(path.join(relative, entry));
    } else if (info.isFile()) {
      await copyFile(origin, destination);
      await chmod(destination, info.mode & 0o777);
    } else
      throw new CliError(
        `模板包含不支持的文件类型: ${relative}`,
        "INVALID_TEMPLATE",
      );
  };
  await visit("");
}

export async function removePath(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true, maxRetries: 3 });
}
