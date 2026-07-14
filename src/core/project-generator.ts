import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import * as prompts from "@clack/prompts";
import { satisfies } from "semver";
import { CLI_NAME, CLI_VERSION } from "../constants.js";
import { createBrandSpinner, ui } from "../ui/theme.js";
import {
  copyTemplateTree,
  isDirectoryEmpty,
  readJson,
  removePath,
  writeJson
} from "../utils/fs.js";
import { runCommand } from "../utils/process.js";
import {
  acquireTemplateFromSources,
  resolveTemplateSources
} from "./template-source.js";
import { UserCancelledError } from "./errors.js";
import { loadTemplateManifest } from "./template-manifest.js";
import { DEFAULT_USER_CONFIG } from "./user-config.js";
import type {
  CatalogTemplate,
  CreateOptions,
  ProjectInput,
  TemplateManifest,
  UserConfig
} from "../types.js";

const ENV_NAMES = ["dev", "sit", "uat", "pre", "prd"] as const;
type PartialProjectInput = Partial<Omit<ProjectInput, "environments">> & {
  environments?: Partial<ProjectInput["environments"]>;
};

export function normalizeProjectName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^[._-]+/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/[-._]+$/, "");
}

function ensureProjectName(value: string): string {
  const name = normalizeProjectName(value);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    throw new Error("项目名称至少需要包含一个字母或数字");
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

async function askText(
  message: string,
  initialValue: string,
  validate?: (value: string | undefined) => string | undefined
): Promise<string> {
  const answer = await prompts.text({
    message,
    initialValue,
    defaultValue: initialValue,
    validate
  });
  if (prompts.isCancel(answer)) throw new UserCancelledError();
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

function parseFeatureIds(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

async function collectTemplateFeatures(
  manifest: TemplateManifest,
  fileConfig: PartialProjectInput,
  options: CreateOptions
): Promise<string[]> {
  const available = manifest.features ?? [];
  if (!available.length) return [];

  const knownIds = new Set(available.map((feature) => feature.id));
  let selected = options.features
    ? parseFeatureIds(options.features)
    : Array.isArray(fileConfig.features)
      ? fileConfig.features
      : available
          .filter((feature) => feature.defaultEnabled || feature.required)
          .map((feature) => feature.id);

  const unknown = selected.filter((id) => !knownIds.has(id));
  if (unknown.length) {
    throw new Error(
      `模板不支持以下能力: ${unknown.join(", ")}。可用能力: ${[...knownIds].join(", ")}`
    );
  }

  if (options.standards === false) {
    selected = selected.filter((id) => {
      const feature = available.find((item) => item.id === id);
      return feature?.package !== "@robot-admin/git-standards";
    });
  }

  for (const feature of available) {
    if (feature.required && !selected.includes(feature.id)) {
      selected.push(feature.id);
    }
  }
  return selected;
}

async function collectProjectInput(
  projectName: string,
  sourceConfig: ProjectInput,
  fileConfig: PartialProjectInput,
  options: CreateOptions,
  userConfig: UserConfig,
  features: string[]
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

  if (options.customize && !options.yes) {
    title = await askText(ui.strong("应用标题"), title, (value) =>
      value?.trim() ? undefined : "应用标题不能为空"
    );
    port = await askText(ui.strong("开发端口"), String(port), (value) => {
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535
        ? undefined
        : "请输入 1024 到 65535 之间的端口";
    });
    localBackendUrl = await askText(
      ui.strong("本地联调地址"),
      localBackendUrl,
      (value) => {
        try {
          const url = new URL(value ?? "");
          return url.protocol === "http:" || url.protocol === "https:"
            ? undefined
            : "请输入完整的 http/https 地址";
        } catch {
          return "请输入完整的 http/https 地址";
        }
      }
    );
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
    npmRegistry: ensureHttpUrl(npmRegistry, "npm registry"),
    jhlcRegistry: ensureHttpUrl(jhlcRegistry, "@jhlc 私有 registry"),
    localBackendUrl: ensureHttpUrl(localBackendUrl, "本地后端地址"),
    localPublicUrl: ensureHttpUrl(localPublicUrl, "本地 public 地址"),
    environments,
    features
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
  templateName: string;
  templateVersion: string;
  category: TemplateManifest["category"];
  source: string;
  features: string[];
  installed: boolean;
  gitInitialized: boolean;
  configuration: Pick<
    ProjectInput,
    "title" | "moduleName" | "devServerPort" | "localBackendUrl"
  >;
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
  const sourceValues = resolveTemplateSources(
    catalogTemplate,
    options.source,
    userConfig.templateSource
  );
  const acquisitionSpinner = options.yes
    ? undefined
    : createBrandSpinner();
  acquisitionSpinner?.start("正在获取并校验模板");
  let acquired: Awaited<ReturnType<typeof acquireTemplateFromSources>>;
  try {
    acquired = await acquireTemplateFromSources(sourceValues, ref, {
      noCache: options.cache === false,
      cacheTtlMinutes: userConfig.cacheTtlMinutes
    });
    acquisitionSpinner?.stop("模板已就绪");
  } catch (error) {
    acquisitionSpinner?.error("模板获取失败");
    throw error;
  }
  const stagingRoot = path.join(
    resolvedCwd,
    `.${projectName}.jh4j-tmp-${process.pid}-${Date.now()}`
  );
  let promoted = false;
  let generationSpinner: ReturnType<typeof prompts.spinner> | undefined;

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
    const features = await collectTemplateFeatures(manifest, fileConfig, options);
    const input = await collectProjectInput(
      projectName,
      {
        ...sourceProjectConfig,
        npmRegistry: manifest.defaults.npmRegistry,
        jhlcRegistry: manifest.defaults.jhlcRegistry
      },
      fileConfig,
      options,
      userConfig,
      features
    );

    const shouldInstall =
      !options.skipInstall && (options.install === true || userConfig.autoInstall);
    const shouldInitializeGit = !options.skipGit && userConfig.autoGit;

    if (options.dryRun) {
      prompts.note(
        [
          `模板: ${manifest.id}@${manifest.version}`,
          `来源: ${acquired.source}`,
          `目标: ${targetRoot}`,
          `模块: ${input.moduleName}`,
          `端口: ${input.devServerPort}`,
          `能力: ${input.features.length ? input.features.join(", ") : "无可选能力"}`,
          `安装依赖: ${shouldInstall ? "是" : "否"}`,
          `初始化 Git: ${shouldInitializeGit ? "是" : "否"}`
        ].join("\n"),
        "Dry Run"
      );
      return {
        targetRoot,
        templateId: manifest.id,
        templateName: manifest.name,
        templateVersion: manifest.version,
        category: manifest.category,
        source: acquired.source,
        features: input.features,
        installed: false,
        gitInitialized: false,
        configuration: {
          title: input.title,
          moduleName: input.moduleName,
          devServerPort: input.devServerPort,
          localBackendUrl: input.localBackendUrl
        }
      };
    }

    generationSpinner = options.yes
      ? undefined
      : createBrandSpinner();
    generationSpinner?.start("正在生成项目文件");
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

    let gitInitialized = false;
    if (shouldInitializeGit) {
      generationSpinner?.message("正在初始化 Git main 仓库");
      await runCommand("git", ["init", "-b", "main"], {
        cwd: targetRoot,
        stdio: "pipe"
      });
      gitInitialized = true;
    }

    if (shouldInstall) {
      generationSpinner?.message("正在安装项目依赖");
      try {
        await runCommand("pnpm", ["install"], {
          cwd: targetRoot,
          stdio: "pipe"
        });
      } catch (error) {
        throw new Error(
          `项目已生成，但依赖安装失败；目录已保留在 ${targetRoot}\n${(error as Error).message}`
        );
      }
    }

    let initialCommitWarning: string | undefined;
    if (shouldInitializeGit) {
      generationSpinner?.message("正在创建初始提交");
      await runCommand("git", ["add", "-A"], { cwd: targetRoot, stdio: "pipe" });
      try {
        await runCommand(
          "git",
          ["commit", "-m", `feat(init): 基于 ${manifest.id}@${manifest.version} 初始化`],
          {
            cwd: targetRoot,
            stdio: "pipe",
            env: { HUSKY: "0" }
          }
        );
      } catch (error) {
        initialCommitWarning = `Git 已初始化，但初始提交未完成：${(error as Error).message}`;
      }
    }

    generationSpinner?.stop("项目文件初始化完成");
    if (initialCommitWarning) prompts.log.warn(initialCommitWarning);

    return {
      targetRoot,
      templateId: manifest.id,
      templateName: manifest.name,
      templateVersion: manifest.version,
      category: manifest.category,
      source: acquired.source,
      features: input.features,
      installed: shouldInstall,
      gitInitialized,
      configuration: {
        title: input.title,
        moduleName: input.moduleName,
        devServerPort: input.devServerPort,
        localBackendUrl: input.localBackendUrl
      }
    };
  } catch (error) {
    generationSpinner?.error(
      promoted ? "项目已生成，后续步骤未完成" : "项目生成失败"
    );
    throw error;
  } finally {
    if (!promoted && existsSync(stagingRoot)) await removePath(stagingRoot);
    await acquired.cleanup();
  }
}
