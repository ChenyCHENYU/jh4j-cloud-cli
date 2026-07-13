import path from "node:path";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadTemplateManifest } from "../src/core/template-manifest.js";
import { findTemplate, loadCatalog } from "../src/catalog.js";

const templateRoot = fileURLToPath(
  new URL("../../jh4j-ui-template/", import.meta.url)
);

describe("template manifest", () => {
  it("loads the standalone PC template contract", async () => {
    const manifest = await loadTemplateManifest(templateRoot);
    expect(manifest.id).toBe("web.jh4j-mf-remote");
    expect(manifest.version).toBe("1.1.0");
    expect(manifest.runtime.recommendedNode).toBe("24");
    expect(manifest.features?.[0]).toMatchObject({
      id: "git-standards",
      package: "@robot-admin/git-standards",
      defaultEnabled: true
    });
    expect(path.basename(templateRoot)).toBe("jh4j-ui-template");
  });

  it("loads the built-in catalog", async () => {
    const catalog = await loadCatalog();
    expect(findTemplate(catalog).id).toBe("web.jh4j-mf-remote");
  });
});
