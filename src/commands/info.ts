import path from "node:path";
import { existsSync } from "node:fs";
import { readJson } from "../utils/fs.js";
import type { ProjectMetadata } from "../types.js";

export async function infoCommand(projectPath = process.cwd()): Promise<void> {
  const metadataPath = path.join(path.resolve(projectPath), ".jhlc", "project.json");
  if (!existsSync(metadataPath)) {
    throw new Error(`当前目录不是 JH4J CLI 创建的项目: ${metadataPath}`);
  }
  const metadata = await readJson<ProjectMetadata>(metadataPath);
  console.log(`模板: ${metadata.template.id}@${metadata.template.version}`);
  console.log(`平台版本: ${metadata.platformVersion ?? "未声明"}`);
  console.log(`创建时间: ${metadata.createdAt}`);
  console.log(`创建工具: ${metadata.createdBy}`);
  console.log("项目参数:");
  console.log(JSON.stringify(metadata.parameters, null, 2));
}
