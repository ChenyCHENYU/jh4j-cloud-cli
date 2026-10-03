import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";
export const fixtureRoot = fileURLToPath(
  new URL("./fixtures/pc/", import.meta.url),
);
export const mobileFixtureRoot = fileURLToPath(
  new URL("./fixtures/mobile/", import.meta.url),
);
export const roots: string[] = [];
export async function temporaryRoot(prefix = "jh4j-test-"): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}
export async function copyFixture(
  root: string,
  category: "pc" | "mobile" = "pc",
): Promise<string> {
  const target = path.join(root, "template");
  await cp(category === "pc" ? fixtureRoot : mobileFixtureRoot, target, {
    recursive: true,
  });
  return target;
}
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 3 })),
  );
});
