import { describe, expect, it } from "vitest";
import { collectDoctorChecks } from "../src/commands/doctor.js";

describe("doctor", () => {
  it("recognizes the local development environment", async () => {
    const checks = await collectDoctorChecks();
    expect(checks).toHaveLength(5);
    expect(checks.every((check) => check.ok)).toBe(true);
  });
});
