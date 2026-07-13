import { Command } from "commander";
import { COMMAND_NAME, CLI_VERSION } from "./constants.js";
import { findTemplate } from "./catalog.js";
import { resolveTemplateSource } from "./core/template-source.js";
import { createCommand } from "./commands/create.js";
import { doctorCommand } from "./commands/doctor.js";
import { infoCommand } from "./commands/info.js";
import { listCommand } from "./commands/list.js";
import { validateTemplateCommand } from "./commands/template.js";

export function createProgram(): Command {
  const program = new Command();
  program
    .name(COMMAND_NAME)
    .description("JH4J Cloud 企业内部标准化项目脚手架")
    .version(CLI_VERSION);

  program
    .command("create [name]")
    .description("根据标准模板创建项目")
    .option("-t, --template <id>", "模板 ID")
    .option("--source <path-or-url>", "覆盖模板源（本地目录或 Git URL）")
    .option("--ref <branch-or-tag>", "Git 分支或标签", "main")
    .option("--module <name>", "平台模块标识")
    .option("--title <title>", "系统标题")
    .option("--port <port>", "开发端口")
    .option("--npm-registry <url>", "公共 npm registry")
    .option("--jhlc-registry <url>", "@jhlc 私有 registry")
    .option("--local-backend <url>", "本地后端地址")
    .option("--local-public <url>", "本地 public 地址")
    .option("-y, --yes", "接受模板默认值，非交互创建")
    .option("--dry-run", "只预览，不写入文件")
    .option("--skip-install", "跳过依赖安装")
    .option("--skip-git", "跳过 Git 初始化")
    .option("--force", "覆盖已存在的同名目录")
    .action(createCommand);

  program.command("list").description("列出可用模板").action(listCommand);
  program.command("doctor").description("检查本机环境和模板可用性").action(doctorCommand);
  program
    .command("info [path]")
    .description("显示已生成项目的模板与版本信息")
    .action(infoCommand);

  const template = program.command("template").description("模板维护命令");
  template
    .command("validate [path]")
    .description("校验模板 manifest 与模板契约")
    .action((templatePath?: string) =>
      validateTemplateCommand(
        templatePath ?? resolveTemplateSource(findTemplate())
      )
    );

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  await createProgram().parseAsync(argv);
}
