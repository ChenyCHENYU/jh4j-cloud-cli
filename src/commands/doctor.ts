import { existsSync } from "node:fs";
import { BUILTIN_TEMPLATES } from "../catalog.js";
import { SUPPORTED_NODE_MAJORS } from "../constants.js";
import { loadTemplateManifest } from "../core/template-manifest.js";
import { resolveTemplateSource } from "../core/template-source.js";
import { inspectCommand } from "../utils/process.js";

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export async function collectDoctorChecks(): Promise<CheckResult[]> {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const [git, pnpm] = await Promise.all([
    inspectCommand("git"),
    inspectCommand("pnpm")
  ]);
  const checks: CheckResult[] = [
    {
      name: "Node.js",
      ok: SUPPORTED_NODE_MAJORS.has(nodeMajor),
      detail: `${process.versions.node}（要求 Node 22.12+ 或 24.x）`
    },
    { name: "Git", ok: git.ok, detail: git.output },
    { name: "pnpm", ok: pnpm.ok, detail: pnpm.output }
  ];

  for (const template of BUILTIN_TEMPLATES) {
    const source = resolveTemplateSource(template);
    if (!existsSync(source)) {
      checks.push({
        name: `模板 ${template.id}`,
        ok: source.startsWith("http") || source.startsWith("git@"),
        detail: source
      });
      continue;
    }
    try {
      const manifest = await loadTemplateManifest(source);
      checks.push({
        name: `模板 ${template.id}`,
        ok: manifest.id === template.id,
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

export async function doctorCommand(): Promise<void> {
  const checks = await collectDoctorChecks();
  for (const check of checks) {
    console.log(`${check.ok ? "✓" : "✗"} ${check.name}: ${check.detail}`);
  }
  const failed = checks.filter((check) => !check.ok);
  console.log(`\n结果: ${checks.length - failed.length} 通过, ${failed.length} 失败`);
  if (failed.length) process.exitCode = 1;
}
