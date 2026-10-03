import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplateManifest } from "../src/core/template-manifest.js";
import { generateProject } from "../src/core/project-generator.js";
import { copyFixture, temporaryRoot } from "./helpers.js";
import { readJson, writeJson } from "../src/utils/fs.js";
import type { CatalogTemplate, TemplateManifest } from "../src/types.js";
const catalog = (source: string): CatalogTemplate => ({
  id: "web.jh4j-mf-remote",
  name: "Test",
  description: "Test",
  category: "frontend",
  defaultSource: source,
  defaultRef: "main",
  status: "stable",
});
describe("template contracts", () => {
  it.each(["defaults", "category", "generatedMetadata"])(
    "rejects missing %s",
    async (key) => {
      const root = await temporaryRoot();
      const source = await copyFixture(root);
      const manifest = await readJson<Record<string, unknown>>(
        path.join(source, "template.manifest.json"),
      );
      delete manifest[key];
      await writeJson(path.join(source, "template.manifest.json"), manifest);
      await expect(loadTemplateManifest(source)).rejects.toThrow();
    },
  );
  it("rejects metadata path escapes", async () => {
    const root = await temporaryRoot();
    const source = await copyFixture(root);
    const manifest = await readJson<TemplateManifest>(
      path.join(source, "template.manifest.json"),
    );
    manifest.generatedMetadata = "../sentinel.json";
    await writeJson(path.join(source, "template.manifest.json"), manifest);
    await expect(loadTemplateManifest(source)).rejects.toThrow("越出");
  });
  it("runs the declared legacy entry instead of a fixed filename", async () => {
    const root = await temporaryRoot();
    const source = await copyFixture(root);
    const script = await readFile(
      path.join(source, "scripts/setup-project.mjs"),
      "utf8",
    );
    await writeFile(path.join(source, "scripts/bootstrap.mjs"), script);
    const manifest = await readJson<TemplateManifest>(
      path.join(source, "template.manifest.json"),
    );
    manifest.entry.nonInteractive = "node scripts/bootstrap.mjs --yes";
    await writeJson(path.join(source, "template.manifest.json"), manifest);
    const result = await generateProject(
      catalog(source),
      "custom-entry",
      { yes: true, skipGit: true },
      root,
    );
    expect(result.plan?.input.projectName).toBe("custom-entry");
  });
  it("rejects empty generated metadata before promotion", async () => {
    const root = await temporaryRoot();
    const source = await copyFixture(root);
    await writeFile(
      path.join(source, "scripts/setup-project.mjs"),
      'import {mkdir,writeFile} from "node:fs/promises";await mkdir(".jhlc",{recursive:true});await writeFile(".jhlc/project.json","{}");',
    );
    await expect(
      generateProject(
        catalog(source),
        "invalid-output",
        { yes: true, skipGit: true },
        root,
      ),
    ).rejects.toThrow("schemaVersion");
    await expect(
      readFile(path.join(root, "invalid-output/package.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("rejects unknown features even on featureless templates", async () => {
    const root = await temporaryRoot();
    const source = await copyFixture(root);
    const manifest = await readJson<TemplateManifest>(
      path.join(source, "template.manifest.json"),
    );
    manifest.features = [];
    await writeJson(path.join(source, "template.manifest.json"), manifest);
    await expect(
      generateProject(
        catalog(source),
        "features",
        { yes: true, skipGit: true, features: "unknown" },
        root,
      ),
    ).rejects.toThrow("不支持");
  });
  it("validates extension parameter defaults and constraints", async () => {
    const root = await temporaryRoot();
    const source = await copyFixture(root);
    const file = path.join(root, "input.json");
    const manifest = await readJson<TemplateManifest>(
      path.join(source, "template.manifest.json"),
    );
    manifest.parameters = [
      {
        name: "tenant",
        type: "string",
        required: true,
        default: "acme",
        pattern: "^[a-z]+$",
      },
      { name: "replicas", type: "number", minimum: 1, maximum: 3, default: 2 },
    ];
    await writeJson(path.join(source, "template.manifest.json"), manifest);
    const result = await generateProject(
      catalog(source),
      "extension",
      { yes: true, skipGit: true, dryRun: true },
      root,
    );
    expect(
      (result.plan?.input as unknown as Record<string, unknown>).tenant,
    ).toBe("acme");
    await writeJson(file, { replicas: 10 });
    await expect(
      generateProject(
        catalog(source),
        "extension",
        { yes: true, skipGit: true, config: file },
        root,
      ),
    ).rejects.toThrow("范围");
    await writeJson(file, { tenant: "bad-tenant" });
    await expect(
      generateProject(
        catalog(source),
        "extension",
        { yes: true, skipGit: true, config: file },
        root,
      ),
    ).rejects.toThrow("pattern");
  });
  it("rejects dangling target symlinks even with force", async () => {
    const root = await temporaryRoot();
    const source = await copyFixture(root);
    const { symlink, readlink } = await import("node:fs/promises");
    await symlink("missing-directory", path.join(root, "dangling"), "dir");
    await expect(
      generateProject(
        catalog(source),
        "dangling",
        { yes: true, force: true, skipGit: true },
        root,
      ),
    ).rejects.toThrow("符号链接");
    expect(await readlink(path.join(root, "dangling"))).toBe(
      "missing-directory",
    );
  });
  it("rejects wrong config types and unknown environment names", async () => {
    const root = await temporaryRoot();
    const source = await copyFixture(root);
    const file = path.join(root, "input.json");
    await writeJson(file, { title: 123 });
    await expect(
      generateProject(
        catalog(source),
        "bad-config",
        { yes: true, config: file, skipGit: true },
        root,
      ),
    ).rejects.toThrow("title");
    await writeJson(file, {
      environments: {
        production: { webUrl: "http://localhost", apiPrefix: "api" },
      },
    });
    await expect(
      generateProject(
        catalog(source),
        "bad-config",
        { yes: true, config: file, skipGit: true },
        root,
      ),
    ).rejects.toThrow("未知字段");
  });
});
