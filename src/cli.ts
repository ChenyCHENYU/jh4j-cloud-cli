import { Command } from "commander";
import { COMMAND_NAME, CLI_VERSION } from "./constants.js";
import { findTemplate, loadCatalog } from "./catalog.js";
import { resolveTemplateSource } from "./core/template-source.js";
import { loadUserConfig } from "./core/user-config.js";
import { createCommand } from "./commands/create.js";
import { doctorCommand } from "./commands/doctor.js";
import { infoCommand } from "./commands/info.js";
import { listCommand } from "./commands/list.js";
import { validateTemplateCommand } from "./commands/template.js";
import {
  configGetCommand,
  configListCommand,
  configResetCommand,
  configSetCommand,
  configUnsetCommand
} from "./commands/config.js";
import { cacheClearCommand, cacheListCommand } from "./commands/cache.js";

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
    .option("--config <json-file>", "从 JSON 文件读取创建参数")
    .option("-y, --yes", "接受模板默认值，非交互创建")
    .option("--dry-run", "只预览，不写入文件")
    .option("--skip-install", "跳过依赖安装")
    .option("--skip-git", "跳过 Git 初始化")
    .option("--force", "覆盖已存在的同名目录")
    .option("--no-cache", "不使用已有远程模板缓存")
    .action(createCommand);

  program
    .command("list")
    .description("列出可用模板")
    .option("--json", "输出 JSON")
    .action(listCommand);
  program
    .command("doctor")
    .description("检查本机环境和模板可用性")
    .option("--json", "输出 JSON")
    .action(doctorCommand);
  program
    .command("info [path]")
    .description("显示已生成项目的模板与版本信息")
    .option("--json", "输出 JSON")
    .action(infoCommand);

  const template = program.command("template").description("模板维护命令");
  template
    .command("validate [path]")
    .description("校验模板 manifest 与模板契约")
    .action(async (templatePath?: string) => {
      if (templatePath) return validateTemplateCommand(templatePath);
      const config = await loadUserConfig();
      const selected = findTemplate(await loadCatalog(config));
      return validateTemplateCommand(
        resolveTemplateSource(selected, undefined, config.templateSource)
      );
    });

  const config = program.command("config").description("管理用户默认配置");
  config
    .command("list")
    .option("--json", "输出 JSON")
    .action(configListCommand);
  config.command("get <key>").action(configGetCommand);
  config.command("set <key> <value>").action(configSetCommand);
  config.command("unset <key>").action(configUnsetCommand);
  config.command("reset").action(configResetCommand);

  const cache = program.command("cache").description("管理远程模板缓存");
  cache
    .command("list")
    .option("--json", "输出 JSON")
    .action(cacheListCommand);
  cache.command("clear").action(cacheClearCommand);

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  await createProgram().parseAsync(argv);
}
