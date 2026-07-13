import * as prompts from "@clack/prompts";
import { findTemplate, loadCatalog } from "../catalog.js";
import { generateProject } from "../core/project-generator.js";
import { loadUserConfig } from "../core/user-config.js";
import type {
  CatalogTemplate,
  CreateOptions,
  TemplateCategory
} from "../types.js";

const CATEGORY_OPTIONS: Array<{
  value: TemplateCategory;
  label: string;
  hint: string;
}> = [
  { value: "frontend", label: "前端", hint: "PC、Web 与微前端应用" },
  { value: "backend", label: "后端", hint: "Java 服务与云原生应用" },
  { value: "mobile", label: "移动端", hint: "App、H5 与跨端应用" }
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

  const selected = await prompts.select({
    message: "选择项目类型",
    options: CATEGORY_OPTIONS.map((item) => {
      const count = templatesByCategory(templates, item.value).length;
      return {
        value: item.value,
        label: item.label,
        hint: count ? `${item.hint} · ${count} 个模板` : `${item.hint} · 暂未提供`,
        disabled: count === 0
      };
    })
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

  const selected = await prompts.select({
    message: "选择项目模板",
    options: candidates.map((template) => ({
      value: template.id,
      label: template.name,
      hint: `${template.status} · ${template.description}`
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

  let projectName = requestedName;
  if (!projectName) {
    if (options.yes) throw new Error("非交互模式必须指定项目名称");
    const answer = await prompts.text({
      message: "项目名称",
      placeholder: "jh4j-ui-app"
    });
    if (prompts.isCancel(answer)) throw new Error("用户取消创建");
    projectName = String(answer);
  }

  const template = await selectTemplate(catalog, options);
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
      `能力: ${result.features.length ? result.features.join(", ") : "无可选能力"}`,
      `依赖: ${result.installed ? "已安装" : "未安装"}`,
      `Git: ${result.gitInitialized ? "main 已初始化" : "未初始化"}`,
      "",
      `cd ${projectName}`,
      ...(!result.installed ? ["pnpm install"] : []),
      "pnpm dev"
    ].join("\n"),
    "创建成功"
  );
  prompts.outro("Happy coding!");
}
