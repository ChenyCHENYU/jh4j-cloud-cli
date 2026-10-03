import { spawn } from "node:child_process";
import {
  CliError,
  throwIfAborted,
  UserCancelledError,
} from "../core/errors.js";
import { redactText } from "./redact.js";

export interface RunCommandOptions {
  cwd?: string;
  stdio?: "inherit" | "pipe";
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxOutputBytes?: number;
  onOutput?: (chunk: string, stream: "stdout" | "stderr") => void;
}

export function platformCommand(command: string): string {
  return process.platform === "win32" &&
    ["pnpm", "npm", "npx"].includes(command)
    ? `${command}.cmd`
    : command;
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {},
): Promise<string> {
  throwIfAborted(options.signal);
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new CliError("命令超时必须为正数", "INVALID_INPUT");
  const limit = options.maxOutputBytes ?? 1024 * 1024;
  if (!Number.isSafeInteger(limit) || limit < 0)
    throw new CliError("日志容量必须为非负整数", "INVALID_INPUT");
  return new Promise((resolve, reject) => {
    const executable = platformCommand(command);
    const isWindowsCommand =
      process.platform === "win32" && executable.endsWith(".cmd");
    // Only fixed package-manager commands use cmd.exe; template entries run through Node directly.
    const child = spawn(
      isWindowsCommand ? process.env.ComSpec || "cmd.exe" : executable,
      isWindowsCommand ? ["/d", "/s", "/c", executable, ...args] : args,
      {
        cwd: options.cwd,
        stdio:
          options.stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...options.env },
        windowsHide: true,
        detached: process.platform !== "win32",
      },
    );
    const buffers: Buffer[] = [];
    let bytes = 0;
    let failure: Error | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    const stop = (error: Error) => {
      if (failure) return;
      failure = error;
      const kill = (signal: NodeJS.Signals) => {
        try {
          if (process.platform !== "win32" && child.pid)
            process.kill(-child.pid, signal);
          else if (process.platform === "win32" && child.pid) {
            spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
              stdio: "ignore",
              windowsHide: true,
            }).on("error", () => child.kill(signal));
          } else child.kill(signal);
        } catch {
          /* The process may already have exited. */
        }
      };
      kill("SIGTERM");
      killTimer = setTimeout(() => kill("SIGKILL"), 1000);
      killTimer.unref();
    };
    const abort = () =>
      stop(
        options.signal?.reason instanceof Error
          ? options.signal.reason
          : new UserCancelledError(),
      );
    const timer = setTimeout(
      () =>
        stop(
          new CliError(
            `${command} 执行超过 ${timeoutMs / 1000} 秒，已停止`,
            "COMMAND_TIMEOUT",
          ),
        ),
      timeoutMs,
    );
    timer.unref();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    for (const [name, stream] of [
      ["stdout", child.stdout],
      ["stderr", child.stderr],
    ] as const) {
      stream?.on("data", (chunk: Buffer) => {
        try {
          options.onOutput?.(chunk.toString(), name);
        } catch (error) {
          stop(error instanceof Error ? error : new Error(String(error)));
        }
        buffers.push(Buffer.from(chunk));
        bytes += chunk.length;
        while (bytes > limit && buffers.length) {
          const excess = bytes - limit;
          const first = buffers[0];
          if (first.length <= excess) {
            buffers.shift();
            bytes -= first.length;
          } else {
            buffers[0] = first.subarray(excess);
            bytes -= excess;
          }
        }
      });
    }
    child.once("error", (error) => {
      failure ??= error;
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      options.signal?.removeEventListener("abort", abort);
      const output = Buffer.concat(buffers).toString("utf8").trim();
      if (failure) reject(failure);
      else if (code === 0) resolve(output);
      else
        reject(
          new CliError(
            redactText(
              `${command} ${args.join(" ")} 执行失败（${signal ?? `exit ${code ?? "unknown"}`}）${output ? `\n${output}` : ""}`,
            ),
            "COMMAND_FAILED",
          ),
        );
    });
  });
}

export async function inspectCommand(
  command: string,
  args: string[] = ["--version"],
  options: RunCommandOptions = {},
): Promise<{ ok: boolean; output: string }> {
  try {
    return {
      ok: true,
      output: await runCommand(command, args, {
        ...options,
        stdio: "pipe",
        timeoutMs: options.timeoutMs ?? 10_000,
      }),
    };
  } catch (error) {
    throwIfAborted(options.signal);
    return { ok: false, output: (error as Error).message };
  }
}
