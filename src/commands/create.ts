import * as prompts from "@clack/prompts";
import { findTemplate, loadCatalog } from "../catalog.js";
import { generateProject } from "../core/project-generator.js";
import { loadUserConfig } from "../core/user-config.js";
import type { CatalogTemplate, CreateOptions } from "../types.js";

async function selectTemplate(
  templates: CatalogTemplate[],
  requestedId: string | undefined,
  nonInteractive: boolean
): Promise<CatalogTemplate> {
  if (requestedId || nonInteractive || templates.length === 1) {
    return findTemplate(templates, requestedId);
  }
  const selected = await prompts.select({
    message: "选择项目模板",
    options: templates.map((template) => ({
      value: template.id,
      label: template.name,
      hint: `${template.category} · ${template.status}`
    }))
  });
  if (prompts.isCancel(selected)) throw new Error("用户取消创建");
  return findTemplate(templates, String(selected));
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

  const template = await selectTemplate(
    catalog,
    options.template,
    Boolean(options.yes)
  );
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
