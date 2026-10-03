import { mkdir, readFile, writeFile, rm, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const input = JSON.parse(
  await readFile(args[args.indexOf("--config") + 1], "utf8"),
);
const manifest = JSON.parse(await readFile("template.manifest.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
await writeFile("project.config.json", JSON.stringify(input));
pkg.name = input.projectName;
if (!input.features.includes("git-standards")) {
  delete pkg.devDependencies["@robot-admin/git-standards"];
  for (const file of [".husky", "commitlint.config.js", "pnpm-lock.yaml"])
    await rm(file, { force: true, recursive: true });
}
await writeFile("package.json", JSON.stringify(pkg));
if (existsSync("src/views/template"))
  await rename("src/views/template", path.join("src/views", input.moduleName));
await writeFile(
  ".env.development",
  `VITE_PORT = ${input.devServerPort}\nVITE_GLOB_APP_ID = ${input.projectName}\nVITE_API = ${input.localBackendUrl}/api\n`,
);
await mkdir(".jhlc", { recursive: true });
await writeFile(
  ".jhlc/project.json",
  JSON.stringify({
    schemaVersion: 1,
    template: { id: manifest.id, version: manifest.version },
    platformVersion: null,
    createdAt: new Date().toISOString(),
    createdBy: args[args.indexOf("--created-by") + 1],
    parameters: input,
  }),
);
