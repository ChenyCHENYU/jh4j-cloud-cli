import * as prompts from "@clack/prompts";
import { styleText } from "node:util";
import { findTemplate, loadCatalog } from "../catalog.js";
import {
  generateProject,
  normalizeProjectName,
  type GenerateProjectResult
} from "../core/project-generator.js";
import { UserCancelledError } from "../core/errors.js";
import { loadUserConfig } from "../core/user-config.js";
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
    message: "项目名称",
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
    message: "选择项目模板",
    options: templateOptionsFor(candidates),
    initialValue: candidates[0].id
  });
  if (prompts.isCancel(selected)) throw new UserCancelledError();
  return findTemplate(candidates, String(selected));
}

async function selectCreationMode(options: CreateOptions): Promise<CreationMode> {
  if (options.yes) return "quick";
  const selected = await prompts.select({
    message: "选择创建方式",
    options: creationModeOptions(),
    initialValue: "quick"
  });
  if (prompts.isCancel(selected)) throw new UserCancelledError();
  return selected as CreationMode;
}

function presetsFor(
  category: TemplateCategory,
  features: string[]
): string[] {
  const presets =
    category === "mobile"
      ? [
          "Vue 3 / Vite 7 / Vant 4 / TypeScript",
          "@robot-h5/core 移动端核心能力"
        ]
      : category === "frontend"
        ? [
            "Vue 3 / Vite / Module Federation",
            "@jhlc/common-core 企业基础能力"
          ]
        : ["Java / Spring Cloud 企业服务基础能力"];
  if (features.includes("git-standards")) {
    presets.push("Git 提交规范、代码检查与 Git Hooks");
  }
  presets.push("DEV / SIT / UAT / PRE / PRD 多环境配置");
  return presets;
}

export function buildCompletionContent(
  projectName: string,
  mode: CreationMode,
  result: GenerateProjectResult
): string {
  const nextSteps = [
    `1. cd ${projectName}`,
    ...(!result.installed ? ["2. pnpm install", "3. pnpm dev"] : ["2. pnpm dev"])
  ];
  return [
    `项目：${projectName}`,
    `模板：${result.templateName} · v${result.templateVersion}`,
    `方式：${mode === "quick" ? "快速创建" : "自定义创建"}`,
    `标题：${result.configuration.title}`,
    `开发：http://localhost:${result.configuration.devServerPort}`,
    `联调：${result.configuration.localBackendUrl}`,
    "",
    "已预设",
    ...presetsFor(result.category, result.features).map((item) => `  ✓ ${item}`),
    `  ${result.gitInitialized ? "✓ Git main 仓库已初始化" : "○ 未初始化 Git 仓库"}`,
    `  ${result.installed ? "✓ 项目依赖已安装" : "○ 项目依赖未安装（按需手动安装）"}`,
    "",
    "下一步",
    ...nextSteps.map((step) => `  ${step}`),
    "",
    "配置：project.config.json / .env*"
  ].join("\n");
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

  prompts.box(
    buildCompletionContent(projectName, mode, result),
    styleText(["bold", "green"], " JH4J 项目已就绪 "),
    {
      rounded: true,
      width: "auto",
      titleAlign: "center",
      withGuide: false,
      formatBorder: (value) => styleText("green", value)
    }
  );
  prompts.outro(styleText("green", "创建完成，按上面的步骤启动项目"));
}

export async function createCommand(
  requestedName: string | undefined,
  options: CreateOptions
): Promise<void> {
  const brand = styleText(["bold", "black", "bgCyan"], " JH4J CLOUD ");
  prompts.intro(`${brand}  创建标准项目`);
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
