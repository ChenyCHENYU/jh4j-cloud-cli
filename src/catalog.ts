import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { CATALOG_FILE_ENV, TEMPLATE_SOURCE_ENV } from "./constants.js";
import { CliError } from "./core/errors.js";
import { exactKeys, record, textValue } from "./core/validation.js";
import { readJson } from "./utils/fs.js";
import type { CatalogFile, CatalogTemplate, UserConfig } from "./types.js";

const siblingTemplatePath = fileURLToPath(
  new URL("../../jh4j-ui-template/", import.meta.url),
);
const mobileTemplatePaths = [
  "../../../robot/Robot_H5/",
  "../../../Robot_H5/",
].map((relative) => fileURLToPath(new URL(relative, import.meta.url)));
const siblingMobileTemplatePath = mobileTemplatePaths.find((candidate) =>
  existsSync(path.join(candidate, "template.manifest.json")),
);
const remoteTemplateSources = [
  "https://github.com/ChenyCHENYU/jh4j-ui-template.git",
  "https://gitee.com/ycyplus163/jh4j-ui-template.git",
];
const remoteMobileTemplateSources = [
  "https://github.com/ChenyCHENYU/Robot_H5.git",
  "https://gitee.com/ycyplus163/robot_-h5.git",
];

export const BUILTIN_TEMPLATES: CatalogTemplate[] = [
  {
    id: "web.jh4j-mf-remote",
    name: "JH4J PC 微前端业务模板",
    description: "Vue 3 + Vite + Module Federation 标准业务子系统",
    category: "frontend",
    sourceEnvironment: TEMPLATE_SOURCE_ENV,
    defaultSource: existsSync(siblingTemplatePath)
      ? siblingTemplatePath
      : remoteTemplateSources[0],
    sources: remoteTemplateSources,
    defaultRef: "main",
    status: "beta",
    tags: ["vue", "vite", "module-federation", "pc"],
  },
  {
    id: "mobile.robot-h5",
    name: "JH4J 移动端 H5 模板",
    description: "Vue 3 + Vite 7 + Vant 4 企业级移动端 H5 应用",
    category: "mobile",
    sourceEnvironment: "JH4J_MOBILE_TEMPLATE_SOURCE",
    defaultSource:
      siblingMobileTemplatePath !== undefined
        ? siblingMobileTemplatePath
        : remoteMobileTemplateSources[0],
    sources: remoteMobileTemplateSources,
    defaultRef: "v1.7.1",
    status: "beta",
    tags: ["vue", "vite", "vant", "h5", "mobile"],
  },
];

function validateCatalogTemplate(
  value: unknown,
): asserts value is CatalogTemplate {
  const template = record(value, "Catalog template");
  exactKeys(
    template,
    [
      "id",
      "name",
      "description",
      "category",
      "sourceEnvironment",
      "defaultSource",
      "sources",
      "defaultRef",
      "status",
      "tags",
    ],
    "Catalog template",
  );
  for (const key of [
    "id",
    "name",
    "description",
    "defaultSource",
    "defaultRef",
  ])
    textValue(template[key], `Catalog.${key}`);
  if (!/^[a-z][a-z0-9.-]+$/.test(template.id as string))
    throw new CliError("Catalog 模板 id 无效", "INVALID_CONFIG");
  if (
    !["frontend", "backend", "mobile"].includes(template.category as string) ||
    !["stable", "beta"].includes(template.status as string)
  )
    throw new CliError("Catalog category 或 status 无效", "INVALID_CONFIG");
  if (
    template.sourceEnvironment !== undefined &&
    !/^[A-Z][A-Z0-9_]*$/.test(
      textValue(template.sourceEnvironment, "sourceEnvironment"),
    )
  )
    throw new CliError("Catalog sourceEnvironment 无效", "INVALID_CONFIG");
  for (const key of ["sources", "tags"])
    if (template[key] !== undefined) {
      if (!Array.isArray(template[key]))
        throw new CliError(`Catalog ${key} 必须是数组`, "INVALID_CONFIG");
      for (const item of template[key]) textValue(item, `Catalog.${key}`);
    }
}

function resolveCatalogSource(
  source: string,
  catalogDirectory: string,
): string {
  const isRemote =
    /^(?:https?|ssh|file):\/\//.test(source) || source.startsWith("git@");
  return isRemote || path.isAbsolute(source)
    ? source
    : path.resolve(catalogDirectory, source);
}

export async function loadCatalog(
  config?: UserConfig,
): Promise<CatalogTemplate[]> {
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
  exactKeys(
    record(external, "Catalog"),
    ["schemaVersion", "templates"],
    "Catalog",
  );
  external.templates.forEach(validateCatalogTemplate);
  if (
    new Set(external.templates.map((template) => template.id)).size !==
    external.templates.length
  )
    throw new CliError("Catalog 模板 id 重复", "INVALID_CONFIG");
  external.templates = external.templates.map((template) => {
    return {
      ...template,
      defaultSource: resolveCatalogSource(
        template.defaultSource,
        catalogDirectory,
      ),
      sources: template.sources?.map((source) =>
        resolveCatalogSource(source, catalogDirectory),
      ),
    };
  });
  external.templates.forEach(validateCatalogTemplate);

  const merged = new Map(BUILTIN_TEMPLATES.map((item) => [item.id, item]));
  external.templates.forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
}

export function findTemplate(
  catalog: CatalogTemplate[],
  id?: string,
): CatalogTemplate {
  const selected = id ?? catalog[0]?.id;
  const template = catalog.find((item) => item.id === selected);
  if (!template) {
    throw new Error(
      `模板不存在: ${selected}。可用模板: ${catalog.map((item) => item.id).join(", ")}`,
    );
  }
  return template;
}
