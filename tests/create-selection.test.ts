import { describe, expect, it } from "vitest";
import {
  categoryOptionsFor,
  templatesByCategory
} from "../src/commands/create.js";
import type { CatalogTemplate } from "../src/types.js";

const templates: CatalogTemplate[] = [
  {
    id: "web.jh4j-mf-remote",
    name: "PC",
    description: "frontend",
    category: "frontend",
    defaultSource: ".",
    defaultRef: "main",
    status: "stable"
  },
  {
    id: "service.jh4j-spring-cloud",
    name: "Service",
    description: "backend",
    category: "backend",
    defaultSource: ".",
    defaultRef: "main",
    status: "beta"
  },
  {
    id: "mobile.robot-h5",
    name: "H5",
    description: "mobile",
    category: "mobile",
    defaultSource: ".",
    defaultRef: "v1.6.0",
    status: "beta"
  }
];

describe("template category selection", () => {
  it("filters templates by frontend, backend and mobile category", () => {
    expect(templatesByCategory(templates, "frontend").map((item) => item.id)).toEqual([
      "web.jh4j-mf-remote"
    ]);
    expect(templatesByCategory(templates, "backend").map((item) => item.id)).toEqual([
      "service.jh4j-spring-cloud"
    ]);
    expect(templatesByCategory(templates, "mobile").map((item) => item.id)).toEqual([
      "mobile.robot-h5"
    ]);
  });

  it("shows only available categories with unambiguous labels", () => {
    expect(categoryOptionsFor(templates)).toEqual([
      { value: "frontend", label: "PC 前端 · Vue 3 / 微前端" },
      { value: "backend", label: "后端服务 · Java / 云原生" },
      { value: "mobile", label: "移动端 H5 · Vue 3 / Vant" }
    ]);
    expect(categoryOptionsFor(templates.filter((item) => item.category !== "backend"))).toEqual([
      { value: "frontend", label: "PC 前端 · Vue 3 / 微前端" },
      { value: "mobile", label: "移动端 H5 · Vue 3 / Vant" }
    ]);
  });
});
