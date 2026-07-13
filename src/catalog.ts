import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { CATALOG_FILE_ENV, TEMPLATE_SOURCE_ENV } from "./constants.js";
import { readJson } from "./utils/fs.js";
import type { CatalogFile, CatalogTemplate, UserConfig } from "./types.js";

const siblingTemplatePath = fileURLToPath(
  new URL("../../jh4j-ui-template/", import.meta.url)
);

export const BUILTIN_TEMPLATES: CatalogTemplate[] = [
  {
    id: "web.jh4j-mf-remote",
    name: "JH4J PC 微前端业务模板",
    description: "Vue 3 + Vite + Module Federation 标准业务子系统",
    category: "frontend",
    sourceEnvironment: TEMPLATE_SOURCE_ENV,
    defaultSource: siblingTemplatePath,
    defaultRef: "main",
    status: "beta",
    tags: ["vue", "vite", "module-federation", "pc"]
  }
];

function validateCatalogTemplate(template: CatalogTemplate): void {
  if (!template.id || !template.name || !template.category) {
    throw new Error("Catalog 模板缺少 id、name 或 category");
  }
  if (!new Set(["frontend", "backend", "mobile"]).has(template.category)) {
    throw new Error(`Catalog 模板 ${template.id} 的 category 无效`);
  }
  if (!new Set(["stable", "beta"]).has(template.status)) {
    throw new Error(`Catalog 模板 ${template.id} 的 status 无效`);
  }
  if (!template.defaultRef) {
    throw new Error(`Catalog 模板 ${template.id} 缺少 defaultRef`);
  }
  if (!template.defaultSource && !template.sourceEnvironment) {
    throw new Error(`Catalog 模板 ${template.id} 没有可解析的模板源`);
  }
}

export async function loadCatalog(config?: UserConfig): Promise<CatalogTemplate[]> {
  const configuredFile = process.env[CATALOG_FILE_ENV] || config?.catalogFile;
  if (!configuredFile) return [...BUILTIN_TEMPLATES];

  const catalogPath = path.resolve(configuredFile);
  if (!existsSync(catalogPath)) {
    throw new Error(`Catalog 文件不存在: ${catalogPath}`);
  }
  const external = await readJson<CatalogFile>(catalogPath);
  if (external.schemaVersion !== 1 || !Array.isArray(external.templates)) {
    throw new Error(`Catalog 文件格式无效: ${catalogPath}`);
  }
  const catalogDirectory = path.dirname(catalogPath);
  external.templates = external.templates.map((template) => {
    const source = template.defaultSource;
    const isRemote = /^(?:https?|ssh|file):\/\//.test(source) || source.startsWith("git@");
    return {
      ...template,
      defaultSource:
        isRemote || path.isAbsolute(source)
          ? source
          : path.resolve(catalogDirectory, source)
    };
  });
  external.templates.forEach(validateCatalogTemplate);

  const merged = new Map(BUILTIN_TEMPLATES.map((item) => [item.id, item]));
  external.templates.forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
}

export function findTemplate(
  catalog: CatalogTemplate[],
  id?: string
): CatalogTemplate {
  const selected = id ?? catalog[0]?.id;
  const template = catalog.find((item) => item.id === selected);
  if (!template) {
    throw new Error(
      `模板不存在: ${selected}。可用模板: ${catalog.map((item) => item.id).join(", ")}`
    );
  }
  return template;
}
