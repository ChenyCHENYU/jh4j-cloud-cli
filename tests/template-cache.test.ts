import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { c as createTar } from "tar";
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTemplateTree } from "../src/utils/fs.js";
import { runCommand } from "../src/utils/process.js";
import {
  acquireTemplate,
  acquireTemplateFromSources
} from "../src/core/template-source.js";
import { listTemplateCache } from "../src/core/template-cache.js";

let temporaryRoot: string | undefined;
const sourceTemplate = path.resolve("../jh4j-ui-template");

afterEach(async () => {
  vi.unstubAllEnvs();
  if (temporaryRoot) {
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3 });
  }
  temporaryRoot = undefined;
});

describe("template cache", () => {
  it("caches a Git template by source and ref", async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "jh4j-cache-test-"));
    vi.stubEnv("JH4J_HOME", path.join(temporaryRoot, "home"));
    const repository = path.join(temporaryRoot, "template-repository");
    await copyTemplateTree(sourceTemplate, repository);
    await runCommand("git", ["init", "-b", "main"], { cwd: repository, stdio: "pipe" });
    await runCommand("git", ["add", "-A"], { cwd: repository, stdio: "pipe" });
    await runCommand("git", ["commit", "-m", "test template"], {
      cwd: repository,
      stdio: "pipe"
    });

    const source = pathToFileURL(repository).href;
    const first = await acquireTemplateFromSources(
      [path.join(temporaryRoot, "missing-template"), source],
      "main",
      {
      noCache: true,
      cacheTtlMinutes: 60
      }
    );
    expect(first.source).toBe(`${source}#main`);
    const second = await acquireTemplate(source, "main", { cacheTtlMinutes: 60 });
    expect(second.source).toContain("(cache)");
    expect(await listTemplateCache()).toHaveLength(1);
  });

  it("extracts and caches an offline template archive", async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "jh4j-archive-test-"));
    vi.stubEnv("JH4J_HOME", path.join(temporaryRoot, "home"));
    const packedDirectory = path.join(temporaryRoot, "packed-template");
    await copyTemplateTree(sourceTemplate, packedDirectory);
    const archive = path.join(temporaryRoot, "jh4j-ui-template.tgz");
    await createTar(
      { gzip: true, file: archive, cwd: temporaryRoot },
      [path.basename(packedDirectory)]
    );

    const acquired = await acquireTemplate(archive, "main", {
      noCache: true,
      cacheTtlMinutes: 60
    });
    expect(existsSync(path.join(acquired.root, "template.manifest.json"))).toBe(true);
    expect(acquired.source).toContain("(archive)");
    expect(await listTemplateCache()).toHaveLength(1);
  });
});
