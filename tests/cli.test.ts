import { spawn } from "node:child_process";
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { runCommand } from "../src/utils/process.js";
import { copyFixture, fixtureRoot, temporaryRoot } from "./helpers.js";
const cli = path.resolve("bin/jh4j.js");
beforeAll(async () => {
  await runCommand(
    process.execPath,
    ["node_modules/tsup/dist/cli-default.js"],
    { stdio: "pipe" },
  );
});
async function execute(
  args: string[],
  cwd?: string,
  onOutput?: (text: string, child: ReturnType<typeof spawn>) => void,
) {
  const root = cwd ?? (await temporaryRoot());
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(process.execPath, [cli, ...args], {
        cwd: root,
        env: {
          ...process.env,
          JH4J_HOME: path.join(root, "home"),
          CI: "1",
          NO_COLOR: "1",
          FORCE_COLOR: "0",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        onOutput?.(chunk.toString(), child);
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
        onOutput?.(chunk.toString(), child);
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    },
  );
}
describe("CLI output and automation", () => {
  it("emits parseable config JSON without a trailing explanation", async () => {
    const result = await execute(["config", "list", "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).autoInstall).toBe(false);
    expect(result.stdout).not.toContain("配置文件");
  });
  it("fails noninteractive ambiguous creation without rendering a prompt", async () => {
    const result = await execute(["create", "demo", "--dry-run"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--template");
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("\x1b");
  });
  it("emits structured errors and preserves stdout for JSON", async () => {
    const result = await execute(["info", "missing", "--json"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).ok).toBe(false);
    expect(result.stderr).toContain("不是 JH4J");
  });
  it("creates a project with explicit parameters without needing --yes", async () => {
    const root = await temporaryRoot();
    const result = await execute(
      [
        "create",
        "demo",
        "--template",
        "web.jh4j-mf-remote",
        "--source",
        fixtureRoot,
        "--skip-git",
        "--json",
      ],
      root,
    );
    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.project.plan.input.projectName).toBe("demo");
    expect(output.project.installed).toBe(false);
    expect(result.stdout).not.toContain("\x1b");
  });
  it("uses manifest defaults and produces a complete dry-run plan", async () => {
    const root = await temporaryRoot();
    const source = await copyFixture(root);
    const manifest = JSON.parse(
      await readFile(path.join(source, "template.manifest.json"), "utf8"),
    );
    manifest.defaults.projectName = "custom-default";
    await writeFile(
      path.join(source, "template.manifest.json"),
      JSON.stringify(manifest),
    );
    const result = await execute(
      [
        "create",
        "--yes",
        "--template",
        "web.jh4j-mf-remote",
        "--source",
        source,
        "--dry-run",
        "--json",
      ],
      root,
    );
    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.plan.input.projectName).toBe("custom-default");
    expect(output.dryRun).toBe(true);
    expect(await readdir(root)).not.toContain("custom-default");
  });
  it("saves and reloads the actual creation parameters", async () => {
    const root = await temporaryRoot();
    const file = path.join(root, "saved.json");
    const first = await execute(
      [
        "create",
        "one",
        "--yes",
        "--template",
        "web.jh4j-mf-remote",
        "--source",
        fixtureRoot,
        "--title",
        "Saved title",
        "--skip-git",
        "--save-config",
        file,
        "--quiet",
      ],
      root,
    );
    expect(first.code).toBe(0);
    const second = await execute(
      [
        "create",
        "two",
        "--template",
        "web.jh4j-mf-remote",
        "--source",
        fixtureRoot,
        "--config",
        file,
        "--skip-git",
        "--json",
      ],
      root,
    );
    expect(second.code).toBe(0);
    expect(JSON.parse(second.stdout).project.configuration.title).toBe(
      "Saved title",
    );
  });
  it.skipIf(process.platform === "win32").each(["SIGINT", "SIGTERM"] as const)(
    "%s cancels setup, cleans staging and preserves an existing target",
    async (terminationSignal) => {
      const root = await temporaryRoot();
      const source = await copyFixture(root);
      const target = path.join(root, "existing");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(target);
      await writeFile(path.join(target, "sentinel.txt"), "keep");
      const script = await readFile(
        path.join(source, "scripts/setup-project.mjs"),
        "utf8",
      );
      await writeFile(
        path.join(source, "scripts/setup-project.mjs"),
        'console.log("SETUP_READY");await new Promise(r=>setTimeout(r,10000));\n' +
          script,
      );
      let cancelled = false;
      const result = await execute(
        [
          "create",
          "existing",
          "--yes",
          "--template",
          "web.jh4j-mf-remote",
          "--source",
          source,
          "--skip-git",
          "--force",
          "--verbose",
          "--json",
        ],
        root,
        (text, child) => {
          if (text.includes("SETUP_READY") && !cancelled) {
            cancelled = true;
            child.kill(terminationSignal);
          }
        },
      );
      expect(cancelled).toBe(true);
      expect(result.code).toBe(terminationSignal === "SIGINT" ? 130 : 143);
      expect(JSON.parse(result.stdout).error.code).toBe("CANCELLED");
      expect(await readFile(path.join(target, "sentinel.txt"), "utf8")).toBe(
        "keep",
      );
      expect(
        (await readdir(root)).some(
          (name) => name.includes(".jh4j-tmp-") || name.endsWith(".jh4j-lock"),
        ),
      ).toBe(false);
    },
  );
  it("times out setup without creating the target", async () => {
    const root = await temporaryRoot();
    const source = await copyFixture(root);
    await writeFile(
      path.join(source, "scripts/setup-project.mjs"),
      "await new Promise(resolve=>setTimeout(resolve,10000));",
    );
    const result = await execute(
      [
        "create",
        "timeout-app",
        "--yes",
        "--template",
        "web.jh4j-mf-remote",
        "--source",
        source,
        "--skip-git",
        "--timeout",
        "0.1",
        "--json",
      ],
      root,
    );
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).error.code).toBe("COMMAND_TIMEOUT");
    expect(await readdir(root)).not.toContain("timeout-app");
    expect(
      (await readdir(root)).some(
        (name) => name.includes(".jh4j-tmp-") || name.endsWith(".jh4j-lock"),
      ),
    ).toBe(false);
  });
  it("inspects and validates templates as JSON", async () => {
    for (const action of ["inspect", "validate"]) {
      const result = await execute(["template", action, fixtureRoot, "--json"]);
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout).id).toBe("web.jh4j-mf-remote");
    }
  });
  it("resets a malformed user configuration", async () => {
    const root = await temporaryRoot();
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.join(root, "home"));
    await writeFile(path.join(root, "home/config.json"), "broken");
    expect((await execute(["config", "reset"], root)).code).toBe(0);
    expect(
      JSON.parse(await readFile(path.join(root, "home/config.json"), "utf8"))
        .autoInstall,
    ).toBe(false);
  });
});
