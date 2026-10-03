import { existsSync } from "node:fs";
import { lstat, mkdtemp, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { CLI_NAME, CLI_VERSION } from "../constants.js";
import {
  assertContainedFile,
  copyTemplateTree,
  isDirectoryEmpty,
  readJson,
  removePath,
  writeJson,
} from "../utils/fs.js";
import { withFileLock } from "../utils/file-lock.js";
import { runCommand } from "../utils/process.js";
import {
  acquireTemplateFromSources,
  resolveTemplateSources,
} from "./template-source.js";
import { CliError, throwIfAborted } from "./errors.js";
import { loadTemplateManifest } from "./template-manifest.js";
import { DEFAULT_USER_CONFIG } from "./user-config.js";
import {
  loadCreateConfig,
  resolveProjectInput,
  validateProjectInput,
  validateSourceProjectConfig,
  validateTemplateParameters,
  type PartialProjectInput,
} from "./project-input.js";
import {
  parseTemplateEntry,
  record,
  validateMetadata,
  validateUserConfig,
} from "./validation.js";
import type {
  CatalogTemplate,
  CreateOptions,
  ProjectInput,
  TemplateManifest,
  TemplateProvenance,
  UserConfig,
} from "../types.js";
export { normalizeProjectName } from "./project-input.js";

export interface CreatePlan {
  targetRoot: string;
  template: {
    id: string;
    name: string;
    version: string;
    category: TemplateManifest["category"];
    runtime: TemplateManifest["runtime"];
  };
  provenance: TemplateProvenance;
  input: ProjectInput;
  installDependencies: boolean;
  initializeGit: boolean;
  replaceExisting: boolean;
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
  plan?: CreatePlan;
  warnings?: string[];
  nextSteps?: string[];
  display?: TemplateManifest["display"];
}
export interface GenerationContext {
  signal?: AbortSignal;
  onProgress?: (stage: string) => void;
  onOutput?: (chunk: string) => void;
  collectInput?: (
    input: ProjectInput,
    file: PartialProjectInput,
    manifest: TemplateManifest,
  ) => Promise<ProjectInput>;
}
export function parseTimeout(value?: string): number | undefined {
  if (value === undefined) return undefined;
  if (
    !/^\d+(?:\.\d+)?$/.test(value) ||
    Number(value) <= 0 ||
    Number(value) > 86400
  )
    throw new CliError(
      "--timeout 必须是 0 到 86400 之间的正数（秒）",
      "INVALID_INPUT",
    );
  return Math.max(1, Math.round(Number(value) * 1000));
}
async function checkTarget(targetRoot: string, force: boolean): Promise<void> {
  let info;
  try {
    info = await lstat(targetRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new CliError(
      `目标必须是普通目录，不能覆盖文件或符号链接: ${targetRoot}`,
      "INVALID_INPUT",
    );
  if (!(await isDirectoryEmpty(targetRoot)) && !force)
    throw new CliError(
      `目标目录已存在且非空: ${targetRoot}。请更换项目名，或明确使用 --force 替换。`,
      "TARGET_EXISTS",
    );
}
async function promoteStaging(
  stagingRoot: string,
  targetRoot: string,
  force: boolean,
  warnings: string[],
): Promise<void> {
  await checkTarget(targetRoot, force);
  if (!existsSync(targetRoot)) {
    await rename(stagingRoot, targetRoot);
    return;
  }
  const backup = `${targetRoot}.jh4j-backup-${path.basename(stagingRoot)}`;
  await rename(targetRoot, backup);
  try {
    await rename(stagingRoot, targetRoot);
  } catch (error) {
    await rename(backup, targetRoot);
    throw error;
  }
  await removePath(backup).catch(() =>
    warnings.push(`旧目录备份未能自动清理: ${backup}`),
  );
}
function nextSteps(
  input: ProjectInput,
  pkg: Record<string, unknown>,
  manifest: TemplateManifest,
  installed: boolean,
): string[] {
  const scripts = record(pkg.scripts ?? {}, "package.scripts");
  const start =
    manifest.display?.startScript ??
    (typeof scripts.dev === "string" ? "dev" : undefined);
  return [
    `cd ${input.projectName}`,
    ...(!installed ? ["pnpm install"] : []),
    ...(start && typeof scripts[start] === "string" ? [`pnpm ${start}`] : []),
  ];
}
export async function generateProject(
  catalogTemplate: CatalogTemplate,
  requestedProjectName: string | undefined,
  options: CreateOptions,
  cwd = process.cwd(),
  configuredUserConfig: UserConfig = DEFAULT_USER_CONFIG,
  context: GenerationContext = {},
): Promise<GenerateProjectResult> {
  const userConfig = { ...DEFAULT_USER_CONFIG, ...configuredUserConfig };
  validateUserConfig(userConfig);
  const timeoutMs = parseTimeout(options.timeout);
  if (options.install && options.skipInstall)
    throw new CliError(
      "--install 与 --skip-install 不能同时使用",
      "INVALID_INPUT",
    );
  if (options.offline && options.cache === false)
    throw new CliError("--offline 与 --no-cache 不能同时使用", "INVALID_INPUT");
  throwIfAborted(context.signal);
  const resolvedCwd = await realpath(cwd);
  const fileConfig = await loadCreateConfig(options.config, resolvedCwd);
  context.onProgress?.("正在获取并校验模板");
  const acquired = await acquireTemplateFromSources(
    resolveTemplateSources(
      catalogTemplate,
      options.source,
      userConfig.templateSource,
    ),
    options.ref ?? userConfig.templateRef ?? catalogTemplate.defaultRef,
    {
      noCache: options.cache === false,
      cacheTtlMinutes: userConfig.cacheTtlMinutes,
      signal: context.signal,
      timeoutMs,
      offline: options.offline,
      expectedTemplateId: catalogTemplate.id,
      expectedCategory: catalogTemplate.category,
    },
  );
  const warnings: string[] = [];
  let stagingRoot: string | undefined;
  let promoted = false;
  let targetRoot: string | undefined;
  try {
    context.onProgress?.("模板已就绪");
    const manifest = await loadTemplateManifest(acquired.root);
    if (manifest.category !== catalogTemplate.category)
      throw new CliError(
        "模板 Manifest 与 Catalog 的 category 不一致",
        "INVALID_TEMPLATE",
      );
    const sourceConfig = validateSourceProjectConfig(
      await readJson(path.join(acquired.root, "project.config.json")),
      manifest,
    );
    let input = resolveProjectInput(
      manifest,
      sourceConfig,
      fileConfig,
      requestedProjectName,
      options,
      userConfig,
    );
    if (context.collectInput)
      input = validateProjectInput(
        await context.collectInput(input, fileConfig, manifest),
      );
    validateTemplateParameters(input, manifest);
    throwIfAborted(context.signal);
    targetRoot = path.join(resolvedCwd, input.projectName);
    if (path.dirname(targetRoot) !== resolvedCwd)
      throw new CliError("仅允许在当前目录创建一级项目目录", "INVALID_INPUT");
    await checkTarget(targetRoot, Boolean(options.force));
    const shouldInstall =
      !options.skipInstall &&
      (options.install === true || userConfig.autoInstall);
    const shouldGit = !options.skipGit && userConfig.autoGit;
    const plan: CreatePlan = {
      targetRoot,
      template: {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        category: manifest.category,
        runtime: manifest.runtime,
      },
      provenance: acquired.provenance,
      input,
      installDependencies: shouldInstall,
      initializeGit: shouldGit,
      replaceExisting: Boolean(options.force && existsSync(targetRoot)),
    };
    const base = {
      targetRoot,
      templateId: manifest.id,
      templateName: manifest.name,
      templateVersion: manifest.version,
      category: manifest.category,
      source: acquired.source,
      features: input.features,
      configuration: {
        title: input.title,
        moduleName: input.moduleName,
        devServerPort: input.devServerPort,
        localBackendUrl: input.localBackendUrl,
      },
      plan,
      warnings,
      display: manifest.display,
    };
    const sourcePackage = record(
      await readJson(path.join(acquired.root, "package.json")),
      "package.json",
    );
    if (options.dryRun)
      return {
        ...base,
        installed: false,
        gitInitialized: false,
        nextSteps: nextSteps(input, sourcePackage, manifest, shouldInstall),
      };
    const destination = targetRoot;
    return await withFileLock(
      path.join(resolvedCwd, `.${input.projectName}.jh4j-lock`),
      async () => {
        await checkTarget(destination, Boolean(options.force));
        stagingRoot = await mkdtemp(
          path.join(resolvedCwd, `.${input.projectName}.jh4j-tmp-`),
        );
        context.onProgress?.("正在生成项目文件");
        await copyTemplateTree(acquired.root, stagingRoot, {
          signal: context.signal,
          exclude: [path.normalize(manifest.generatedMetadata)],
        });
        const inputFile = path.join(stagingRoot, ".jh4j-cli-input.json");
        await writeJson(inputFile, input);
        const entry = parseTemplateEntry(manifest.entry.nonInteractive);
        const script = await assertContainedFile(
          stagingRoot,
          entry.script,
          "初始化入口",
        );
        try {
          await runCommand(
            process.execPath,
            [
              script,
              ...(entry.args ?? []),
              ...(entry.args?.includes("--yes") ? [] : ["--yes"]),
              "--config",
              inputFile,
              "--created-by",
              `${CLI_NAME}@${CLI_VERSION}`,
            ],
            {
              cwd: stagingRoot,
              stdio: "pipe",
              signal: context.signal,
              timeoutMs: timeoutMs ?? 120_000,
              onOutput: context.onOutput,
            },
          );
        } finally {
          await rm(inputFile, { force: true });
        }
        throwIfAborted(context.signal);
        const metadataFile = await assertContainedFile(
          stagingRoot,
          manifest.generatedMetadata,
          "生成元数据",
        );
        const metadata = validateMetadata(await readJson(metadataFile));
        if (
          metadata.template.id !== manifest.id ||
          metadata.template.version !== manifest.version ||
          metadata.createdBy !== `${CLI_NAME}@${CLI_VERSION}`
        )
          throw new CliError(
            "初始化生成的模板或 CLI 来源信息不一致",
            "INVALID_METADATA",
          );
        for (const key of [
          "projectName",
          "title",
          "devServerPort",
          "features",
        ] as const)
          if (!isDeepStrictEqual(metadata.parameters[key], input[key]))
            throw new CliError(
              `生成元数据参数 ${key} 与创建计划不一致`,
              "INVALID_METADATA",
            );
        for (const [key, value] of Object.entries(metadata.parameters))
          if (
            Object.hasOwn(input, key) &&
            !isDeepStrictEqual(
              value,
              (input as unknown as Record<string, unknown>)[key],
            )
          )
            throw new CliError(
              `生成元数据参数 ${key} 与创建计划不一致`,
              "INVALID_METADATA",
            );
        const generatedConfig = record(
          await readJson(
            await assertContainedFile(
              stagingRoot,
              "project.config.json",
              "生成配置",
            ),
          ),
          "生成配置",
        );
        for (const key of [
          "projectName",
          "moduleName",
          "title",
          "devServerPort",
          "localBackendUrl",
          "localPublicUrl",
          "features",
          "environments",
        ] as const)
          if (!isDeepStrictEqual(generatedConfig[key], input[key]))
            throw new CliError(
              `生成配置 ${key} 与创建计划不一致`,
              "INVALID_TEMPLATE",
            );
        await writeJson(metadataFile, {
          ...metadata,
          parameters: { ...input, ...metadata.parameters },
          provenance: acquired.provenance,
        });
        throwIfAborted(context.signal);
        await promoteStaging(
          stagingRoot,
          destination,
          Boolean(options.force),
          warnings,
        );
        promoted = true;
        let gitInitialized = false;
        if (shouldGit) {
          context.onProgress?.("正在初始化 Git main 仓库");
          await runCommand("git", ["init", "-b", "main"], {
            cwd: destination,
            stdio: "pipe",
            signal: context.signal,
            timeoutMs: timeoutMs ?? 30_000,
          });
          gitInitialized = true;
        }
        if (shouldInstall) {
          context.onProgress?.("正在安装项目依赖");
          await runCommand(
            "pnpm",
            ["install", ...(options.offline ? ["--offline"] : [])],
            {
              cwd: destination,
              stdio: "pipe",
              signal: context.signal,
              timeoutMs: timeoutMs ?? 600_000,
              onOutput: context.onOutput,
            },
          );
        }
        if (shouldGit) {
          context.onProgress?.("正在创建初始提交");
          await runCommand("git", ["add", "-A"], {
            cwd: destination,
            stdio: "pipe",
            signal: context.signal,
            timeoutMs: timeoutMs ?? 30_000,
          });
          try {
            await runCommand(
              "git",
              [
                "commit",
                "-m",
                `feat(init): 基于 ${manifest.id}@${manifest.version} 初始化`,
              ],
              {
                cwd: destination,
                stdio: "pipe",
                env: { HUSKY: "0" },
                signal: context.signal,
                timeoutMs: timeoutMs ?? 30_000,
              },
            );
          } catch (error) {
            throwIfAborted(context.signal);
            warnings.push(
              `Git 已初始化，但初始提交未完成：${(error as Error).message}`,
            );
          }
        }
        throwIfAborted(context.signal);
        const pkg = record(
          await readJson(path.join(destination, "package.json")),
          "package.json",
        );
        return {
          ...base,
          installed: shouldInstall,
          gitInitialized,
          nextSteps: nextSteps(input, pkg, manifest, shouldInstall),
        };
      },
      { signal: context.signal },
    );
  } catch (error) {
    if (promoted) {
      const original =
        error instanceof CliError
          ? error
          : new CliError((error as Error).message);
      const retained = new CliError(
        `${original.message}\n项目文件已生成并保留在 ${targetRoot}，可进入目录继续安装依赖或初始化 Git。`,
        original.code,
        original.exitCode,
        { cause: original },
      );
      retained.details = { targetRoot, generated: true };
      throw retained;
    }
    throw error;
  } finally {
    if (!promoted && stagingRoot)
      await removePath(stagingRoot).catch(() =>
        warnings.push(`临时目录未能清理: ${stagingRoot}`),
      );
    await acquired.cleanup().catch(() => warnings.push("模板快照未能自动清理"));
  }
}
