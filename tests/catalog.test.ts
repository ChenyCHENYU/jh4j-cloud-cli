import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findTemplate, loadCatalog } from "../src/catalog.js";
import { writeJson } from "../src/utils/fs.js";
import { DEFAULT_USER_CONFIG } from "../src/core/user-config.js";

let temporaryRoot: string | undefined;

afterEach(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

describe("external catalog", () => {
  it("overrides built-ins and appends new template types", async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "jh4j-catalog-test-"));
    const catalogFile = path.join(temporaryRoot, "catalog.json");
    await writeJson(catalogFile, {
      schemaVersion: 1,
      templates: [
        {
          id: "web.jh4j-mf-remote",
          name: "Stable PC Template",
          description: "override",
          category: "frontend",
          defaultSource: "./pc-template",
          sources: ["./pc-template-backup", "https://git.example/pc.git"],
          defaultRef: "v1.0.0",
          status: "stable"
        },
        {
          id: "service.jh4j-spring-cloud",
          name: "Spring Cloud Service",
          description: "backend",
          category: "backend",
          defaultSource: "https://git.example/service.git",
          defaultRef: "main",
          status: "beta"
        }
      ]
    });

    const catalog = await loadCatalog({
      ...DEFAULT_USER_CONFIG,
      catalogFile
    });
    expect(catalog).toHaveLength(2);
    const pcTemplate = findTemplate(catalog, "web.jh4j-mf-remote");
    expect(pcTemplate.status).toBe("stable");
    expect(pcTemplate.defaultSource).toBe(
      path.join(temporaryRoot, "pc-template")
    );
    expect(pcTemplate.sources).toEqual([
      path.join(temporaryRoot, "pc-template-backup"),
      "https://git.example/pc.git"
    ]);
    expect(findTemplate(catalog, "service.jh4j-spring-cloud").category).toBe(
      "backend"
    );
  });
});
