import { createServer } from "node:http";
import { open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { c as createTar, Header } from "tar";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireTemplate,
  MAX_ARCHIVE_BYTES,
} from "../src/core/template-source.js";
import { fixtureRoot, temporaryRoot } from "./helpers.js";

beforeEach(async () =>
  vi.stubEnv("JH4J_HOME", path.join(await temporaryRoot(), "home")),
);
afterEach(() => vi.unstubAllEnvs());
async function maliciousArchive(
  header: ConstructorParameters<typeof Header>[0],
) {
  const file = path.join(await temporaryRoot(), "unsafe.tar");
  const entry = new Header(header);
  const block = Buffer.alloc(512);
  entry.encode(block);
  await writeFile(file, Buffer.concat([block, Buffer.alloc(1024)]));
  return file;
}
describe("archive acquisition", () => {
  it("extracts a local archive and records its digest", async () => {
    const root = await temporaryRoot();
    const file = path.join(root, "template.tgz");
    await createTar({ gzip: true, file, cwd: fixtureRoot }, ["."]);
    const result = await acquireTemplate(file, "main", {
      expectedTemplateId: "web.jh4j-mf-remote",
    });
    try {
      expect(result.provenance.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.provenance.ref).toBeNull();
      expect(
        JSON.parse(
          await readFile(
            path.join(result.root, "template.manifest.json"),
            "utf8",
          ),
        ).version,
      ).toBe("1.0.0");
    } finally {
      await result.cleanup();
    }
  });
  it.each(["../escaped.txt", "/absolute.txt", "bad\\windows.txt"])(
    "rejects unsafe entry %s",
    async (entryPath) => {
      const file = await maliciousArchive({
        path: entryPath,
        type: "File",
        size: 0,
        mode: 0o644,
      });
      await expect(acquireTemplate(file, "main")).rejects.toThrow();
    },
  );
  it("rejects archive declarations exceeding the extracted size limit", async () => {
    const file = await maliciousArchive({
      path: "huge",
      type: "File",
      size: 2 * 1024 * 1024 * 1024,
      mode: 0o644,
    });
    await expect(acquireTemplate(file, "main")).rejects.toMatchObject({
      code: "ARCHIVE_LIMIT",
    });
  });
  it("rejects a local archive before copying an oversized file", async () => {
    const file = path.join(await temporaryRoot(), "huge.tar");
    const handle = await open(file, "w");
    try {
      await handle.truncate(MAX_ARCHIVE_BYTES + 1);
    } finally {
      await handle.close();
    }
    await expect(acquireTemplate(file, "main")).rejects.toMatchObject({
      code: "ARCHIVE_LIMIT",
    });
  });
  it("rejects oversized HTTP content before buffering the response", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, {
        "content-length": String(MAX_ARCHIVE_BYTES + 1),
      });
      response.end("large");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test server port");
    try {
      await expect(
        acquireTemplate(
          `http://127.0.0.1:${address.port}/template.tgz`,
          "main",
        ),
      ).rejects.toMatchObject({ code: "ARCHIVE_LIMIT" });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
