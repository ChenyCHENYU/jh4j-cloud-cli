import path from "node:path";
import { loadTemplateManifest } from "../core/template-manifest.js";
import { runCommand } from "../utils/process.js";

export async function validateTemplateCommand(templatePath: string): Promise<void> {
  const root = path.resolve(templatePath);
  const manifest = await loadTemplateManifest(root);
  await runCommand(process.execPath, [path.join(root, "scripts", "validate-template.mjs")], {
    cwd: root
  });
  console.log(`模板可用: ${manifest.id}@${manifest.version}`);
}
