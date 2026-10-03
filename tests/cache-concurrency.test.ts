import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acquireTemplate,
  acquireTemplateFromSources,
} from "../src/core/template-source.js";
import {
  clearTemplateCache,
  listTemplateCache,
  readTemplateCacheEntry,
} from "../src/core/template-cache.js";
import { runCommand } from "../src/utils/process.js";
import { readJson, writeJson } from "../src/utils/fs.js";
import { copyFixture, temporaryRoot } from "./helpers.js";
afterEach(() => vi.unstubAllEnvs());
async function repository() {
  const root = await temporaryRoot();
  vi.stubEnv("JH4J_HOME", path.join(root, "home"));
  const repo = await copyFixture(root);
  await writeFile(path.join(repo, "marker.txt"), "one");
  await runCommand("git", ["init", "-b", "main"], { cwd: repo });
  await commit(repo);
  return { repo, source: pathToFileURL(repo).href };
}
async function commit(repo: string) {
  await runCommand("git", ["add", "-A"], { cwd: repo });
  await runCommand(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "fixture",
    ],
    { cwd: repo },
  );
}
describe("cache concurrency and recovery", () => {
  it("publishes concurrent refreshes and gives each reader an independent snapshot", async () => {
    const { source } = await repository();
    const readers = await Promise.all(
      Array.from({ length: 4 }, () =>
        acquireTemplate(source, "main", { noCache: true }),
      ),
    );
    expect(new Set(readers.map((reader) => reader.root)).size).toBe(4);
    expect(await listTemplateCache()).toHaveLength(1);
    await clearTemplateCache();
    for (const reader of readers) {
      expect(await readFile(path.join(reader.root, "marker.txt"), "utf8")).toBe(
        "one",
      );
      await reader.cleanup();
    }
  });
  it("keeps a reader's files stable while another task refreshes the same source", async () => {
    const { source, repo } = await repository();
    const first = await acquireTemplate(source, "main");
    await writeFile(path.join(repo, "marker.txt"), "two");
    await commit(repo);
    const second = await acquireTemplate(source, "main", { noCache: true });
    expect(await readFile(path.join(first.root, "marker.txt"), "utf8")).toBe(
      "one",
    );
    expect(await readFile(path.join(second.root, "marker.txt"), "utf8")).toBe(
      "two",
    );
    expect(first.provenance.commit).not.toBe(second.provenance.commit);
    await first.cleanup();
    await second.cleanup();
  });
  it("refreshes a corrupt cached contract and permits expired caches explicitly offline", async () => {
    const { source } = await repository();
    const first = await acquireTemplate(source, "main");
    await first.cleanup();
    const entry = (await readTemplateCacheEntry(source, "main"))!;
    const manifest = await readJson<Record<string, unknown>>(
      path.join(entry.root, "template.manifest.json"),
    );
    manifest.version = "invalid";
    await writeJson(path.join(entry.root, "template.manifest.json"), manifest);
    const repaired = await acquireTemplate(source, "main");
    expect(repaired.provenance.cached).toBe(false);
    await repaired.cleanup();
    const offline = await acquireTemplate(source, "main", {
      offline: true,
      cacheTtlMinutes: 0,
    });
    expect(offline.provenance.cached).toBe(true);
    await offline.cleanup();
  });
  it("falls back when the primary source has the wrong contract", async () => {
    const root = await temporaryRoot();
    const good = await copyFixture(root);
    const bad = path.join(root, "bad");
    await mkdir(bad);
    await writeJson(path.join(bad, "template.manifest.json"), {});
    const acquired = await acquireTemplateFromSources([bad, good], "main", {
      expectedTemplateId: "web.jh4j-mf-remote",
    });
    expect(acquired.root).toBe(good);
  });
  it("refreshes malformed cache provenance before returning a plan", async () => {
    const { source } = await repository();
    const first = await acquireTemplate(source, "main");
    await first.cleanup();
    const entry = (await readTemplateCacheEntry(source, "main"))!;
    await writeJson(path.join(path.dirname(entry.root), "metadata.json"), {
      ...entry.metadata,
      archiveSha256: "invalid",
    });
    expect(await listTemplateCache()).toHaveLength(0);
    const repaired = await acquireTemplate(source, "main");
    try {
      expect(repaired.provenance.cached).toBe(false);
      expect(repaired.provenance.commit).toMatch(/^[a-f0-9]{40}$/);
    } finally {
      await repaired.cleanup();
    }
  });
  it("fails offline without contacting a missing remote source", async () => {
    const root = await temporaryRoot();
    vi.stubEnv("JH4J_HOME", root);
    await expect(
      acquireTemplate("https://example.invalid/missing.git", "main", {
        offline: true,
      }),
    ).rejects.toMatchObject({ code: "OFFLINE_CACHE_MISS" });
  });
});
