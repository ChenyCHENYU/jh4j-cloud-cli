import path from "node:path";
import { readJson } from "../utils/fs.js";
import type { TemplateManifest } from "../types.js";

export async function loadTemplateManifest(
  templateRoot: string
): Promise<TemplateManifest> {
  const manifest = await readJson<TemplateManifest>(
    path.join(templateRoot, "template.manifest.json")
  );
  const errors: string[] = [];

  if (manifest.schemaVersion !== 1) errors.push("schemaVersion 必须为 1");
  if (!manifest.id) errors.push("缺少模板 id");
  if (!manifest.name) errors.push("缺少模板名称");
  if (!/^\d+\.\d+\.\d+([+-].+)?$/.test(manifest.version ?? "")) {
    errors.push("模板 version 不是有效的语义化版本");
  }
  if (!manifest.runtime?.node || !manifest.runtime?.packageManager) {
    errors.push("缺少模板运行时约束");
  }
  if (!manifest.entry?.nonInteractive) {
    errors.push("缺少非交互初始化入口");
  }

  if (errors.length) {
    throw new Error(`模板 manifest 无效：\n- ${errors.join("\n- ")}`);
  }
  return manifest;
}
