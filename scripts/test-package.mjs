import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), "jh4j-package-"));
const env = {
  ...process.env,
  CI: "1",
  NO_COLOR: "1",
  JH4J_HOME: path.join(temporary, "home"),
};
function execute(command, args, cwd) {
  const windowsNpm = process.platform === "win32" && command === "npm";
  const result = spawnSync(
    windowsNpm ? process.env.ComSpec || "cmd.exe" : command,
    windowsNpm ? ["/d", "/s", "/c", "npm", ...args] : args,
    {
      cwd,
      env,
      encoding: "utf8",
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} failed (${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  return result.stdout.trim();
}
try {
  const pkg = JSON.parse(
    await readFile(path.join(repository, "package.json"), "utf8"),
  );
  const packed = JSON.parse(
    execute(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary],
      repository,
    ),
  )[0];
  const published = new Set(packed.files.map((file) => file.path));
  for (const required of [
    "bin/jh4j.js",
    "dist/index.js",
    "README.md",
    "CHANGELOG.md",
    "catalog.schema.json",
    "docs/template-contract.md",
  ])
    assert(published.has(required), `Missing packed file: ${required}`);
  assert(
    ![...published].some(
      (file) => file.startsWith("tests/") || file.startsWith("src/"),
    ),
  );
  const consumer = path.join(temporary, "consumer");
  await mkdir(consumer);
  await writeFile(
    path.join(consumer, "package.json"),
    JSON.stringify({
      name: "package-smoke-test",
      private: true,
      version: "1.0.0",
    }),
  );
  execute(
    "npm",
    [
      "install",
      `../${packed.filename}`,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--registry=https://registry.npmjs.org",
    ],
    consumer,
  );
  const entry = path.join(
    consumer,
    "node_modules",
    ...pkg.name.split("/"),
    "bin/jh4j.js",
  );
  assert.equal(
    execute(process.execPath, [entry, "--version"], consumer),
    pkg.version,
  );
  assert(
    execute(process.execPath, [entry, "create", "--help"], consumer).includes(
      "--offline",
    ),
  );
  assert.equal(
    JSON.parse(
      execute(process.execPath, [entry, "config", "list", "--json"], consumer),
    ).autoInstall,
    false,
  );
  const template = path.join(temporary, "template");
  await cp(path.join(repository, "tests/fixtures/pc"), template, {
    recursive: true,
  });
  const output = JSON.parse(
    execute(
      process.execPath,
      [
        entry,
        "create",
        "packaged-project",
        "--template",
        "web.jh4j-mf-remote",
        "--source",
        template,
        "--skip-git",
        "--json",
      ],
      consumer,
    ),
  );
  assert.equal(output.ok, true);
  assert.equal(output.project.plan.input.projectName, "packaged-project");
  const metadata = JSON.parse(
    await readFile(
      path.join(consumer, "packaged-project/.jhlc/project.json"),
      "utf8",
    ),
  );
  assert.equal(metadata.createdBy, `${pkg.name}@${pkg.version}`);
  console.log(
    `Package smoke test passed: ${pkg.name}@${pkg.version} (${packed.entryCount} files, ${Math.round(packed.size / 1024)} KB)`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true, maxRetries: 3 });
}
