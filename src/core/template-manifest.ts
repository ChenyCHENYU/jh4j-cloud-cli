import { satisfies } from "semver";
import { assertContainedFile, readJson } from "../utils/fs.js";
import { CliError } from "./errors.js";
import { parseTemplateEntry, record, validateManifest } from "./validation.js";
import { validateSourceProjectConfig } from "./project-input.js";
import type { TemplateCategory, TemplateManifest } from "../types.js";

export async function loadTemplateManifest(
  templateRoot: string,
): Promise<TemplateManifest> {
  return validateManifest(
    await readJson(
      await assertContainedFile(
        templateRoot,
        "template.manifest.json",
        "模板 Manifest",
      ),
    ),
  );
}

export async function validateTemplateContract(
  templateRoot: string,
  expectedId?: string,
  expectedCategory?: TemplateCategory,
): Promise<TemplateManifest> {
  const manifest = await loadTemplateManifest(templateRoot);
  if (expectedId && manifest.id !== expectedId)
    throw new CliError(
      `模板 ID 不匹配：Catalog=${expectedId}，Manifest=${manifest.id}`,
      "INVALID_TEMPLATE",
    );
  if (expectedCategory && manifest.category !== expectedCategory)
    throw new CliError(
      "模板 Manifest 与 Catalog 的 category 不一致",
      "INVALID_TEMPLATE",
    );
  if (!satisfies(process.versions.node, manifest.runtime.node))
    throw new CliError(
      `当前 Node ${process.versions.node} 不满足模板要求 ${manifest.runtime.node}`,
      "INVALID_TEMPLATE",
    );
  const packageFile = await assertContainedFile(
    templateRoot,
    "package.json",
    "模板 package.json",
  );
  const pkg = record(await readJson(packageFile), "模板 package.json");
  if (
    pkg.packageManager !== undefined &&
    pkg.packageManager !== manifest.runtime.packageManager
  )
    throw new CliError(
      "模板 package.json 与 Manifest 的 packageManager 不一致",
      "INVALID_TEMPLATE",
    );
  await assertContainedFile(
    templateRoot,
    parseTemplateEntry(manifest.entry.nonInteractive).script,
    "初始化入口",
  );
  const configFile = await assertContainedFile(
    templateRoot,
    "project.config.json",
    "项目默认配置",
  );
  validateSourceProjectConfig(await readJson(configFile), manifest);
  return manifest;
}
