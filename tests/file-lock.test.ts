import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withFileLock } from "../src/utils/file-lock.js";
import { temporaryRoot } from "./helpers.js";
describe("filesystem locks", () => {
  it("serializes writers and releases locks after failures", async () => {
    const root = await temporaryRoot();
    const lock = path.join(root, "lock");
    let active = 0,
      max = 0;
    await Promise.all(
      Array.from({ length: 4 }, () =>
        withFileLock(lock, async () => {
          max = Math.max(max, ++active);
          await new Promise((resolve) => setTimeout(resolve, 10));
          active--;
        }),
      ),
    );
    expect(max).toBe(1);
    await expect(
      withFileLock(lock, async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    expect(await withFileLock(lock, async () => "released")).toBe("released");
  });
  it("recovers a dead recovery owner as well", async () => {
    const root = await temporaryRoot();
    const lock = path.join(root, "lock");
    for (const directory of [lock, `${lock}.reaper`]) {
      await mkdir(directory);
      await writeFile(
        path.join(directory, "owner.json"),
        JSON.stringify({ pid: 2147483647, token: "dead" }),
      );
    }
    expect(await withFileLock(lock, async () => "recovered")).toBe("recovered");
  });
  it("recovers a dead owner's lock with concurrent waiters", async () => {
    const root = await temporaryRoot();
    const lock = path.join(root, "lock");
    await mkdir(lock);
    await writeFile(
      path.join(lock, "owner.json"),
      JSON.stringify({ pid: 2147483647, token: "dead" }),
    );
    let active = 0,
      max = 0;
    await Promise.all(
      Array.from({ length: 4 }, () =>
        withFileLock(lock, async () => {
          max = Math.max(max, ++active);
          await new Promise((resolve) => setTimeout(resolve, 10));
          active--;
        }),
      ),
    );
    expect(max).toBe(1);
  });
});
