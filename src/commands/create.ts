import * as prompts from "@clack/prompts";
import { findTemplate } from "../catalog.js";
import { generateProject } from "../core/project-generator.js";
import type { CreateOptions } from "../types.js";

export async function createCommand(
  requestedName: string | undefined,
  options: CreateOptions
): Promise<void> {
  prompts.intro("JH4J Cloud 项目创建");

  let projectName = requestedName;
  if (!projectName) {
    if (options.yes) {
      throw new Error("非交互模式必须指定项目名称");
    }
    const answer = await prompts.text({
      message: "项目名称",
      placeholder: "jh4j-ui-app"
    });
    if (prompts.isCancel(answer)) throw new Error("用户取消创建");
    projectName = String(answer);
  }

  const template = findTemplate(options.template);
  const result = await generateProject(template, projectName, options);
  if (options.dryRun) {
    prompts.outro("Dry Run 完成，未写入任何项目文件");
    return;
  }

  prompts.note(
    [
      `目录: ${result.targetRoot}`,
      `模板: ${result.templateId}@${result.templateVersion}`,
      `来源: ${result.source}`,
      "",
      `cd ${projectName}`,
      ...(options.skipInstall ? ["pnpm install"] : []),
      "pnpm dev"
    ].join("\n"),
    "创建成功"
  );
  prompts.outro("Happy coding!");
}
