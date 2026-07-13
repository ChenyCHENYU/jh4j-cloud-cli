import { spawn } from "node:child_process";

export interface RunCommandOptions {
  cwd?: string;
  stdio?: "inherit" | "pipe";
  env?: NodeJS.ProcessEnv;
}

export function platformCommand(command: string): string {
  if (process.platform !== "win32") return command;
  return command === "pnpm" || command === "npm" || command === "npx"
    ? `${command}.cmd`
    : command;
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<string> {
  const stdio = options.stdio ?? "inherit";
  return new Promise((resolve, reject) => {
    const executable = platformCommand(command);
    const isWindowsCommand =
      process.platform === "win32" && executable.endsWith(".cmd");
    const spawnExecutable = isWindowsCommand
      ? process.env.ComSpec || "cmd.exe"
      : executable;
    const spawnArgs = isWindowsCommand
      ? ["/d", "/s", "/c", executable, ...args]
      : args;
    const child = spawn(spawnExecutable, spawnArgs, {
      cwd: options.cwd,
      stdio,
      env: { ...process.env, ...options.env },
      windowsHide: true
    });

    let output = "";
    if (stdio === "pipe") {
      child.stdout?.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        output += chunk.toString();
      });
    }

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(output.trim());
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} 执行失败（exit ${code ?? "unknown"}）${output ? `\n${output.trim()}` : ""}`
        )
      );
    });
  });
}

export async function inspectCommand(
  command: string,
  args: string[] = ["--version"]
): Promise<{ ok: boolean; output: string }> {
  try {
    return { ok: true, output: await runCommand(command, args, { stdio: "pipe" }) };
  } catch (error) {
    return { ok: false, output: (error as Error).message };
  }
}
