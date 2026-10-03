import { existsSync } from "node:fs";
import { CLI_NODE_RANGE } from "../constants.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { coerce, gte, satisfies } from "semver";
import { loadCatalog } from "../catalog.js";
import { validateTemplateContract } from "../core/template-manifest.js";
import {
  acquireTemplateFromSources,
  isGitSource,
  resolveTemplateSources,
} from "../core/template-source.js";
import { getJh4jHome, loadUserConfig } from "../core/user-config.js";
import { inspectCommand } from "../utils/process.js";
import { isDirectory } from "../utils/fs.js";
import { throwIfAborted } from "../core/errors.js";
import { redactSource } from "../utils/redact.js";
import type { CatalogTemplate, UserConfig } from "../types.js";

export interface CheckResult {
  name: string;
  ok: boolean | null;
  status: "passed" | "failed" | "unchecked";
  detail: string;
}
function check(name: string, ok: boolean | null, detail: string): CheckResult {
  return {
    name,
    ok,
    status: ok === null ? "unchecked" : ok ? "passed" : "failed",
    detail,
  };
}
async function checkHomeWritable(): Promise<CheckResult> {
  const home = getJh4jHome();
  const probe = path.join(home, `.write-probe-${randomUUID()}`);
  try {
    await mkdir(home, { recursive: true });
    await writeFile(probe, "ok", { flag: "wx" });
    return check("JH4J_HOME", true, home);
  } catch (error) {
    return check("JH4J_HOME", false, (error as Error).message);
  } finally {
    await rm(probe, { force: true }).catch(() => {});
  }
}
export async function collectDoctorChecks(
  suppliedConfig?: UserConfig,
  suppliedCatalog?: CatalogTemplate[],
  options: { network?: boolean; signal?: AbortSignal } = {},
): Promise<CheckResult[]> {
  const config = suppliedConfig ?? (await loadUserConfig());
  const catalog = suppliedCatalog ?? (await loadCatalog(config));
  const [git, pnpm, home] = await Promise.all([
    inspectCommand("git", ["--version"], { signal: options.signal }),
    inspectCommand("pnpm", ["--version"], { signal: options.signal }),
    checkHomeWritable(),
  ]);
  const pnpmVersion = coerce(pnpm.output)?.version;
  const checks = [
    check(
      "Node.js",
      satisfies(process.versions.node, CLI_NODE_RANGE),
      `${process.versions.node}（要求 ${CLI_NODE_RANGE}）`,
    ),
    check("Git", git.ok, git.output),
    check(
      "pnpm",
      pnpm.ok && Boolean(pnpmVersion && gte(pnpmVersion, "11.8.0")),
      pnpm.output,
    ),
    home,
  ];
  for (const template of catalog) {
    throwIfAborted(options.signal);
    const sources = resolveTemplateSources(
      template,
      undefined,
      config.templateSource,
    );
    const source = sources[0];
    if (!existsSync(source) && !options.network) {
      checks.push(
        check(
          `模板 ${template.id}`,
          isGitSource(source) ? null : false,
          `远程源尚未验证（使用 doctor --network）: ${sources.map(redactSource).join(" → ")}`,
        ),
      );
      continue;
    }
    try {
      if (await isDirectory(source)) {
        const manifest = await validateTemplateContract(
          source,
          template.id,
          template.category,
        );
        checks.push(
          check(
            `模板 ${template.id}`,
            true,
            `${manifest.id}@${manifest.version} (${source})`,
          ),
        );
      } else {
        const acquired = await acquireTemplateFromSources(
          sources,
          config.templateRef ?? template.defaultRef,
          {
            signal: options.signal,
            expectedTemplateId: template.id,
            expectedCategory: template.category,
          },
        );
        try {
          const manifest = await validateTemplateContract(
            acquired.root,
            template.id,
            template.category,
          );
          checks.push(
            check(
              `模板 ${template.id}`,
              true,
              `${manifest.id}@${manifest.version} (${acquired.source})`,
            ),
          );
        } finally {
          await acquired.cleanup();
        }
      }
    } catch (error) {
      throwIfAborted(options.signal);
      checks.push(
        check(`模板 ${template.id}`, false, (error as Error).message),
      );
    }
  }
  return checks;
}
export async function doctorCommand(
  options: { json?: boolean; network?: boolean } = {},
  signal?: AbortSignal,
): Promise<void> {
  const checks = await collectDoctorChecks(undefined, undefined, {
    ...options,
    signal,
  });
  const failed = checks.filter((item) => item.ok === false);
  const unchecked = checks.filter((item) => item.ok === null);
  if (options.json)
    console.log(
      JSON.stringify(
        { ok: failed.length === 0, complete: unchecked.length === 0, checks },
        null,
        2,
      ),
    );
  else {
    for (const item of checks)
      console.log(
        `${item.ok === null ? "—" : item.ok ? "✓" : "✗"} ${item.name}: ${item.detail}`,
      );
    console.log(
      `\n结果: ${checks.length - failed.length - unchecked.length} 通过, ${failed.length} 失败, ${unchecked.length} 未检查`,
    );
  }
  if (failed.length) process.exitCode = 1;
}
