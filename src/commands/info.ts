import path from "node:path";
import { existsSync } from "node:fs";
import { loadTemplateManifest } from "../core/template-manifest.js";
import { validateMetadata } from "../core/validation.js";
import { assertContainedFile, readJson } from "../utils/fs.js";
import type { ProjectMetadata } from "../types.js";

export async function infoCommand(
  projectPath = process.cwd(),
  options: { json?: boolean } = {},
): Promise<void> {
  const root = path.resolve(projectPath);
  const manifest = existsSync(path.join(root, "template.manifest.json"))
    ? await loadTemplateManifest(root)
    : undefined;
  const metadataPath = path.join(
    root,
    manifest?.generatedMetadata ?? ".jhlc/project.json",
  );
  if (!existsSync(metadataPath)) {
    throw new Error(`当前目录不是 JH4J CLI 创建的项目: ${metadataPath}`);
  }
  const safePath = await assertContainedFile(
    root,
    manifest?.generatedMetadata ?? ".jhlc/project.json",
    "项目元数据",
  );
  const metadata = validateMetadata(await readJson<ProjectMetadata>(safePath));
  if (options.json) {
    console.log(JSON.stringify({ projectRoot: root, ...metadata }, null, 2));
    return;
  }
  console.log(`项目目录: ${root}`);
  console.log(`模板: ${metadata.template.id}@${metadata.template.version}`);
  console.log(`平台版本: ${metadata.platformVersion ?? "未声明"}`);
  console.log(`创建时间: ${metadata.createdAt}`);
  console.log(`创建工具: ${metadata.createdBy}`);
  if (metadata.provenance) {
    console.log(`模板来源: ${metadata.provenance.source}`);
    console.log(`模板 Ref: ${metadata.provenance.ref ?? "本地目录/压缩包"}`);
    console.log(`模板 Commit: ${metadata.provenance.commit ?? "未提供"}`);
    if (metadata.provenance.archiveSha256)
      console.log(`压缩包 SHA-256: ${metadata.provenance.archiveSha256}`);
  }
  console.log("项目参数:");
  console.log(JSON.stringify(metadata.parameters, null, 2));
}
