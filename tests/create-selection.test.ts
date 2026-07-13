import { describe, expect, it } from "vitest";
import { templatesByCategory } from "../src/commands/create.js";
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
    expect(templatesByCategory(templates, "mobile")).toEqual([]);
  });
});
