import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import * as prompts from "@clack/prompts";
import { satisfies } from "semver";
import { CLI_NAME, CLI_VERSION } from "../constants.js";
import {
  copyTemplateTree,
  isDirectoryEmpty,
  readJson,
  removePath,
  writeJson
} from "../utils/fs.js";
import { runCommand } from "../utils/process.js";
import { acquireTemplate, resolveTemplateSource } from "./template-source.js";
import { loadTemplateManifest } from "./template-manifest.js";
import { DEFAULT_USER_CONFIG } from "./user-config.js";
import type {
  CatalogTemplate,
  CreateOptions,
  ProjectInput,
  UserConfig
} from "../types.js";

const ENV_NAMES = ["dev", "sit", "uat", "pre", "prd"] as const;
type PartialProjectInput = Partial<Omit<ProjectInput, "environments">> & {
  environments?: Partial<ProjectInput["environments"]>;
};

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

function ensureHttpUrl(value: string, label: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return value.replace(/\/+$/, "");
  } catch {
    throw new Error(`${label} 必须是 http/https URL`);
  }
}

async function askText(message: string, initialValue: string): Promise<string> {
  const answer = await prompts.text({ message, initialValue });
  if (cancelled(answer)) throw new Error("用户取消创建");
  return String(answer).trim() || initialValue;
}

async function loadCreateConfig(
  configFile: string | undefined,
  cwd: string
): Promise<PartialProjectInput> {
  if (!configFile) return {};
  const resolved = path.resolve(cwd, configFile);
  if (!existsSync(resolved)) throw new Error(`创建配置文件不存在: ${resolved}`);
  return readJson<PartialProjectInput>(resolved);
}

async function collectProjectInput(
  projectName: string,
  sourceConfig: ProjectInput,
  fileConfig: PartialProjectInput,
  options: CreateOptions,
  userConfig: UserConfig
): Promise<ProjectInput> {
  let moduleName = options.module ?? fileConfig.moduleName ?? inferModuleName(projectName);
  let title = options.title ?? fileConfig.title ?? sourceConfig.title;
  let port: string | number =
    options.port ?? fileConfig.devServerPort ?? sourceConfig.devServerPort;
  let npmRegistry =
    options.npmRegistry ??
    fileConfig.npmRegistry ??
    userConfig.npmRegistry ??
    sourceConfig.npmRegistry;
  let jhlcRegistry =
    options.jhlcRegistry ??
    fileConfig.jhlcRegistry ??
    userConfig.jhlcRegistry ??
    sourceConfig.jhlcRegistry;
  let localBackendUrl =
    options.localBackend ?? fileConfig.localBackendUrl ?? sourceConfig.localBackendUrl;
  let localPublicUrl =
    options.localPublic ?? fileConfig.localPublicUrl ?? sourceConfig.localPublicUrl;
  const environments = structuredClone(sourceConfig.environments);
  for (const [env, value] of Object.entries(fileConfig.environments ?? {})) {
    if (value && environments[env]) {
      environments[env] = { ...environments[env], ...value };
    }
  }

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

  if (!title.trim()) throw new Error("系统标题不能为空");
  for (const env of ENV_NAMES) {
    if (!environments[env]) throw new Error(`缺少 ${env.toUpperCase()} 环境配置`);
    environments[env] = {
      webUrl: ensureHttpUrl(environments[env].webUrl, `${env.toUpperCase()} 平台地址`),
      apiPrefix: environments[env].apiPrefix.replace(/^\/+|\/+$/g, "")
    };
    if (!environments[env].apiPrefix) {
      throw new Error(`${env.toUpperCase()} API 前缀不能为空`);
    }
  }

  return {
    projectName,
    moduleName: ensureModuleName(moduleName),
    title: title.trim(),
    devServerPort: ensurePort(port),
    npmRegistry: ensureHttpUrl(npmRegistry, "公共 npm registry"),
    jhlcRegistry: ensureHttpUrl(jhlcRegistry, "@jhlc 私有 registry"),
    localBackendUrl: ensureHttpUrl(localBackendUrl, "本地后端地址"),
    localPublicUrl: ensureHttpUrl(localPublicUrl, "本地 public 地址"),
    environments
  };
}

function assertSafeTarget(cwd: string, target: string): void {
  if (path.dirname(target) !== cwd || target === cwd) {
    throw new Error("仅允许在当前目录创建一级项目目录");
  }
}

async function promoteStaging(
  stagingRoot: string,
  targetRoot: string,
  force: boolean
): Promise<void> {
  const targetExists = existsSync(targetRoot);
  if (!targetExists) {
    await rename(stagingRoot, targetRoot);
    return;
  }

  if (!(await isDirectoryEmpty(targetRoot)) && !force) {
    throw new Error(`目标目录已存在且非空: ${targetRoot}`);
  }

  const backupRoot = `${targetRoot}.jh4j-backup-${Date.now()}`;
  await rename(targetRoot, backupRoot);
  try {
    await rename(stagingRoot, targetRoot);
  } catch (error) {
    await rename(backupRoot, targetRoot);
    throw error;
  }
  try {
    await removePath(backupRoot);
  } catch {
    prompts.log.warn(`旧目录备份未能自动清理: ${backupRoot}`);
  }
}

export interface GenerateProjectResult {
  targetRoot: string;
  templateId: string;
  templateVersion: string;
  source: string;
  installed: boolean;
  gitInitialized: boolean;
}

export async function generateProject(
  catalogTemplate: CatalogTemplate,
  requestedProjectName: string,
  options: CreateOptions,
  cwd = process.cwd(),
  configuredUserConfig: UserConfig = DEFAULT_USER_CONFIG
): Promise<GenerateProjectResult> {
  const userConfig = { ...DEFAULT_USER_CONFIG, ...configuredUserConfig };
  const projectName = ensureProjectName(requestedProjectName);
  const resolvedCwd = path.resolve(cwd);
  const targetRoot = path.resolve(resolvedCwd, projectName);
  assertSafeTarget(resolvedCwd, targetRoot);
  if (
    existsSync(targetRoot) &&
    !(await isDirectoryEmpty(targetRoot)) &&
    !options.force
  ) {
    throw new Error(`目标目录已存在且非空: ${targetRoot}`);
  }

  const ref = options.ref ?? userConfig.templateRef ?? catalogTemplate.defaultRef;
  const sourceValue = resolveTemplateSource(
    catalogTemplate,
    options.source,
    userConfig.templateSource
  );
  const acquired = await acquireTemplate(sourceValue, ref, {
    noCache: options.cache === false,
    cacheTtlMinutes: userConfig.cacheTtlMinutes
  });
  const stagingRoot = path.join(
    resolvedCwd,
    `.${projectName}.jh4j-tmp-${process.pid}-${Date.now()}`
  );
  let promoted = false;

  try {
    const manifest = await loadTemplateManifest(acquired.root);
    if (manifest.id !== catalogTemplate.id) {
      throw new Error(
        `模板 ID 不匹配：Catalog=${catalogTemplate.id}，Manifest=${manifest.id}`
      );
    }
    if (!satisfies(process.versions.node, manifest.runtime.node)) {
      throw new Error(
        `当前 Node ${process.versions.node} 不满足模板要求 ${manifest.runtime.node}`
      );
    }

    const sourceProjectConfig = await readJson<
      Omit<ProjectInput, "npmRegistry" | "jhlcRegistry">
    >(path.join(acquired.root, "project.config.json"));
    const fileConfig = await loadCreateConfig(options.config, resolvedCwd);
    const input = await collectProjectInput(
      projectName,
      {
        ...sourceProjectConfig,
        npmRegistry: manifest.defaults.npmRegistry,
        jhlcRegistry: manifest.defaults.jhlcRegistry
      },
      fileConfig,
      options,
      userConfig
    );

    const shouldInstall = !options.skipInstall && userConfig.autoInstall;
    const shouldInitializeGit = !options.skipGit && userConfig.autoGit;

    if (options.dryRun) {
      prompts.note(
        [
          `模板: ${manifest.id}@${manifest.version}`,
          `来源: ${acquired.source}`,
          `目标: ${targetRoot}`,
          `模块: ${input.moduleName}`,
          `端口: ${input.devServerPort}`,
          `安装依赖: ${shouldInstall ? "是" : "否"}`,
          `初始化 Git: ${shouldInitializeGit ? "是" : "否"}`
        ].join("\n"),
        "Dry Run"
      );
      return {
        targetRoot,
        templateId: manifest.id,
        templateVersion: manifest.version,
        source: acquired.source,
        installed: false,
        gitInitialized: false
      };
    }

    await copyTemplateTree(acquired.root, stagingRoot);
    const inputFile = path.join(stagingRoot, ".jh4j-cli-input.json");
    await writeJson(inputFile, input);
    try {
      await runCommand(
        process.execPath,
        [
          path.join(stagingRoot, "scripts", "setup-project.mjs"),
          "--yes",
          "--config",
          inputFile,
          "--created-by",
          `${CLI_NAME}@${CLI_VERSION}`
        ],
        { cwd: stagingRoot, stdio: "pipe" }
      );
    } finally {
      await rm(inputFile, { force: true });
    }

    if (!existsSync(path.join(stagingRoot, manifest.generatedMetadata))) {
      throw new Error(`模板初始化未生成元数据: ${manifest.generatedMetadata}`);
    }
    await promoteStaging(stagingRoot, targetRoot, Boolean(options.force));
    promoted = true;

    if (shouldInstall) {
      try {
        await runCommand("pnpm", ["install"], { cwd: targetRoot });
      } catch (error) {
        throw new Error(
          `项目已生成，但依赖安装失败；目录已保留在 ${targetRoot}\n${(error as Error).message}`
        );
      }
    }

    let gitInitialized = false;
    if (shouldInitializeGit) {
      await runCommand("git", ["init", "-b", "main"], {
        cwd: targetRoot,
        stdio: "pipe"
      });
      gitInitialized = true;
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
      source: acquired.source,
      installed: shouldInstall,
      gitInitialized
    };
  } finally {
    if (!promoted && existsSync(stagingRoot)) await removePath(stagingRoot);
    await acquired.cleanup();
  }
}
