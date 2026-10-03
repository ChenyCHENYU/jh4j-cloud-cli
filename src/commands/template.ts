import path from "node:path";
import { validateTemplateContract } from "../core/template-manifest.js";
import { throwIfAborted } from "../core/errors.js";
import { assertContainedFile } from "../utils/fs.js";
import { runCommand } from "../utils/process.js";

export async function inspectTemplateCommand(
  templatePath: string,
  options: { json?: boolean } = {},
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const manifest = await validateTemplateContract(path.resolve(templatePath));
  throwIfAborted(signal);
  if (options.json) console.log(JSON.stringify(manifest, null, 2));
  else {
    console.log(`${manifest.name} (${manifest.id}@${manifest.version})`);
    console.log(
      `运行时: Node ${manifest.runtime.node}；${manifest.runtime.packageManager}`,
    );
    console.log("默认值:");
    console.log(JSON.stringify(manifest.defaults, null, 2));
    console.log("参数:");
    console.log(JSON.stringify(manifest.parameters ?? [], null, 2));
    console.log("能力:");
    console.log(JSON.stringify(manifest.features ?? [], null, 2));
  }
}
export async function validateTemplateCommand(
  templatePath: string,
  options: { json?: boolean } = {},
  signal?: AbortSignal,
): Promise<void> {
  const root = path.resolve(templatePath);
  const manifest = await validateTemplateContract(root);
  const script = await assertContainedFile(
    root,
    "scripts/validate-template.mjs",
    "模板验证脚本",
  );
  const output = await runCommand(process.execPath, [script], {
    cwd: root,
    stdio: "pipe",
    signal,
  });
  if (options.json)
    console.log(
      JSON.stringify(
        { ok: true, id: manifest.id, version: manifest.version },
        null,
        2,
      ),
    );
  else {
    if (output) console.log(output);
    console.log(`模板可用: ${manifest.id}@${manifest.version}`);
  }
}
