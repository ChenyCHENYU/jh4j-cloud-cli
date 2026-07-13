import * as prompts from "@clack/prompts";
import { findTemplate, loadCatalog } from "../catalog.js";
import {
  generateProject,
  normalizeProjectName
} from "../core/project-generator.js";
import { loadUserConfig } from "../core/user-config.js";
import type {
  CatalogTemplate,
  CreateOptions,
  TemplateCategory
} from "../types.js";

const CATEGORY_OPTIONS: Array<{
  value: TemplateCategory;
  label: string;
}> = [
  { value: "frontend", label: "PC 前端 · Vue 3 / 微前端" },
  { value: "backend", label: "后端服务 · Java / 云原生" },
  { value: "mobile", label: "移动端 H5 · Vue 3 / Vant" }
];

function isCategory(value: string): value is TemplateCategory {
  return CATEGORY_OPTIONS.some((item) => item.value === value);
}

export function templatesByCategory(
  templates: CatalogTemplate[],
  category: TemplateCategory
): CatalogTemplate[] {
  return templates.filter((template) => template.category === category);
}

export function categoryOptionsFor(
  templates: CatalogTemplate[]
): Array<{ value: TemplateCategory; label: string }> {
  return CATEGORY_OPTIONS.filter(
    (item) => templatesByCategory(templates, item.value).length > 0
  ).map(({ value, label }) => ({ value, label }));
}

async function selectCategory(
  templates: CatalogTemplate[],
  requestedCategory: string | undefined,
  nonInteractive: boolean
): Promise<TemplateCategory> {
  if (requestedCategory) {
    if (!isCategory(requestedCategory)) {
      throw new Error(
        `项目类型无效: ${requestedCategory}。可用值: frontend、backend、mobile`
      );
    }
    if (!templatesByCategory(templates, requestedCategory).length) {
      throw new Error(`项目类型 ${requestedCategory} 暂无可用模板`);
    }
    return requestedCategory;
  }

  const firstAvailable = CATEGORY_OPTIONS.find(
    (item) => templatesByCategory(templates, item.value).length > 0
  );
  if (!firstAvailable) throw new Error("Catalog 中没有可用模板");
  if (nonInteractive) return firstAvailable.value;

  const availableOptions = categoryOptionsFor(templates);
  if (availableOptions.length === 1) return availableOptions[0].value;

  const selected = await prompts.select({
    message: "选择项目类型",
    options: availableOptions.map((item) => ({
      value: item.value,
      label: item.label
    }))
  });
  if (prompts.isCancel(selected)) throw new Error("用户取消创建");
  return selected as TemplateCategory;
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

  const category = await selectCategory(
    templates,
    options.category,
    Boolean(options.yes)
  );
  const candidates = templatesByCategory(templates, category);
  if (options.yes) return findTemplate(candidates);
  if (candidates.length === 1) {
    const selected = candidates[0];
    prompts.log.info(`使用模板：${selected.name}`);
    return selected;
  }

  const selected = await prompts.select({
    message: "选择项目模板",
    options: candidates.map((template) => ({
      value: template.id,
      label: `${template.name} · ${template.description}`
    }))
  });
  if (prompts.isCancel(selected)) throw new Error("用户取消创建");
  return findTemplate(candidates, String(selected));
}

export async function createCommand(
  requestedName: string | undefined,
  options: CreateOptions
): Promise<void> {
  prompts.intro("JH4J Cloud 项目创建");
  const userConfig = await loadUserConfig();
  const catalog = await loadCatalog(userConfig);
  const template = await selectTemplate(catalog, options);

  let projectName = requestedName;
  if (!projectName) {
    if (options.yes) throw new Error("非交互模式必须指定项目名称");
    const defaultProjectName =
      template.category === "mobile" ? "jh4j-mobile-app" : "jh4j-ui-app";
    const answer = await prompts.text({
      message: "项目名称",
      placeholder: defaultProjectName,
      defaultValue: defaultProjectName,
      validate(value) {
        return !value || normalizeProjectName(value)
          ? undefined
          : "请输入至少一个字母或数字，例如 jh4j-mobile-app";
      }
    });
    if (prompts.isCancel(answer)) throw new Error("用户取消创建");
    projectName = String(answer).trim() || defaultProjectName;
  }

  const rawProjectName = projectName;
  projectName = normalizeProjectName(rawProjectName);
  if (!projectName) {
    throw new Error("项目名称至少需要包含一个字母或数字");
  }
  if (projectName !== rawProjectName) {
    prompts.log.info(`项目名称已规范化：${projectName}`);
  }

  const result = await generateProject(
    template,
    projectName,
    options,
    process.cwd(),
    userConfig
  );
  if (options.dryRun) {
    prompts.outro("Dry Run 完成，未写入任何项目文件");
    return;
  }

  prompts.note(
    [
      `目录: ${result.targetRoot}`,
      `模板: ${result.templateId}@${result.templateVersion}`,
      `来源: ${result.source}`,
      `默认能力: ${result.features.length ? result.features.join(", ") : "无"}`,
      `依赖: ${result.installed ? "已安装" : "未安装（默认由开发者手动安装）"}`,
      `Git: ${result.gitInitialized ? "main 已初始化" : "未初始化"}`,
      "",
      "需要调整配置时，直接修改生成项目中的：",
      "  project.config.json  项目、联调与环境参数",
      "  .npmrc               Registry 配置",
      "  .env*                各端运行环境配置（如存在）",
      "",
      `cd ${projectName}`,
      ...(!result.installed ? ["pnpm install"] : []),
      "pnpm dev"
    ].join("\n"),
    "创建成功"
  );
  prompts.outro("项目已准备好");
}
