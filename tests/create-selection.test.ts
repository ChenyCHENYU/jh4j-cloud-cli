import { describe, expect, it } from "vitest";
import {
  buildCompletionContent,
  creationModeOptions,
  defaultProjectNameFor,
  projectNamePromptOptions,
  templateOptionsFor,
  templatesByCategory
} from "../src/commands/create.js";
import type { GenerateProjectResult } from "../src/core/project-generator.js";
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

  it("shows templates with concise labels and independent hints", () => {
    expect(templateOptionsFor(templates)).toEqual([
      {
        value: "web.jh4j-mf-remote",
        label: "PC 管理端",
        hint: "Vue 3 · Vite · 微前端"
      },
      {
        value: "service.jh4j-spring-cloud",
        label: "后端服务",
        hint: "Java · Spring Cloud · 云原生"
      },
      {
        value: "mobile.robot-h5",
        label: "移动端 H5",
        hint: "Vue 3 · Vite 7 · Vant 4"
      }
    ]);
    expect(
      templateOptionsFor(
        templates.filter((item) => item.category !== "backend")
      )
    ).toEqual([
      {
        value: "web.jh4j-mf-remote",
        label: "PC 管理端",
        hint: "Vue 3 · Vite · 微前端"
      },
      {
        value: "mobile.robot-h5",
        label: "移动端 H5",
        hint: "Vue 3 · Vite 7 · Vant 4"
      }
    ]);
  });

  it("offers quick creation first and custom creation second", () => {
    expect(creationModeOptions()).toEqual([
      {
        value: "quick",
        label: "快速创建（推荐）",
        hint: "采用模板推荐配置，立即生成"
      },
      {
        value: "custom",
        label: "自定义创建",
        hint: "设置项目名、标题、端口和联调地址"
      }
    ]);
  });

  it("provides stable default project names for each category", () => {
    expect(defaultProjectNameFor("frontend")).toBe("jh4j-ui-app");
    expect(defaultProjectNameFor("mobile")).toBe("jh4j-mobile-app");
    expect(defaultProjectNameFor("backend")).toBe("jh4j-service-app");
  });

  it("prefills an editable project name and accepts it on Enter", () => {
    const options = projectNamePromptOptions("mobile");

    expect(options.initialValue).toBe("jh4j-mobile-app");
    expect(options.defaultValue).toBe("jh4j-mobile-app");
  });

  it("builds a useful mobile completion panel", () => {
    const result: GenerateProjectResult = {
      targetRoot: "D:/workspace/jh4j-mobile-app",
      templateId: "mobile.robot-h5",
      templateName: "JH4J 移动端 H5 模板",
      templateVersion: "1.6.0",
      category: "mobile",
      source: "https://github.com/ChenyCHENYU/Robot_H5.git#v1.6.0",
      features: ["git-standards"],
      installed: false,
      gitInitialized: true,
      configuration: {
        title: "JH4J Mobile",
        moduleName: "app",
        devServerPort: 8888,
        localBackendUrl: "http://localhost:10010"
      }
    };

    const content = buildCompletionContent("jh4j-mobile-app", "quick", result);

    expect(content).toContain("模板：JH4J 移动端 H5 模板 · v1.6.0");
    expect(content).toContain("@robot-h5/core 移动端核心能力");
    expect(content).toContain("Git 提交规范、代码检查与 Git Hooks");
    expect(content).toContain("2. pnpm install");
    expect(content).toContain("3. pnpm dev");
  });
});
