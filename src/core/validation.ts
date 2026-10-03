import { valid, validRange } from "semver";
import { CliError } from "./errors.js";
import type {
  ProjectMetadata,
  TemplateEntry,
  TemplateManifest,
  UserConfig,
} from "../types.js";
import { resolveContainedPath } from "../utils/fs.js";

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CliError(`${label} 必须是对象`, "INVALID_CONFIG");
  return value as Record<string, unknown>;
}
export function textValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new CliError(`${label} 必须是非空字符串`, "INVALID_CONFIG");
  if (/[\u0000-\u001f\u007f]/.test(value))
    throw new CliError(`${label} 不得包含控制字符`, "INVALID_CONFIG");
  return value.trim();
}
export function httpUrl(value: unknown, label: string): string {
  const text = textValue(value, label);
  try {
    const url = new URL(text);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error();
    return text.replace(/\/+$/, "");
  } catch {
    throw new CliError(
      `${label} 必须是不包含用户名和密码的 http/https URL`,
      "INVALID_CONFIG",
    );
  }
}
function booleanValue(value: unknown, label: string): void {
  if (typeof value !== "boolean")
    throw new CliError(`${label} 必须是布尔值`, "INVALID_CONFIG");
}
export function integerValue(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new CliError(
      `${label} 必须是 ${minimum} 到 ${maximum} 之间的整数`,
      "INVALID_CONFIG",
    );
  return value;
}
function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value))
    throw new CliError(`${label} 必须是字符串数组`, "INVALID_CONFIG");
  return value.map((item, index) => textValue(item, `${label}[${index}]`));
}
export function exactKeys(
  value: Record<string, unknown>,
  keys: Iterable<string>,
  label: string,
): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length)
    throw new CliError(
      `${label} 包含未知字段: ${unknown.join(", ")}`,
      "INVALID_CONFIG",
    );
}

export function parseTemplateEntry(entry: unknown): TemplateEntry {
  let parsed: TemplateEntry;
  if (typeof entry === "string") {
    const tokens =
      entry
        .match(/"[^"]*"|'[^']*'|[^\s]+/g)
        ?.map((token) => (/^['"]/.test(token) ? token.slice(1, -1) : token)) ??
      [];
    if (tokens.shift() !== "node" || !tokens.length)
      throw new CliError(
        "初始化入口必须为 node <模板内脚本> [参数]，或 { script, args }",
        "INVALID_TEMPLATE",
      );
    parsed = { script: tokens.shift()!, args: tokens };
  } else {
    const value = record(entry, "entry.nonInteractive");
    exactKeys(value, ["script", "args"], "初始化入口");
    parsed = {
      script: textValue(value.script, "entry.script"),
      args: value.args === undefined ? [] : strings(value.args, "entry.args"),
    };
  }
  textValue(parsed.script, "entry.script");
  resolveContainedPath(process.cwd(), parsed.script, "初始化脚本");
  if (!/\.(?:mjs|cjs|js)$/.test(parsed.script) || /["'`]/.test(parsed.script))
    throw new CliError(
      "初始化入口必须指向模板内的 .mjs、.cjs 或 .js 脚本",
      "INVALID_TEMPLATE",
    );
  for (const arg of parsed.args ?? []) textValue(arg, "entry.args");
  return parsed;
}

export function validateManifest(value: unknown): TemplateManifest {
  const manifest = record(value, "Manifest");
  if (manifest.schemaVersion !== 1)
    throw new CliError("Manifest schemaVersion 必须为 1", "INVALID_TEMPLATE");
  for (const key of ["id", "name", "description", "version"] as const)
    textValue(manifest[key], `Manifest.${key}`);
  if (
    !/^[a-z][a-z0-9.-]+$/.test(manifest.id as string) ||
    !valid(manifest.version as string)
  )
    throw new CliError("模板 id 或语义化版本无效", "INVALID_TEMPLATE");
  if (!["frontend", "backend", "mobile"].includes(manifest.category as string))
    throw new CliError("模板 category 无效", "INVALID_TEMPLATE");
  const runtime = record(manifest.runtime, "Manifest.runtime");
  if (!validRange(textValue(runtime.node, "runtime.node")))
    throw new CliError(
      "runtime.node 必须是有效的 semver 范围",
      "INVALID_TEMPLATE",
    );
  textValue(runtime.recommendedNode, "runtime.recommendedNode");
  const manager = textValue(runtime.packageManager, "runtime.packageManager");
  if (!manager.startsWith("pnpm@") || !valid(manager.slice(5)))
    throw new CliError(
      "当前模板契约要求 packageManager 为 pnpm@<版本>",
      "INVALID_TEMPLATE",
    );
  const defaults = record(manifest.defaults, "Manifest.defaults");
  for (const key of ["projectName", "moduleName", "title"])
    textValue(defaults[key], `defaults.${key}`);
  integerValue(defaults.devServerPort, "defaults.devServerPort", 1024, 65535);
  for (const key of ["npmRegistry", "jhlcRegistry"])
    httpUrl(defaults[key], `defaults.${key}`);
  for (const key of ["localBackendUrl", "localPublicUrl"])
    if (defaults[key] !== undefined) httpUrl(defaults[key], `defaults.${key}`);
  const entry = record(manifest.entry, "Manifest.entry");
  parseTemplateEntry(entry.nonInteractive);
  if (entry.interactive !== undefined) parseTemplateEntry(entry.interactive);
  resolveContainedPath(
    process.cwd(),
    textValue(manifest.generatedMetadata, "generatedMetadata"),
    "生成元数据",
  );
  if (manifest.features !== undefined && !Array.isArray(manifest.features))
    throw new CliError("features 必须是数组", "INVALID_TEMPLATE");
  const ids = new Set<string>();
  for (const item of (manifest.features ?? []) as unknown[]) {
    const feature = record(item, "feature");
    const id = textValue(feature.id, "feature.id");
    if (!/^[a-z][a-z0-9-]*$/.test(id) || ids.has(id))
      throw new CliError(`模板能力 id 无效或重复: ${id}`, "INVALID_TEMPLATE");
    ids.add(id);
    textValue(feature.name, `feature.${id}.name`);
    textValue(feature.description, `feature.${id}.description`);
    booleanValue(feature.defaultEnabled, `feature.${id}.defaultEnabled`);
    if (feature.required !== undefined)
      booleanValue(feature.required, `feature.${id}.required`);
    if (feature.package !== undefined)
      textValue(feature.package, `feature.${id}.package`);
  }
  if (manifest.parameters !== undefined) {
    if (!Array.isArray(manifest.parameters))
      throw new CliError("parameters 必须是数组", "INVALID_TEMPLATE");
    const names = new Set<string>();
    for (const item of manifest.parameters) {
      const parameter = record(item, "parameter");
      const name = textValue(parameter.name, "parameter.name");
      if (
        !["string", "number", "boolean"].includes(parameter.type as string) ||
        names.has(name) ||
        ["__proto__", "constructor", "prototype"].includes(name)
      )
        throw new CliError(`模板参数无效或重复: ${name}`, "INVALID_TEMPLATE");
      if (parameter.required !== undefined)
        booleanValue(parameter.required, `parameter.${name}.required`);
      if (
        parameter.default !== undefined &&
        typeof parameter.default !== parameter.type
      )
        throw new CliError(
          `参数 ${name} 的默认值类型不一致`,
          "INVALID_TEMPLATE",
        );
      if (parameter.pattern !== undefined) {
        if (parameter.type !== "string")
          throw new CliError(
            `参数 ${name} 只有字符串可以声明 pattern`,
            "INVALID_TEMPLATE",
          );
        try {
          new RegExp(textValue(parameter.pattern, `parameter.${name}.pattern`));
        } catch {
          throw new CliError(
            `参数 ${name} 的 pattern 无效`,
            "INVALID_TEMPLATE",
          );
        }
      }
      for (const key of ["minimum", "maximum"])
        if (
          parameter[key] !== undefined &&
          (parameter.type !== "number" ||
            typeof parameter[key] !== "number" ||
            !Number.isFinite(parameter[key]))
        )
          throw new CliError(`参数 ${name} 的 ${key} 无效`, "INVALID_TEMPLATE");
      if (
        typeof parameter.minimum === "number" &&
        typeof parameter.maximum === "number" &&
        parameter.minimum > parameter.maximum
      )
        throw new CliError(
          `参数 ${name} 的 minimum 超过 maximum`,
          "INVALID_TEMPLATE",
        );
      if (
        parameter.format !== undefined &&
        (parameter.type !== "string" || parameter.format !== "uri")
      )
        throw new CliError(
          `参数 ${name} 的 format 仅支持字符串 uri`,
          "INVALID_TEMPLATE",
        );
      if (
        parameter.enum !== undefined &&
        (!Array.isArray(parameter.enum) ||
          !parameter.enum.length ||
          parameter.enum.some((item) => typeof item !== parameter.type))
      )
        throw new CliError(`参数 ${name} 的 enum 无效`, "INVALID_TEMPLATE");
      names.add(name);
    }
  }
  if (manifest.display !== undefined) {
    const display = record(manifest.display, "display");
    for (const key of ["techStack", "corePackages"])
      if (display[key] !== undefined) strings(display[key], `display.${key}`);
    if (
      display.startScript !== undefined &&
      !/^[a-z0-9:_-]+$/i.test(
        textValue(display.startScript, "display.startScript"),
      )
    )
      throw new CliError("display.startScript 无效", "INVALID_TEMPLATE");
  }
  return manifest as unknown as TemplateManifest;
}

export const USER_CONFIG_KEYS = [
  "schemaVersion",
  "catalogFile",
  "templateSource",
  "templateRef",
  "npmRegistry",
  "jhlcRegistry",
  "autoInstall",
  "autoGit",
  "cacheTtlMinutes",
] as const;
export function validateUserConfig(
  value: unknown,
): asserts value is Partial<UserConfig> {
  const config = record(value, "用户配置");
  exactKeys(config, USER_CONFIG_KEYS, "用户配置");
  if (config.schemaVersion !== undefined && config.schemaVersion !== 1)
    throw new CliError(
      `不支持的用户配置版本: ${String(config.schemaVersion)}`,
      "INVALID_CONFIG",
    );
  for (const key of ["autoInstall", "autoGit"])
    if (config[key] !== undefined) booleanValue(config[key], key);
  if (config.cacheTtlMinutes !== undefined)
    integerValue(config.cacheTtlMinutes, "cacheTtlMinutes", 0, 10080);
  for (const key of ["catalogFile", "templateSource", "templateRef"])
    if (config[key] !== undefined) textValue(config[key], key);
  for (const key of ["npmRegistry", "jhlcRegistry"])
    if (config[key] !== undefined) httpUrl(config[key], key);
}

export function validateMetadata(value: unknown): ProjectMetadata {
  const metadata = record(value, "项目元数据");
  if (metadata.schemaVersion !== 1)
    throw new CliError("项目元数据 schemaVersion 必须为 1", "INVALID_METADATA");
  const template = record(metadata.template, "metadata.template");
  textValue(template.id, "metadata.template.id");
  if (!valid(textValue(template.version, "metadata.template.version")))
    throw new CliError("项目元数据模板版本无效", "INVALID_METADATA");
  if (
    !Number.isFinite(
      Date.parse(textValue(metadata.createdAt, "metadata.createdAt")),
    )
  )
    throw new CliError("项目元数据创建时间无效", "INVALID_METADATA");
  textValue(metadata.createdBy, "metadata.createdBy");
  if (metadata.platformVersion !== null)
    textValue(metadata.platformVersion, "metadata.platformVersion");
  record(metadata.parameters, "metadata.parameters");
  if (metadata.provenance !== undefined) {
    const provenance = record(metadata.provenance, "metadata.provenance");
    textValue(provenance.source, "provenance.source");
    if (provenance.ref !== null) textValue(provenance.ref, "provenance.ref");
    if (
      provenance.commit !== null &&
      !/^[a-f0-9]{40,64}$/.test(
        textValue(provenance.commit, "provenance.commit"),
      )
    )
      throw new CliError("来源 commit 无效", "INVALID_METADATA");
    if (
      provenance.archiveSha256 !== undefined &&
      !/^[a-f0-9]{64}$/.test(
        textValue(provenance.archiveSha256, "provenance.archiveSha256"),
      )
    )
      throw new CliError("来源 archiveSha256 无效", "INVALID_METADATA");
    booleanValue(provenance.cached, "provenance.cached");
  }
  return metadata as unknown as ProjectMetadata;
}
