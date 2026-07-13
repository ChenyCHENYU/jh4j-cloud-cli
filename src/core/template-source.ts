import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import type { CatalogTemplate } from "../types.js";
import { isDirectory, removePath } from "../utils/fs.js";
import { runCommand } from "../utils/process.js";

export interface AcquiredTemplate {
  root: string;
  source: string;
  cleanup(): Promise<void>;
}

export function resolveTemplateSource(
  template: CatalogTemplate,
  override?: string
): string {
  return (
    override ||
    process.env[template.sourceEnvironment] ||
    template.developmentPath
  );
}

function isGitSource(source: string): boolean {
  return (
    source.startsWith("git@") ||
    source.startsWith("ssh://") ||
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    source.endsWith(".git")
  );
}

export async function acquireTemplate(
  source: string,
  ref: string
): Promise<AcquiredTemplate> {
  const localPath = path.resolve(source);
  if (existsSync(localPath)) {
    if (!(await isDirectory(localPath))) {
      throw new Error(`模板源不是目录: ${localPath}`);
    }
    return {
      root: localPath,
      source: localPath,
      async cleanup() {}
    };
  }

  if (!isGitSource(source)) {
    throw new Error(`模板源不存在: ${source}`);
  }

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "jh4j-template-"));
  try {
    await runCommand(
      "git",
      ["clone", "--depth", "1", "--branch", ref, source, temporaryRoot],
      { stdio: "pipe" }
    );
    return {
      root: temporaryRoot,
      source: `${source}#${ref}`,
      cleanup: () => removePath(temporaryRoot)
    };
  } catch (error) {
    await removePath(temporaryRoot);
    throw error;
  }
}
