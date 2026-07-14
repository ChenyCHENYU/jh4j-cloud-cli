import * as prompts from "@clack/prompts";
import { findTemplate, loadCatalog } from "../catalog.js";
import { CLI_VERSION } from "../constants.js";
import {
  generateProject,
  normalizeProjectName,
  type GenerateProjectResult
} from "../core/project-generator.js";
import { UserCancelledError } from "../core/errors.js";
import { loadUserConfig } from "../core/user-config.js";
import { ui } from "../ui/theme.js";
import type {
  CatalogTemplate,
  CreateOptions,
  TemplateCategory
} from "../types.js";

const TEMPLATE_PRESENTATION: Record<
  TemplateCategory,
  {
    label: string;
    hint: string;
  }
> = {
  frontend: { label: "PC 管理端", hint: "Vue 3 · Vite · 微前端" },
  backend: { label: "后端服务", hint: "Java · Spring Cloud · 云原生" },
  mobile: { label: "移动端 H5", hint: "Vue 3 · Vite 7 · Vant 4" }
};

export type CreationMode = "quick" | "custom";

function isCategory(value: string): value is TemplateCategory {
  return Object.hasOwn(TEMPLATE_PRESENTATION, value);
}

export function templatesByCategory(
  templates: CatalogTemplate[],
  category: TemplateCategory
): CatalogTemplate[] {
  return templates.filter((template) => template.category === category);
}

export function templateOptionsFor(
  templates: CatalogTemplate[]
): Array<{ value: string; label: string; hint: string }> {
  return templates.map((template) => ({
    value: template.id,
    label: TEMPLATE_PRESENTATION[template.category].label,
    hint: TEMPLATE_PRESENTATION[template.category].hint
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
      hint: "采用模板推荐配置，立即生成"
    },
    {
      value: "custom",
      label: "自定义创建",
      hint: "设置项目名、标题、端口和联调地址"
    }
  ];
}

export function defaultProjectNameFor(category: TemplateCategory): string {
  if (category === "mobile") return "jh4j-mobile-app";
  if (category === "backend") return "jh4j-service-app";
  return "jh4j-ui-app";
}

export function projectNamePromptOptions(
  category: TemplateCategory
): Parameters<typeof prompts.text>[0] {
  const defaultProjectName = defaultProjectNameFor(category);
  return {
    message: ui.strong("项目名称"),
    initialValue: defaultProjectName,
    defaultValue: defaultProjectName,
    validate(value) {
      return !value || normalizeProjectName(value)
        ? undefined
        : "请输入至少一个字母或数字，例如 jh4j-mobile-app";
    }
  };
}

async function selectTemplate(
  templates: CatalogTemplate[],
  options: CreateOptions
): Promise<CatalogTemplate> {
  if (options.template) {
    const selected = findTemplate(templates, options.template);
    if (options.category && selected.category !== options.category) {
      throw new Error(
        `模板 ${selected.id} 属于 ${selected.category}，与 --category ${options.category} 不一致`
      );
    }
    return selected;
  }

  if (options.category && !isCategory(options.category)) {
    throw new Error(
      `项目类型无效: ${options.category}。可用值: frontend、backend、mobile`
    );
  }
  const candidates = options.category
    ? templatesByCategory(templates, options.category)
    : templates;
  if (!candidates.length) {
    throw new Error(
      options.category
        ? `项目类型 ${options.category} 暂无可用模板`
        : "Catalog 中没有可用模板"
    );
  }
  if (options.yes) return findTemplate(candidates);
  if (candidates.length === 1) return candidates[0];

  const selected = await prompts.select({
    message: ui.strong("选择项目模板"),
    options: templateOptionsFor(candidates).map((option) => ({
      ...option,
      label: ui.strong(option.label),
      hint: ui.muted(option.hint)
    })),
    initialValue: candidates[0].id
  });
  if (prompts.isCancel(selected)) throw new UserCancelledError();
  return findTemplate(candidates, String(selected));
}

async function selectCreationMode(options: CreateOptions): Promise<CreationMode> {
  if (options.yes) return "quick";
  const selected = await prompts.select({
    message: ui.strong("选择创建方式"),
    options: creationModeOptions().map((option) => ({
      ...option,
      label:
        option.value === "quick"
          ? ui.accent(ui.strong(option.label))
          : ui.strong(option.label),
      hint: ui.muted(option.hint)
    })),
    initialValue: "quick"
  });
  if (prompts.isCancel(selected)) throw new UserCancelledError();
  return selected as CreationMode;
}

function profileRowsFor(
  category: TemplateCategory,
  features: string[]
): Array<{ label: string; value: string }> {
  const rows =
    category === "mobile"
      ? [
          { label: "技术", value: "Vue 3 · Vite 7 · Vant 4 · TypeScript" },
          { label: "核心", value: "@robot-h5/core" }
        ]
      : category === "frontend"
        ? [
            { label: "技术", value: "Vue 3 · Vite · Module Federation" },
            { label: "核心", value: "@jhlc/common-core" }
          ]
        : [{ label: "技术", value: "Java · Spring Cloud" }];
  if (features.includes("git-standards")) {
    rows.push({ label: "规范", value: "Commitizen · Commitlint · Husky · ESLint" });
  }
  rows.push({ label: "环境", value: "DEV · SIT · UAT · PRE · PRD" });
  return rows;
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
  result: GenerateProjectResult
): CompletionView {
  const nextSteps = [
    `cd ${projectName}`,
    ...(!result.installed ? ["pnpm install", "pnpm dev"] : ["pnpm dev"])
  ];
  return {
    headline: `${projectName} 创建成功`,
    overview: [
      {
        label: "模板",
        value: `${result.templateName} · v${result.templateVersion}`
      },
      { label: "标题", value: result.configuration.title },
      { label: "方式", value: mode === "quick" ? "快速创建" : "自定义创建" }
    ],
    endpoints: [
      {
        label: "APP",
        value: `http://localhost:${result.configuration.devServerPort}`
      },
      { label: "API", value: result.configuration.localBackendUrl }
    ],
    profile: profileRowsFor(result.category, result.features),
    gitInitialized: result.gitInitialized,
    installed: result.installed,
    nextSteps,
    configFiles: "project.config.json · .env*"
  };
}

function row(label: string, value: string): string {
  return `${ui.muted(`${label}  `)}${value}`;
}

function renderCompletion(
  projectName: string,
  mode: CreationMode,
  result: GenerateProjectResult
): void {
  const view = buildCompletionView(projectName, mode, result);
  prompts.log.message(
    [
      ui.strong(view.headline),
      ...view.overview.map((item) => row(item.label, item.value))
    ],
    {
      symbol: ui.success("◆"),
      secondarySymbol: ui.muted("│"),
      spacing: 1
    }
  );
  prompts.log.message(
    [
      ui.strong("本地服务"),
      ...view.endpoints.map((item) => row(item.label, ui.accent(item.value)))
    ],
    {
      symbol: ui.accent("◇"),
      secondarySymbol: ui.muted("│"),
      spacing: 1
    }
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
      row("状态", `${gitStatus} ${ui.muted("·")} ${dependencyStatus}`)
    ],
    {
      symbol: ui.secondary("◇"),
      secondarySymbol: ui.muted("│"),
      spacing: 1
    }
  );
  prompts.outro(`${ui.success("READY")} ${ui.muted("· 项目已准备就绪")}`);
  prompts.box(
    [
      "",
      ...view.nextSteps.map(
        (command, index) =>
          ` ${ui.muted(String(index + 1).padStart(2, "0"))}  ${ui.command(command)}`
      ),
      "",
      ` ${ui.muted("配置")}  ${ui.muted(view.configFiles)}`,
      ""
    ].join("\n"),
    ui.accent(ui.strong(" NEXT STEPS ")),
    {
      rounded: true,
      width: "auto",
      titleAlign: "left",
      titlePadding: 2,
      contentPadding: 1,
      withGuide: false,
      formatBorder: (value) => ui.accent(value)
    }
  );
}

async function executeCreateCommand(
  requestedName: string | undefined,
  options: CreateOptions
): Promise<void> {
  const userConfig = await loadUserConfig();
  const catalog = await loadCatalog(userConfig);
  const template = await selectTemplate(catalog, options);
  const mode = await selectCreationMode(options);

  const defaultProjectName = defaultProjectNameFor(template.category);
  let rawProjectName = requestedName;
  if (mode === "custom" && !rawProjectName && !options.yes) {
    const answer = await prompts.text(
      projectNamePromptOptions(template.category)
    );
    if (prompts.isCancel(answer)) throw new UserCancelledError();
    rawProjectName = String(answer).trim() || defaultProjectName;
  }
  rawProjectName ??= defaultProjectName;
  const projectName = normalizeProjectName(rawProjectName);
  if (!projectName) {
    throw new Error("项目名称至少需要包含一个字母或数字");
  }
  if (projectName !== rawProjectName) {
    prompts.log.info(`项目名称已规范化：${projectName}`);
  }

  const result = await generateProject(
    template,
    projectName,
    { ...options, customize: mode === "custom" },
    process.cwd(),
    userConfig
  );
  if (options.dryRun) {
    prompts.outro("Dry Run 完成，未写入任何项目文件");
    return;
  }

  renderCompletion(projectName, mode, result);
}

export async function createCommand(
  requestedName: string | undefined,
  options: CreateOptions
): Promise<void> {
  prompts.intro(
    `${ui.brand()}  ${ui.badge("CREATE")}  ${ui.muted(`v${CLI_VERSION}`)}`
  );
  try {
    await executeCreateCommand(requestedName, options);
  } catch (error) {
    if (error instanceof UserCancelledError) {
      prompts.cancel("已取消创建，未写入任何项目文件");
      return;
    }
    throw error;
  }
}
