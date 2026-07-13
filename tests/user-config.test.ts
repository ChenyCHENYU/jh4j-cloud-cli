import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_USER_CONFIG,
  loadUserConfig,
  parseUserConfigValue,
  saveUserConfig
} from "../src/core/user-config.js";

let temporaryRoot: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

describe("user config", () => {
  it("persists typed team defaults under JH4J_HOME", async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "jh4j-config-test-"));
    vi.stubEnv("JH4J_HOME", temporaryRoot);

    expect(await loadUserConfig()).toEqual(DEFAULT_USER_CONFIG);
    expect(DEFAULT_USER_CONFIG.autoInstall).toBe(false);
    const config = { ...(await loadUserConfig()), autoInstall: false, cacheTtlMinutes: 120 };
    await saveUserConfig(config);
    expect(await loadUserConfig()).toEqual(config);
  });

  it("parses boolean and numeric values safely", () => {
    expect(parseUserConfigValue("autoGit", "false")).toEqual(["autoGit", false]);
    expect(parseUserConfigValue("cacheTtlMinutes", "30")).toEqual([
      "cacheTtlMinutes",
      30
    ]);
    expect(() => parseUserConfigValue("autoGit", "maybe")).toThrow();
    expect(() => parseUserConfigValue("unknown", "value")).toThrow();
  });
});
