import * as prompts from "@clack/prompts";
import { createBrandSpinner } from "./theme.js";
import { CliError } from "../core/errors.js";
import { redactText } from "../utils/redact.js";
import type { CreateOptions } from "../types.js";

export function isCi(): boolean {
  return Boolean(
    process.env.CI && !["0", "false"].includes(process.env.CI.toLowerCase()),
  );
}
export function canPrompt(options: CreateOptions): boolean {
  return Boolean(
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    process.env.TERM !== "dumb" &&
    !isCi() &&
    !options.yes &&
    options.input !== false &&
    !options.json &&
    !options.quiet,
  );
}
export class CreateReporter {
  readonly rich: boolean;
  private spinner?: ReturnType<typeof prompts.spinner>;
  constructor(
    private options: CreateOptions,
    private signal?: AbortSignal,
  ) {
    this.rich = Boolean(
      process.stdout.isTTY &&
      process.env.TERM !== "dumb" &&
      (process.stdout.columns ?? 80) >= 50 &&
      !isCi() &&
      !options.json &&
      !options.quiet &&
      !options.verbose,
    );
  }
  stage = (message: string): void => {
    if (this.options.quiet) return;
    if (message === "模板已就绪") {
      this.pause(message);
      return;
    }
    if (this.rich) {
      if (!this.spinner) this.spinner = createBrandSpinner(this.signal);
      if (this.spinner.isCancelled) return;
      if (!this.active) {
        this.spinner.start(message);
        this.active = true;
      } else this.spinner.message(message);
    } else console.error(message);
  };
  private active = false;
  pause(message = ""): void {
    if (this.active) {
      this.spinner?.stop(message);
      this.active = false;
    }
  }
  fail(): void {
    if (this.active) {
      this.spinner?.error("操作未完成");
      this.active = false;
    }
  }
  output = (chunk: string): void => {
    if (this.options.verbose && !this.options.quiet)
      process.stderr.write(redactText(chunk));
  };
  warn(message: string): void {
    console.error(`提示：${redactText(message)}`);
  }
}
export function reportError(
  error: unknown,
  options: { json?: boolean; verbose?: boolean },
): void {
  const failure = error instanceof Error ? error : new Error(String(error));
  const code = error instanceof CliError ? error.code : "OPERATION_FAILED";
  const message = redactText(failure.message);
  if (options.json)
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: {
            code,
            message,
            ...(error instanceof CliError && error.details
              ? { details: error.details }
              : {}),
          },
        },
        null,
        2,
      ),
    );
  console.error(message);
  if (options.verbose && failure.stack)
    console.error(redactText(failure.stack));
  process.exitCode = error instanceof CliError ? error.exitCode : 1;
}
