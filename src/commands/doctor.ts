import { existsSync } from "node:fs";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { coerce, gte, satisfies } from "semver";
import { loadCatalog } from "../catalog.js";
import { loadTemplateManifest } from "../core/template-manifest.js";
import { resolveTemplateSources } from "../core/template-source.js";
import { getJh4jHome, loadUserConfig } from "../core/user-config.js";
import { inspectCommand } from "../utils/process.js";
import type { CatalogTemplate, UserConfig } from "../types.js";

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

async function checkHomeWritable(): Promise<CheckResult> {
  const home = getJh4jHome();
  const probe = path.join(home, `.write-probe-${process.pid}`);
  try {
    await mkdir(home, { recursive: true });
    await writeFile(probe, "ok", "utf8");
    await rm(probe, { force: true });
    return { name: "JH4J_HOME", ok: true, detail: home };
  } catch (error) {
    return { name: "JH4J_HOME", ok: false, detail: (error as Error).message };
  }
}

export async function collectDoctorChecks(
  suppliedConfig?: UserConfig,
  suppliedCatalog?: CatalogTemplate[]
): Promise<CheckResult[]> {
  const config = suppliedConfig ?? (await loadUserConfig());
  const catalog = suppliedCatalog ?? (await loadCatalog(config));
  const [git, pnpm, home] = await Promise.all([
    inspectCommand("git"),
    inspectCommand("pnpm"),
    checkHomeWritable()
  ]);
  const pnpmVersion = coerce(pnpm.output)?.version;
  const checks: CheckResult[] = [
    {
      name: "Node.js",
      ok: satisfies(process.versions.node, "^22.12.0 || ^24.0.0"),
      detail: `${process.versions.node}（要求 Node 22.12+ 或 24.x）`
    },
    { name: "Git", ok: git.ok, detail: git.output },
    {
      name: "pnpm",
      ok: pnpm.ok && Boolean(pnpmVersion && gte(pnpmVersion, "11.8.0")),
      detail: pnpm.output
    },
    home
  ];

  for (const template of catalog) {
    const sources = resolveTemplateSources(
      template,
      undefined,
      config.templateSource
    );
    const source = sources[0];
    if (!existsSync(source)) {
      checks.push({
        name: `模板 ${template.id}`,
        ok:
          source.startsWith("http://") ||
          source.startsWith("https://") ||
          source.startsWith("git@"),
        detail: `远程候选源（创建时依次验证）: ${sources.join(" → ")}`
      });
      continue;
    }
    try {
      const manifest = await loadTemplateManifest(source);
      checks.push({
        name: `模板 ${template.id}`,
        ok:
          manifest.id === template.id &&
          satisfies(process.versions.node, manifest.runtime.node),
        detail: `${manifest.id}@${manifest.version} (${source})`
      });
    } catch (error) {
      checks.push({
        name: `模板 ${template.id}`,
        ok: false,
        detail: (error as Error).message
      });
    }
  }
  return checks;
}

export async function doctorCommand(options: { json?: boolean } = {}): Promise<void> {
  const checks = await collectDoctorChecks();
  const failed = checks.filter((check) => !check.ok);
  if (options.json) {
    console.log(JSON.stringify({ ok: failed.length === 0, checks }, null, 2));
  } else {
    for (const check of checks) {
      console.log(`${check.ok ? "✓" : "✗"} ${check.name}: ${check.detail}`);
    }
    console.log(`\n结果: ${checks.length - failed.length} 通过, ${failed.length} 失败`);
  }
  if (failed.length) process.exitCode = 1;
}
