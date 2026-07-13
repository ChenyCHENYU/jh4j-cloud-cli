import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyTemplateTree } from "../src/utils/fs.js";
import { generateProject } from "../src/core/project-generator.js";
import type { CatalogTemplate } from "../src/types.js";

let temporaryRoot: string | undefined;
const sourceTemplate = path.resolve("../jh4j-ui-template");

afterEach(async () => {
  if (temporaryRoot) {
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3 });
  }
  temporaryRoot = undefined;
});

describe("generation transaction", () => {
  it("keeps an existing target untouched when template setup fails", async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "jh4j-transaction-test-"));
    const brokenTemplate = path.join(temporaryRoot, "broken-template");
    await copyTemplateTree(sourceTemplate, brokenTemplate);
    await writeFile(
      path.join(brokenTemplate, "scripts", "setup-project.mjs"),
      'console.error("broken setup"); process.exit(2);\n',
      "utf8"
    );

    const target = path.join(temporaryRoot, "existing-app");
    await mkdir(target);
    await writeFile(path.join(target, "sentinel.txt"), "keep-me", "utf8");

    const catalogTemplate: CatalogTemplate = {
      id: "web.jh4j-mf-remote",
      name: "broken",
      description: "test",
      category: "frontend",
      sourceEnvironment: "UNUSED_TEMPLATE_SOURCE",
      defaultSource: brokenTemplate,
      defaultRef: "main",
      status: "beta"
    };

    await expect(
      generateProject(
        catalogTemplate,
        "existing-app",
        { yes: true, force: true, skipInstall: true, skipGit: true },
        temporaryRoot
      )
    ).rejects.toThrow("执行失败");

    expect(await readFile(path.join(target, "sentinel.txt"), "utf8")).toBe(
      "keep-me"
    );
    expect(existsSync(path.join(target, "package.json"))).toBe(false);
    expect(
      (await readdir(temporaryRoot)).some((name) => name.includes(".jh4j-tmp-"))
    ).toBe(false);
  });
});
