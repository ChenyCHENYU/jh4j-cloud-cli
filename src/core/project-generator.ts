import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import * as prompts from "@clack/prompts";
import { CLI_NAME, CLI_VERSION } from "../constants.js";
import { copyTemplateTree, isDirectoryEmpty, readJson, removePath, writeJson } from "../utils/fs.js";
import { runCommand } from "../utils/process.js";
import { acquireTemplate, resolveTemplateSource } from "./template-source.js";
import { loadTemplateManifest } from "./template-manifest.js";
import type { CatalogTemplate, CreateOptions, ProjectInput } from "../types.js";

const ENV_NAMES = ["dev", "sit", "uat", "pre", "prd"] as const;

function cancelled(value: unknown): value is symbol {
  return prompts.isCancel(value);
}

function ensureProjectName(value: string): string {
  const name = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    throw new Error("项目名称只能包含小写字母、数字、点、下划线和连字符");
  }
  return name;
}

function inferModuleName(projectName: string): string {
  const inferred = projectName
    .replace(/^(?:jh4j|wl)-ui-/, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "");
  return /^[a-z][a-z0-9-]*$/.test(inferred) ? inferred : "app";
}

function ensureModuleName(value: string): string {
  const name = value.trim();
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error("模块标识必须以小写字母开头，只能包含小写字母、数字和连字符");
  }
  return name;
}

function ensurePort(value: string | number): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("开发端口必须是 1024 到 65535 之间的整数");
  }
  return port;
}

async function askText(message: string, initialValue: string): Promise<string> {
  const answer = await prompts.text({ message, initialValue });
  if (cancelled(answer)) throw new Error("用户取消创建");
  return String(answer).trim() || initialValue;
}

async function collectProjectInput(
  projectName: string,
  defaults: ProjectInput,
  options: CreateOptions
): Promise<ProjectInput> {
  let moduleName = options.module ?? inferModuleName(projectName);
  let title = options.title ?? defaults.title;
  let port: string | number = options.port ?? defaults.devServerPort;
  let npmRegistry = options.npmRegistry ?? defaults.npmRegistry;
  let jhlcRegistry = options.jhlcRegistry ?? defaults.jhlcRegistry;
  let localBackendUrl = options.localBackend ?? defaults.localBackendUrl;
  let localPublicUrl = options.localPublic ?? defaults.localPublicUrl;
  const environments = structuredClone(defaults.environments);

  if (!options.yes) {
    moduleName = await askText("模块标识", moduleName);
    title = await askText("系统标题", title);
    port = await askText("开发端口", String(port));
    npmRegistry = await askText("公共 npm registry", npmRegistry);
    jhlcRegistry = await askText("@jhlc 私有 registry", jhlcRegistry);
    localBackendUrl = await askText("本地后端地址", localBackendUrl);
    localPublicUrl = await askText("本地 public 地址", localPublicUrl);

    const configureEnvironments = await prompts.confirm({
      message: "是否逐项确认五套环境地址",
      initialValue: false
    });
    if (cancelled(configureEnvironments)) throw new Error("用户取消创建");
    if (configureEnvironments) {
      for (const env of ENV_NAMES) {
        environments[env].webUrl = await askText(
          `${env.toUpperCase()} 平台地址`,
          environments[env].webUrl
        );
        environments[env].apiPrefix = await askText(
          `${env.toUpperCase()} API 前缀`,
          environments[env].apiPrefix
        );
      }
    }
  }

  return {
    projectName,
    moduleName: ensureModuleName(moduleName),
    title: title.trim(),
    devServerPort: ensurePort(port),
    npmRegistry,
    jhlcRegistry,
    localBackendUrl,
    localPublicUrl,
    environments
  };
}

function assertSafeTarget(cwd: string, target: string): void {
  if (path.dirname(target) !== cwd || target === cwd) {
    throw new Error("首期仅允许在当前目录创建一级项目目录");
  }
}

export interface GenerateProjectResult {
  targetRoot: string;
  templateId: string;
  templateVersion: string;
  source: string;
}

export async function generateProject(
  catalogTemplate: CatalogTemplate,
  requestedProjectName: string,
  options: CreateOptions,
  cwd = process.cwd()
): Promise<GenerateProjectResult> {
  const projectName = ensureProjectName(requestedProjectName);
  const targetRoot = path.resolve(cwd, projectName);
  assertSafeTarget(path.resolve(cwd), targetRoot);

  const sourceValue = resolveTemplateSource(catalogTemplate, options.source);
  const acquired = await acquireTemplate(sourceValue, options.ref ?? catalogTemplate.defaultRef);
  let generated = false;

  try {
    const manifest = await loadTemplateManifest(acquired.root);
    if (manifest.id !== catalogTemplate.id) {
      throw new Error(
        `模板 ID 不匹配：Catalog=${catalogTemplate.id}，Manifest=${manifest.id}`
      );
    }
    const sourceConfig = await readJson<ProjectInput>(
      path.join(acquired.root, "project.config.json")
    );
    const input = await collectProjectInput(
      projectName,
      {
        ...sourceConfig,
        npmRegistry: manifest.defaults.npmRegistry,
        jhlcRegistry: manifest.defaults.jhlcRegistry
      },
      options
    );

    if (options.dryRun) {
      prompts.note(
        [
          `模板: ${manifest.id}@${manifest.version}`,
          `来源: ${acquired.source}`,
          `目标: ${targetRoot}`,
          `模块: ${input.moduleName}`,
          `端口: ${input.devServerPort}`,
          `安装依赖: ${options.skipInstall ? "否" : "是"}`,
          `初始化 Git: ${options.skipGit ? "否" : "是"}`
        ].join("\n"),
        "Dry Run"
      );
      return {
        targetRoot,
        templateId: manifest.id,
        templateVersion: manifest.version,
        source: acquired.source
      };
    }

    if (existsSync(targetRoot)) {
      if (options.force) {
        await removePath(targetRoot);
      } else if (!(await isDirectoryEmpty(targetRoot))) {
        throw new Error(`目标目录已存在且非空: ${targetRoot}`);
      }
    }

    await copyTemplateTree(acquired.root, targetRoot);
    const inputFile = path.join(targetRoot, ".jh4j-cli-input.json");
    await writeJson(inputFile, input);
    try {
      await runCommand(
        process.execPath,
        [
          path.join(targetRoot, "scripts", "setup-project.mjs"),
          "--yes",
          "--config",
          inputFile,
          "--created-by",
          `${CLI_NAME}@${CLI_VERSION}`
        ],
        { cwd: targetRoot }
      );
    } finally {
      await rm(inputFile, { force: true });
    }
    generated = true;

    if (!options.skipInstall) {
      await runCommand("pnpm", ["install"], { cwd: targetRoot });
    }

    if (!options.skipGit) {
      await runCommand("git", ["init", "-b", "main"], { cwd: targetRoot, stdio: "pipe" });
      await runCommand("git", ["add", "-A"], { cwd: targetRoot, stdio: "pipe" });
      try {
        await runCommand(
          "git",
          ["commit", "-m", `feat(init): 基于 ${manifest.id}@${manifest.version} 初始化`],
          { cwd: targetRoot, stdio: "pipe" }
        );
      } catch (error) {
        prompts.log.warn(`Git 已初始化，但初始提交未完成：${(error as Error).message}`);
      }
    }

    return {
      targetRoot,
      templateId: manifest.id,
      templateVersion: manifest.version,
      source: acquired.source
    };
  } catch (error) {
    if (!generated && existsSync(targetRoot)) {
      await removePath(targetRoot);
    }
    throw error;
  } finally {
    await acquired.cleanup();
  }
}
