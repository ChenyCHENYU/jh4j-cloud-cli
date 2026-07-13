import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateProject } from "../src/core/project-generator.js";
import { DEFAULT_USER_CONFIG } from "../src/core/user-config.js";
import type { CatalogTemplate } from "../src/types.js";
import { writeJson } from "../src/utils/fs.js";

let temporaryRoot: string | undefined;

afterEach(async () => {
  if (temporaryRoot) {
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3 });
  }
  temporaryRoot = undefined;
});

describe("Git and dependency installation order", () => {
  it("initializes Git before the package prepare lifecycle runs", async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "jh4j-git-order-"));
    const templateRoot = path.join(temporaryRoot, "template");
    const scriptsRoot = path.join(templateRoot, "scripts");
    await mkdir(scriptsRoot, { recursive: true });

    await writeJson(path.join(templateRoot, "template.manifest.json"), {
      schemaVersion: 1,
      id: "web.test-git-order",
      name: "Git order test",
      description: "test",
      version: "1.0.0",
      category: "frontend",
      runtime: {
        node: "^22.12.0 || ^24.0.0",
        recommendedNode: "24",
        packageManager: "pnpm@11.8.0"
      },
      defaults: {
        projectName: "test-app",
        moduleName: "app",
        title: "Test",
        devServerPort: 8001,
        localBackendUrl: "http://localhost:10010",
        localPublicUrl: "http://localhost:8002",
        npmRegistry: "https://registry.npmjs.org",
        jhlcRegistry: "https://registry.npmjs.org"
      },
      features: [],
      entry: {
        interactive: "node scripts/setup-project.mjs",
        nonInteractive: "node scripts/setup-project.mjs --yes"
      },
      generatedMetadata: ".jhlc/project.json"
    });
    await writeJson(path.join(templateRoot, "project.config.json"), {
      projectName: "test-app",
      moduleName: "app",
      title: "Test",
      devServerPort: 8001,
      localBackendUrl: "http://localhost:10010",
      localPublicUrl: "http://localhost:8002",
      features: [],
      environments: Object.fromEntries(
        ["dev", "sit", "uat", "pre", "prd"].map((env) => [
          env,
          { webUrl: "http://localhost:8080", apiPrefix: `${env}-api` }
        ])
      )
    });
    await writeJson(path.join(templateRoot, "package.json"), {
      name: "test-app",
      version: "1.0.0",
      private: true,
      scripts: { prepare: "node scripts/assert-git.mjs" }
    });
    await writeFile(
      path.join(scriptsRoot, "setup-project.mjs"),
      'import { mkdir, writeFile } from "node:fs/promises"; await mkdir(".jhlc", { recursive: true }); await writeFile(".jhlc/project.json", "{}\\n");\n',
      "utf8"
    );
    await writeFile(
      path.join(scriptsRoot, "assert-git.mjs"),
      'import { existsSync } from "node:fs"; import { writeFile } from "node:fs/promises"; if (!existsSync(".git")) throw new Error("Git must exist before prepare"); await writeFile("git-before-install.txt", "ok\\n");\n',
      "utf8"
    );

    const template: CatalogTemplate = {
      id: "web.test-git-order",
      name: "Git order test",
      description: "test",
      category: "frontend",
      defaultSource: templateRoot,
      defaultRef: "main",
      status: "beta"
    };
    const outputRoot = path.join(temporaryRoot, "output");
    await mkdir(outputRoot);

    const result = await generateProject(
      template,
      "generated-app",
      { yes: true, install: true },
      outputRoot,
      DEFAULT_USER_CONFIG
    );

    expect(result.installed).toBe(true);
    expect(result.gitInitialized).toBe(true);
    expect(
      existsSync(path.join(outputRoot, "generated-app", "git-before-install.txt"))
    ).toBe(true);

    const manualOutputRoot = path.join(temporaryRoot, "manual-output");
    await mkdir(manualOutputRoot);
    const manualResult = await generateProject(
      template,
      "manual-app",
      { yes: true, skipGit: true },
      manualOutputRoot,
      DEFAULT_USER_CONFIG
    );
    expect(manualResult.installed).toBe(false);
    expect(existsSync(path.join(manualOutputRoot, "manual-app", "node_modules"))).toBe(
      false
    );
  }, 30_000);
});
