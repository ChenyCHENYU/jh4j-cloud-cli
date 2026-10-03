import { Command, CommanderError } from "commander";
import { reportError } from "./ui/reporter.js";
import { UserCancelledError } from "./core/errors.js";
import { COMMAND_NAME, CLI_VERSION } from "./constants.js";
import { findTemplate, loadCatalog } from "./catalog.js";
import {
  acquireTemplateFromSources,
  resolveTemplateSources,
} from "./core/template-source.js";
import { loadUserConfig } from "./core/user-config.js";
import { createCommand } from "./commands/create.js";
import { doctorCommand } from "./commands/doctor.js";
import { infoCommand } from "./commands/info.js";
import { listCommand } from "./commands/list.js";
import {
  inspectTemplateCommand,
  validateTemplateCommand,
} from "./commands/template.js";
import {
  configGetCommand,
  configListCommand,
  configResetCommand,
  configSetCommand,
  configUnsetCommand,
} from "./commands/config.js";
import { cacheClearCommand, cacheListCommand } from "./commands/cache.js";

export function createProgram(signal?: AbortSignal): Command {
  const program = new Command();
  program
    .name(COMMAND_NAME)
    .description("JH4J Cloud 企业内部标准化项目脚手架")
    .version(CLI_VERSION)
    .option("--no-color", "禁用终端颜色")
    .exitOverride();
  if (process.argv.includes("--json"))
    program.configureOutput({ outputError: () => {} });

  program
    .command("create [name]")
    .description("根据标准模板创建项目")
    .option(
      "-c, --category <category>",
      "项目类型：frontend、backend 或 mobile",
    )
    .option("-t, --template <id>", "模板 ID")
    .option("--features <ids>", "启用的模板能力，多个 ID 使用逗号分隔")
    .option("--no-standards", "不启用模板提供的 Git/代码标准化能力")
    .option(
      "--source <path-or-url>",
      "覆盖模板源（目录、Git URL 或 tar 压缩包）",
    )
    .option(
      "--ref <branch-or-tag>",
      "Git 分支或标签；默认使用模板 Catalog 配置",
    )
    .option("--module <name>", "平台模块标识")
    .option("--title <title>", "系统标题")
    .option("--port <port>", "开发端口")
    .option("--npm-registry <url>", "npm registry（需包含企业定制包）")
    .option("--jhlc-registry <url>", "@jhlc 私有 registry")
    .option("--local-backend <url>", "本地后端地址")
    .option("--local-public <url>", "本地 public 地址")
    .option("--config <json-file>", "从 JSON 文件读取创建参数")
    .option("-y, --yes", "接受模板默认值，非交互创建")
    .option("--dry-run", "校验并输出生成计划，不创建项目目录")
    .option("--no-input", "禁止交互；缺少必要参数时失败")
    .option("--customize", "展开自定义创建；已提供的字段不再提问")
    .option("--json", "输出可解析的 JSON，禁止交互")
    .option("--quiet", "只输出目标路径和必要诊断，禁止交互")
    .option("--verbose", "显示阶段和子进程日志")
    .option("--offline", "只使用本地模板或已有缓存；安装也使用离线模式")
    .option("--timeout <seconds>", "覆盖各下载/子进程阶段的超时（秒）")
    .option("--save-config <json-file>", "保存实际创建参数，便于重复创建")
    .option("--install", "创建完成后安装依赖（默认不安装）")
    .option("--skip-install", "不安装依赖（兼容旧命令）")
    .option("--skip-git", "跳过 Git 初始化")
    .option("--force", "覆盖已存在的同名目录")
    .option("--no-cache", "不使用已有远程模板缓存")
    .action((name, options) => createCommand(name, options, signal));

  program
    .command("list")
    .description("列出可用模板")
    .option("--json", "输出 JSON")
    .action(listCommand);
  program
    .command("doctor")
    .description("检查本机环境和模板可用性")
    .option("--json", "输出 JSON")
    .option("--network", "实际验证远程模板源（可能下载并写入缓存）")
    .action((options) => doctorCommand(options, signal));
  program
    .command("info [path]")
    .description("显示已生成项目的模板与版本信息")
    .option("--json", "输出 JSON")
    .action(infoCommand);

  const template = program.command("template").description("模板维护命令");
  for (const [name, handler] of [
    ["validate", validateTemplateCommand],
    ["inspect", inspectTemplateCommand],
  ] as const) {
    template
      .command(`${name} [path]`)
      .description(
        name === "validate"
          ? "校验模板契约并执行模板验证脚本"
          : "查看模板运行时、默认值、参数和能力",
      )
      .option("--template <id>", "未提供路径时使用指定模板")
      .option("--json", "输出 JSON")
      .action(
        async (
          templatePath: string | undefined,
          options: { template?: string; json?: boolean },
        ) => {
          if (templatePath) return handler(templatePath, options, signal);
          const config = await loadUserConfig();
          const selected = findTemplate(
            await loadCatalog(config),
            options.template,
          );
          const acquired = await acquireTemplateFromSources(
            resolveTemplateSources(selected, undefined, config.templateSource),
            config.templateRef ?? selected.defaultRef,
            {
              cacheTtlMinutes: config.cacheTtlMinutes,
              signal,
              expectedTemplateId: selected.id,
              expectedCategory: selected.category,
            },
          );
          try {
            return await handler(acquired.root, options, signal);
          } finally {
            await acquired.cleanup();
          }
        },
      );
  }

  const config = program.command("config").description("管理用户默认配置");
  config
    .command("list")
    .option("--json", "输出 JSON")
    .action(configListCommand);
  config.command("get <key>").action(configGetCommand);
  config
    .command("set <key> <value>")
    .action((key, value) => configSetCommand(key, value, signal));
  config
    .command("unset <key>")
    .action((key) => configUnsetCommand(key, signal));
  config.command("reset").action(() => configResetCommand(signal));

  const cache = program.command("cache").description("管理远程模板缓存");
  cache
    .command("list")
    .option("--json", "输出 JSON")
    .action((options) => cacheListCommand(options, signal));
  cache.command("clear").action(() => cacheClearCommand(signal));

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  if (argv.includes("--no-color")) process.env.NO_COLOR = "1";
  const controller = new AbortController();
  const interrupt = (signal: "SIGINT" | "SIGTERM") => {
    if (controller.signal.aborted)
      process.exit(signal === "SIGTERM" ? 143 : 130);
    controller.abort(new UserCancelledError(signal));
  };
  const sigint = () => interrupt("SIGINT");
  const sigterm = () => interrupt("SIGTERM");
  process.on("SIGINT", sigint);
  process.on("SIGTERM", sigterm);
  try {
    await createProgram(controller.signal).parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exitCode = error.exitCode;
      if (error.exitCode !== 0 && argv.includes("--json"))
        reportError(error, { json: true });
    } else
      reportError(error, {
        json: argv.includes("--json"),
        verbose: argv.includes("--verbose"),
      });
  } finally {
    process.removeListener("SIGINT", sigint);
    process.removeListener("SIGTERM", sigterm);
  }
}
