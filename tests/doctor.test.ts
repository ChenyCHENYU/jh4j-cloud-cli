import { describe, expect, it, vi } from "vitest";
import { collectDoctorChecks } from "../src/commands/doctor.js";
import { DEFAULT_USER_CONFIG } from "../src/core/user-config.js";
import { fixtureRoot, mobileFixtureRoot, temporaryRoot } from "./helpers.js";
vi.mock("../src/utils/process.js", () => ({
  inspectCommand: vi.fn(async (command: string) => ({
    ok: true,
    output: command === "pnpm" ? "11.8.0" : "git version 2.40.0",
  })),
}));
describe("doctor", () => {
  it("validates supplied fixtures without requiring neighboring repositories", async () => {
    vi.stubEnv("JH4J_HOME", await temporaryRoot());
    const checks = await collectDoctorChecks(DEFAULT_USER_CONFIG, [
      {
        id: "web.jh4j-mf-remote",
        name: "PC",
        description: "PC",
        category: "frontend",
        defaultSource: fixtureRoot,
        defaultRef: "main",
        status: "stable",
      },
      {
        id: "mobile.robot-h5",
        name: "Mobile",
        description: "Mobile",
        category: "mobile",
        defaultSource: mobileFixtureRoot,
        defaultRef: "main",
        status: "stable",
      },
    ]);
    expect(checks).toHaveLength(6);
    expect(checks.every((check) => check.ok)).toBe(true);
    vi.unstubAllEnvs();
  });
  it("marks untested remote sources as unchecked", async () => {
    vi.stubEnv("JH4J_HOME", await temporaryRoot());
    const checks = await collectDoctorChecks(DEFAULT_USER_CONFIG, [
      {
        id: "web.remote",
        name: "Remote",
        description: "Remote",
        category: "frontend",
        defaultSource: "https://example.invalid/template.git",
        defaultRef: "main",
        status: "stable",
      },
    ]);
    expect(checks.at(-1)).toMatchObject({ ok: null, status: "unchecked" });
    vi.unstubAllEnvs();
  });
});
