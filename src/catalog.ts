import { fileURLToPath } from "node:url";
import { TEMPLATE_SOURCE_ENV } from "./constants.js";
import type { CatalogTemplate } from "./types.js";

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
    developmentPath: siblingTemplatePath,
    defaultRef: "main",
    status: "beta"
  }
];

export function findTemplate(id?: string): CatalogTemplate {
  const selected = id ?? BUILTIN_TEMPLATES[0]?.id;
  const template = BUILTIN_TEMPLATES.find((item) => item.id === selected);
  if (!template) {
    throw new Error(
      `模板不存在: ${selected}。可用模板: ${BUILTIN_TEMPLATES.map((item) => item.id).join(", ")}`
    );
  }
  return template;
}
