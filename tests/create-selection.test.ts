import { describe, expect, it } from "vitest";
import {
  buildCompletionView,
  creationModeOptions,
  templateOptionsFor,
  templatesByCategory,
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
    status: "stable",
  },
  {
    id: "service.jh4j-spring-cloud",
    name: "Service",
    description: "backend",
    category: "backend",
    defaultSource: ".",
    defaultRef: "main",
    status: "beta",
  },
  {
    id: "mobile.robot-h5",
    name: "H5",
    description: "mobile",
    category: "mobile",
    defaultSource: ".",
    defaultRef: "v1.7.1",
    status: "beta",
  },
];

describe("template category selection", () => {
  it("filters templates by frontend, backend and mobile category", () => {
    expect(
      templatesByCategory(templates, "frontend").map((item) => item.id),
    ).toEqual(["web.jh4j-mf-remote"]);
    expect(
      templatesByCategory(templates, "backend").map((item) => item.id),
    ).toEqual(["service.jh4j-spring-cloud"]);
    expect(
      templatesByCategory(templates, "mobile").map((item) => item.id),
    ).toEqual(["mobile.robot-h5"]);
  });

  it("shows templates with concise labels and independent hints", () => {
    expect(templateOptionsFor(templates)).toEqual([
      {
        value: "web.jh4j-mf-remote",
        label: "PC 管理端",
        hint: "frontend",
      },
      {
        value: "service.jh4j-spring-cloud",
        label: "后端服务",
        hint: "backend",
      },
      {
        value: "mobile.robot-h5",
        label: "移动端 H5",
        hint: "mobile",
      },
    ]);
    expect(
      templateOptionsFor(
        templates.filter((item) => item.category !== "backend"),
      ),
    ).toEqual([
      {
        value: "web.jh4j-mf-remote",
        label: "PC 管理端",
        hint: "frontend",
      },
      {
        value: "mobile.robot-h5",
        label: "移动端 H5",
        hint: "mobile",
      },
    ]);
  });

  it("offers quick creation first and custom creation second", () => {
    expect(creationModeOptions()).toEqual([
      {
        value: "quick",
        label: "快速创建（推荐）",
        hint: "采用模板推荐配置，立即生成",
      },
      {
        value: "custom",
        label: "自定义创建",
        hint: "设置项目名、标题、端口和联调地址",
      },
    ]);
  });

  it("distinguishes templates in the same category", () => {
    const options = templateOptionsFor([
      templates[0],
      { ...templates[0], id: "web.second", name: "Second template" },
    ]);
    expect(options.map((option) => option.label)).toEqual([
      "PC",
      "Second template",
    ]);
  });

  it("builds a useful mobile completion panel", () => {
    const result: GenerateProjectResult = {
      targetRoot: "D:/workspace/jh4j-mobile-app",
      templateId: "mobile.robot-h5",
      templateName: "JH4J 移动端 H5 模板",
      templateVersion: "1.7.1",
      category: "mobile",
      source: "https://github.com/ChenyCHENYU/Robot_H5.git#v1.7.1",
      features: ["git-standards"],
      display: { corePackages: ["@robot-h5/core"] },
      nextSteps: ["cd jh4j-mobile-app", "pnpm install", "pnpm dev"],
      installed: false,
      gitInitialized: true,
      configuration: {
        title: "JH4J Mobile",
        moduleName: "app",
        devServerPort: 8888,
        localBackendUrl: "http://localhost:10010",
      },
    };

    const view = buildCompletionView("jh4j-mobile-app", "quick", result);

    expect(view.overview).toContainEqual({
      label: "模板",
      value: "JH4J 移动端 H5 模板 · v1.7.1",
    });
    expect(view.profile).toContainEqual({
      label: "核心",
      value: "@robot-h5/core",
    });
    expect(view.profile).toContainEqual({
      label: "能力",
      value: "git-standards",
    });
    expect(view.nextSteps).toEqual([
      "cd jh4j-mobile-app",
      "pnpm install",
      "pnpm dev",
    ]);
  });
});
