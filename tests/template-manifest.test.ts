import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplateManifest } from "../src/core/template-manifest.js";
import { findTemplate, loadCatalog } from "../src/catalog.js";

import {
  fixtureRoot as templateRoot,
  mobileFixtureRoot as mobileTemplateRoot,
} from "./helpers.js";

describe("template manifest", () => {
  it("loads the standalone PC template contract", async () => {
    const manifest = await loadTemplateManifest(templateRoot);
    expect(manifest.id).toBe("web.jh4j-mf-remote");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.runtime.recommendedNode).toBe("24");
    expect(manifest.features?.[0]).toMatchObject({
      id: "git-standards",
      package: "@robot-admin/git-standards",
      defaultEnabled: true,
    });
    expect(path.basename(templateRoot)).toBe("pc");
  });

  it("loads the standalone mobile template contract", async () => {
    const manifest = await loadTemplateManifest(mobileTemplateRoot);
    expect(manifest.id).toBe("mobile.robot-h5");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.category).toBe("mobile");
    expect(manifest.runtime.recommendedNode).toBe("24");
    expect(manifest.features?.[0]).toMatchObject({
      id: "git-standards",
      package: "@robot-admin/git-standards",
      defaultEnabled: true,
    });
  });

  it("loads the built-in catalog", async () => {
    const catalog = await loadCatalog();
    expect(findTemplate(catalog).id).toBe("web.jh4j-mf-remote");
    expect(findTemplate(catalog, "mobile.robot-h5").defaultRef).toBe("v1.7.1");
  });
});
