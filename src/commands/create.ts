import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import * as prompts from "@clack/prompts";
import { findTemplate, loadCatalog } from "../catalog.js";
import { CLI_VERSION } from "../constants.js";
import {
  generateProject,
  type GenerateProjectResult,
} from "../core/project-generator.js";
import {
  CliError,
  throwIfAborted,
  UserCancelledError,
} from "../core/errors.js";
import { loadUserConfig } from "../core/user-config.js";
import {
  ensureModuleName,
  ensurePort,
  ensureProjectName,
  inferModuleName,
  loadCreateConfig,
  type PartialProjectInput,
} from "../core/project-input.js";
import { httpUrl } from "../core/validation.js";
import { canPrompt, CreateReporter } from "../ui/reporter.js";
import { writeJson } from "../utils/fs.js";
import { ui } from "../ui/theme.js";
import type {
  CatalogTemplate,
  CreateOptions,
  TemplateCategory,
  TemplateManifest,
  ProjectInput,
} from "../types.js";

const TEMPLATE_PRESENTATION: Record<
  TemplateCategory,
  {
    label: string;
  }
> = {
  frontend: { label: "PC 管理端" },
  backend: { label: "后端服务" },
  mobile: { label: "移动端 H5" },
};

export type CreationMode = "quick" | "custom";

function isCategory(value: string): value is TemplateCategory {
  return Object.hasOwn(TEMPLATE_PRESENTATION, value);
}

export function templatesByCategory(
  templates: CatalogTemplate[],
  category: TemplateCategory,
): CatalogTemplate[] {
  return templates.filter((template) => template.category === category);
}

export function templateOptionsFor(
  templates: CatalogTemplate[],
): Array<{ value: string; label: string; hint: string }> {
  return templates.map((template) => ({
    value: template.id,
    label:
      templates.filter((item) => item.category === template.category).length > 1
        ? template.name
        : TEMPLATE_PRESENTATION[template.category].label,
    hint: template.description,
  }));
}

export function creationModeOptions(): Array<{
  value: CreationMode;
  label: string;
  hint: string;
}> {
  return [
    {
      value: "quick",
      label: "快速创建（推荐）",
      hint: "采用模板推荐配置，立即生成",
    },
    {
      value: "custom",
      label: "自定义创建",
      hint: "设置项目名、标题、端口和联调地址",
    },
  ];
}

async function selectTemplate(
  templates: CatalogTemplate[],
  options: CreateOptions,
  signal?: AbortSignal,
): Promise<CatalogTemplate> {
  if (options.template) {
    const selected = findTemplate(templates, options.template);
    if (options.category && selected.category !== options.category) {
      throw new Error(
        `模板 ${selected.id} 属于 ${selected.category}，与 --category ${options.category} 不一致`,
      );
    }
    return selected;
  }

  if (options.category && !isCategory(options.category)) {
    throw new Error(
      `项目类型无效: ${options.category}。可用值: frontend、backend、mobile`,
    );
  }
  const candidates = options.category
    ? templatesByCategory(templates, options.category)
    : templates;
  if (!candidates.length) {
    throw new Error(
      options.category
        ? `项目类型 ${options.category} 暂无可用模板`
        : "Catalog 中没有可用模板",
    );
  }
  if (options.yes) return findTemplate(candidates);
  if (candidates.length === 1) return candidates[0];

  if (!canPrompt(options))
    throw new CliError(
      "当前环境禁止交互。请通过 --template 或 --category 选择模板，或使用 --yes 接受默认值。",
      "INPUT_REQUIRED",
    );
  const selected = await prompts.select({
    signal,
    message: ui.strong("选择项目模板"),
    options: templateOptionsFor(candidates).map((option) => ({
      ...option,
      label: ui.strong(option.label),
      hint: ui.muted(option.hint),
    })),
    initialValue: candidates[0].id,
  });
  throwIfAborted(signal);
  if (prompts.isCancel(selected)) throw new UserCancelledError();
  return findTemplate(candidates, String(selected));
}

async function selectCreationMode(
  options: CreateOptions,
  signal?: AbortSignal,
): Promise<CreationMode> {
  if (!canPrompt(options)) return "quick";
  if (options.customize) return "custom";
  if (
    [
      options.module,
      options.title,
      options.port,
      options.localBackend,
      options.localPublic,
      options.config,
    ].some((value) => value !== undefined)
  )
    return "quick";
  const selected = await prompts.select({
    signal,
    message: ui.strong("选择创建方式"),
    options: creationModeOptions().map((option) => ({
      ...option,
      label:
        option.value === "quick"
          ? ui.accent(ui.strong(option.label))
          : ui.strong(option.label),
      hint: ui.muted(option.hint),
    })),
    initialValue: "quick",
  });
  throwIfAborted(signal);
  if (prompts.isCancel(selected)) throw new UserCancelledError();
  return selected as CreationMode;
}

export interface CompletionView {
  headline: string;
  overview: Array<{ label: string; value: string }>;
  endpoints: Array<{ label: string; value: string }>;
  profile: Array<{ label: string; value: string }>;
  gitInitialized: boolean;
  installed: boolean;
  nextSteps: string[];
  configFiles: string;
}

export function buildCompletionView(
  projectName: string,
  mode: CreationMode,
  result: GenerateProjectResult,
): CompletionView {
  const nextSteps = result.nextSteps ?? [
    `cd ${projectName}`,
    ...(!result.installed ? ["pnpm install"] : []),
  ];
  return {
    headline: `${projectName} 创建成功`,
    overview: [
      {
        label: "模板",
        value: `${result.templateName} · v${result.templateVersion}`,
      },
      { label: "标题", value: result.configuration.title },
      { label: "方式", value: mode === "quick" ? "快速创建" : "自定义创建" },
    ],
    endpoints: [
      {
        label: "APP",
        value: `http://localhost:${result.configuration.devServerPort}`,
      },
      { label: "API", value: result.configuration.localBackendUrl },
    ],
    profile: [
      ...(result.display?.techStack?.length
        ? [{ label: "技术", value: result.display.techStack.join(" · ") }]
        : []),
      ...(result.display?.corePackages?.length
        ? [{ label: "核心", value: result.display.corePackages.join(" · ") }]
        : []),
      { label: "能力", value: result.features.join(" · ") || "无可选能力" },
      {
        label: "环境",
        value:
          Object.keys(result.plan?.input.environments ?? {})
            .map((name) => name.toUpperCase())
            .join(" · ") || "未声明",
      },
    ],
    gitInitialized: result.gitInitialized,
    installed: result.installed,
    nextSteps,
    configFiles: "project.config.json · .env*",
  };
}

function row(label: string, value: string): string {
  return `${ui.muted(`${label}  `)}${value}`;
}

function renderCompletion(
  projectName: string,
  mode: CreationMode,
  result: GenerateProjectResult,
): void {
  const view = buildCompletionView(projectName, mode, result);
  prompts.log.message(
    [
      ui.strong(view.headline),
      ...view.overview.map((item) => row(item.label, item.value)),
    ],
    {
      symbol: ui.success("◆"),
      secondarySymbol: ui.muted("│"),
      spacing: 1,
    },
  );
  prompts.log.message(
    [
      ui.strong("开发地址"),
      ...view.endpoints.map((item) => row(item.label, ui.accent(item.value))),
    ],
    {
      symbol: ui.accent("◇"),
      secondarySymbol: ui.muted("│"),
      spacing: 1,
    },
  );
  const gitStatus = view.gitInitialized
    ? ui.success("Git main 已初始化")
    : ui.muted("Git 未初始化");
  const dependencyStatus = view.installed
    ? ui.success("依赖已安装")
    : ui.warning("依赖待安装");
  prompts.log.message(
    [
      ui.strong("工程配置"),
      ...view.profile.map((item) => row(item.label, item.value)),
      row("状态", `${gitStatus} ${ui.muted("·")} ${dependencyStatus}`),
    ],
    {
      symbol: ui.secondary("◇"),
      secondarySymbol: ui.muted("│"),
      spacing: 1,
    },
  );
  prompts.outro(ui.success("项目文件已生成"));
  prompts.box(
    [
      "",
      ...view.nextSteps.map(
        (command, index) =>
          ` ${ui.muted(String(index + 1).padStart(2, "0"))}  ${ui.command(command)}`,
      ),
      "",
      ` ${ui.muted("配置")}  ${ui.muted(view.configFiles)}`,
      "",
    ].join("\n"),
    ui.accent(ui.strong(" NEXT STEPS ")),
    {
      rounded: true,
      width: "auto",
      titleAlign: "left",
      titlePadding: 2,
      contentPadding: 1,
      withGuide: false,
      formatBorder: (value) => ui.accent(value),
    },
  );
}

async function ask(
  message: string,
  initialValue: string,
  signal?: AbortSignal,
  validate?: (value: string | undefined) => string | undefined,
): Promise<string> {
  const answer = await prompts.text({
    message: ui.strong(message),
    initialValue,
    defaultValue: initialValue,
    signal,
    validate,
  });
  throwIfAborted(signal);
  if (prompts.isCancel(answer)) throw new UserCancelledError();
  return String(answer).trim() || initialValue;
}
function validation(
  check: (value: unknown) => unknown,
): (value: string | undefined) => string | undefined {
  return (value) => {
    try {
      check(value);
      return undefined;
    } catch (error) {
      return (error as Error).message;
    }
  };
}
async function collectInput(
  input: ProjectInput,
  file: PartialProjectInput,
  manifest: TemplateManifest,
  requestedName: string | undefined,
  mode: CreationMode,
  options: CreateOptions,
  signal?: AbortSignal,
): Promise<ProjectInput> {
  const result = { ...input };
  if (!requestedName && file.projectName === undefined && !options.yes) {
    if (!canPrompt(options))
      throw new CliError(
        "请提供项目名称，或使用 --yes 接受模板默认名称。",
        "INPUT_REQUIRED",
      );
    result.projectName = await ask(
      "项目名称",
      input.projectName,
      signal,
      (value) => {
        try {
          const name = ensureProjectName(value ?? input.projectName);
          const directory = path.resolve(name);
          if (
            existsSync(directory) &&
            !options.force &&
            readdirSync(directory).length
          )
            return "目录已存在且非空，请输入新的项目名";
        } catch (error) {
          return (error as Error).message;
        }
        return undefined;
      },
    );
    result.projectName = ensureProjectName(result.projectName);
    if (options.module === undefined && file.moduleName === undefined)
      result.moduleName = inferModuleName(
        result.projectName,
        manifest.defaults.moduleName,
      );
  }
  if (mode === "custom" && canPrompt(options)) {
    if (
      manifest.parameters?.some(
        (parameter) => parameter.name === "moduleName",
      ) &&
      options.module === undefined &&
      file.moduleName === undefined
    )
      result.moduleName = await ask(
        "模块标识",
        result.moduleName,
        signal,
        validation(ensureModuleName),
      );
    if (options.title === undefined && file.title === undefined)
      result.title = await ask("应用标题", result.title, signal, (value) =>
        value?.trim() ? undefined : "应用标题不能为空",
      );
    if (options.port === undefined && file.devServerPort === undefined)
      result.devServerPort = ensurePort(
        await ask(
          "开发端口",
          String(result.devServerPort),
          signal,
          validation(ensurePort),
        ),
      );
    if (
      options.localBackend === undefined &&
      file.localBackendUrl === undefined
    )
      result.localBackendUrl = await ask(
        "本地联调地址",
        result.localBackendUrl,
        signal,
        validation((value) => httpUrl(value, "本地后端地址")),
      );
    if (
      (manifest.features?.length ?? 0) > 1 &&
      options.features === undefined &&
      file.features === undefined &&
      options.standards !== false
    ) {
      const selected = await prompts.multiselect({
        message: ui.strong("项目能力"),
        signal,
        options: manifest.features!.map((feature) => ({
          value: feature.id,
          label: feature.name,
          hint: feature.description,
        })),
        initialValues: result.features,
        required: false,
      });
      throwIfAborted(signal);
      if (prompts.isCancel(selected)) throw new UserCancelledError();
      result.features = [
        ...new Set([
          ...selected,
          ...manifest
            .features!.filter((feature) => feature.required)
            .map((feature) => feature.id),
        ]),
      ];
    }
  }
  return result;
}
export async function createCommand(
  requestedName: string | undefined,
  options: CreateOptions,
  signal?: AbortSignal,
): Promise<void> {
  if (options.quiet && options.verbose)
    throw new CliError("--quiet 与 --verbose 不能同时使用", "INVALID_INPUT");
  const reporter = new CreateReporter(options, signal);
  try {
    const config = await loadUserConfig();
    const template = await selectTemplate(
      await loadCatalog(config),
      options,
      signal,
    );
    if (reporter.rich)
      prompts.intro(
        `${ui.brand()}  ${ui.badge("CREATE")}  ${ui.muted(`v${CLI_VERSION}`)}`,
      );
    const mode = await selectCreationMode(options, signal);
    // Read the parameter file before fetching so missing noninteractive input fails immediately.
    const file = await loadCreateConfig(options.config, process.cwd());
    if (
      !canPrompt(options) &&
      !options.yes &&
      !requestedName &&
      file.projectName === undefined
    )
      throw new CliError(
        "请提供项目名称，或使用 --yes 接受模板默认名称。",
        "INPUT_REQUIRED",
      );
    const result = await generateProject(
      template,
      requestedName,
      options,
      process.cwd(),
      config,
      {
        signal,
        onProgress: reporter.stage,
        onOutput: reporter.output,
        collectInput: (input, fileConfig, manifest) =>
          collectInput(
            input,
            fileConfig,
            manifest,
            requestedName,
            mode,
            options,
            signal,
          ),
      },
    );
    reporter.pause(options.dryRun ? "生成计划已校验" : "项目文件已生成");
    let savedConfig: string | undefined;
    if (options.saveConfig) {
      savedConfig = path.resolve(options.saveConfig);
      try {
        await writeJson(savedConfig, result.plan!.input);
      } catch (error) {
        const failure = new CliError(
          `创建参数未能保存到 ${savedConfig}: ${(error as Error).message}${options.dryRun ? "" : `\n项目文件已生成并保留在 ${result.targetRoot}。`}`,
          "CONFIG_SAVE_FAILED",
        );
        failure.details = {
          targetRoot: result.targetRoot,
          generated: !options.dryRun,
        };
        throw failure;
      }
    }
    for (const warning of result.warnings ?? []) reporter.warn(warning);
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            dryRun: Boolean(options.dryRun),
            ...(options.dryRun ? { plan: result.plan } : { project: result }),
            ...(savedConfig ? { savedConfig } : {}),
          },
          null,
          2,
        ),
      );
      return;
    }
    if (options.quiet) {
      console.log(result.targetRoot);
      return;
    }
    if (options.dryRun) {
      const plan = result.plan!;
      const text = [
        `模板: ${plan.template.id}@${plan.template.version}`,
        `来源: ${result.source}`,
        `目标: ${plan.targetRoot}`,
        `模块: ${plan.input.moduleName}`,
        `端口: ${plan.input.devServerPort}`,
        `能力: ${plan.input.features.join(", ") || "无"}`,
        `安装依赖: ${plan.installDependencies ? "是" : "否"}`,
        `初始化 Git: ${plan.initializeGit ? "是" : "否"}`,
        `替换已有目录: ${plan.replaceExisting ? "是" : "否"}`,
      ].join("\n");
      if (reporter.rich) {
        prompts.note(text, "Dry Run");
        prompts.outro("Dry Run 完成，未写入项目目录");
      } else console.log(text);
    } else if (reporter.rich)
      renderCompletion(result.plan!.input.projectName, mode, result);
    else
      console.log(
        [
          `${result.plan!.input.projectName} 创建成功`,
          `目录: ${result.targetRoot}`,
          `模板: ${result.templateId}@${result.templateVersion}`,
          `Git: ${result.gitInitialized ? "已初始化" : "未初始化"}；依赖: ${result.installed ? "已安装" : "待安装"}`,
          "下一步:",
          ...(result.nextSteps ?? []),
        ].join("\n"),
      );
    if (savedConfig) console.log(`创建配置已保存: ${savedConfig}`);
  } catch (error) {
    reporter.fail();
    throw error;
  }
}
