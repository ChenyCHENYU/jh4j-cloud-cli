import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findTemplate, loadCatalog } from "../src/catalog.js";
import { generateProject } from "../src/core/project-generator.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true, maxRetries: 3 })
    )
  );
});

describe("project generator", () => {
  it("creates a configured project without copying template artifacts", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "jh4j-cli-test-"));
    temporaryRoots.push(cwd);

    const result = await generateProject(
      findTemplate(await loadCatalog()),
      "jh4j-ui-orders",
      {
        yes: true,
        module: "orders",
        title: "订单中心",
        port: "8123",
        skipInstall: true,
        skipGit: true
      },
      cwd
    );

    const target = path.join(cwd, "jh4j-ui-orders");
    const config = JSON.parse(
      await readFile(path.join(target, "project.config.json"), "utf8")
    );
    const metadata = JSON.parse(
      await readFile(path.join(target, ".jhlc", "project.json"), "utf8")
    );

    expect(result.targetRoot).toBe(target);
    expect(config.moduleName).toBe("orders");
    expect(config.title).toBe("订单中心");
    expect(config.devServerPort).toBe(8123);
    expect(metadata.template).toEqual({
      id: "web.jh4j-mf-remote",
      version: "1.1.0"
    });
    expect(metadata.createdBy).toBe("@jhlc/jh4j-cloud-cli@0.3.0");
    expect(metadata.parameters.features).toEqual(["git-standards"]);
    expect(existsSync(path.join(target, "src", "views", "orders"))).toBe(true);
    expect(existsSync(path.join(target, "src", "views", "template"))).toBe(false);
    expect(existsSync(path.join(target, "node_modules"))).toBe(false);
    expect(existsSync(path.join(target, ".git"))).toBe(false);
  });

  it("can disable the complete Git standards bundle", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "jh4j-cli-no-standards-"));
    temporaryRoots.push(cwd);

    const result = await generateProject(
      findTemplate(await loadCatalog()),
      "jh4j-ui-plain",
      {
        yes: true,
        standards: false,
        skipInstall: true,
        skipGit: true
      },
      cwd
    );
    const target = path.join(cwd, "jh4j-ui-plain");
    const pkg = JSON.parse(
      await readFile(path.join(target, "package.json"), "utf8")
    );

    expect(result.features).toEqual([]);
    expect(pkg.devDependencies["@robot-admin/git-standards"]).toBeUndefined();
    expect(existsSync(path.join(target, ".husky"))).toBe(false);
    expect(existsSync(path.join(target, "commitlint.config.js"))).toBe(false);
    expect(existsSync(path.join(target, "pnpm-lock.yaml"))).toBe(false);
  });

  it("does not write files in dry-run mode", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "jh4j-cli-dry-run-"));
    temporaryRoots.push(cwd);

    await generateProject(
      findTemplate(await loadCatalog()),
      "jh4j-ui-preview",
      { yes: true, dryRun: true, skipInstall: true, skipGit: true },
      cwd
    );

    expect(existsSync(path.join(cwd, "jh4j-ui-preview"))).toBe(false);
  });

  it("merges a partial JSON creation config", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "jh4j-cli-config-file-"));
    temporaryRoots.push(cwd);
    const configFile = path.join(cwd, "input.json");
    await writeFile(
      configFile,
      JSON.stringify({
        moduleName: "configured",
        title: "配置文件项目",
        devServerPort: 8345,
        environments: {
          sit: {
            webUrl: "https://sit.example.internal",
            apiPrefix: "custom-sit-api"
          }
        }
      }),
      "utf8"
    );

    await generateProject(
      findTemplate(await loadCatalog()),
      "jh4j-ui-configured",
      {
        yes: true,
        config: configFile,
        skipInstall: true,
        skipGit: true
      },
      cwd
    );
    const generated = JSON.parse(
      await readFile(
        path.join(cwd, "jh4j-ui-configured", "project.config.json"),
        "utf8"
      )
    );
    expect(generated.moduleName).toBe("configured");
    expect(generated.title).toBe("配置文件项目");
    expect(generated.environments.sit).toEqual({
      webUrl: "https://sit.example.internal",
      apiPrefix: "custom-sit-api"
    });
  });
});
