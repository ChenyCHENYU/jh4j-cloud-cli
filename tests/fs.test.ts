import {
  mkdir,
  readFile,
  readlink,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { copyTemplateTree } from "../src/utils/fs.js";
import { temporaryRoot } from "./helpers.js";
describe("template copy boundaries", () => {
  it("keeps copied internal links independent of the source", async () => {
    const root = await temporaryRoot();
    const source = path.join(root, "source"),
      target = path.join(root, "target");
    await mkdir(source);
    await writeFile(path.join(source, "shared.txt"), "original");
    await symlink("shared.txt", path.join(source, "config.txt"));
    await copyTemplateTree(source, target);
    await writeFile(path.join(target, "config.txt"), "changed");
    expect(await readFile(path.join(source, "shared.txt"), "utf8")).toBe(
      "original",
    );
    expect(await readlink(path.join(target, "config.txt"))).toBe("shared.txt");
  });
  it("rejects external and dangling symlinks", async () => {
    const root = await temporaryRoot();
    const source = path.join(root, "source");
    await mkdir(source);
    await writeFile(path.join(root, "external.txt"), "external");
    await symlink("../external.txt", path.join(source, "link"));
    await expect(
      copyTemplateTree(source, path.join(root, "target")),
    ).rejects.toThrow("模板外部");
  });
  it("supports a symlinked source root and excludes nested dependencies", async () => {
    const root = await temporaryRoot();
    const source = path.join(root, "source");
    await mkdir(path.join(source, "nested/node_modules"), { recursive: true });
    await writeFile(path.join(source, "nested/node_modules/skip.txt"), "skip");
    await writeFile(path.join(source, "keep.txt"), "keep");
    await symlink(source, path.join(root, "alias"), "dir");
    await copyTemplateTree(path.join(root, "alias"), path.join(root, "target"));
    expect(await readFile(path.join(root, "target/keep.txt"), "utf8")).toBe(
      "keep",
    );
    await expect(
      readFile(path.join(root, "target/nested/node_modules/skip.txt")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("rejects a destination hidden inside the source by a parent symlink", async () => {
    const root = await temporaryRoot();
    const source = path.join(root, "source");
    await mkdir(source);
    await symlink(source, path.join(root, "alias"), "dir");
    await expect(
      copyTemplateTree(source, path.join(root, "alias/output")),
    ).rejects.toThrow("互相包含");
    await expect(
      readFile(path.join(source, "output/anything")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
