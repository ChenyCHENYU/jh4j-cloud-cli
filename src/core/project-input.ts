import path from "node:path";
import { readJson } from "../utils/fs.js";
import { CliError } from "./errors.js";
import {
  exactKeys,
  httpUrl,
  integerValue,
  record,
  textValue,
} from "./validation.js";
import type {
  CreateOptions,
  ProjectInput,
  TemplateManifest,
  UserConfig,
} from "../types.js";

export type PartialProjectInput = Partial<
  Omit<ProjectInput, "environments">
> & {
  environments?: Record<string, Partial<{ webUrl: string; apiPrefix: string }>>;
  [key: string]: unknown;
};
export function normalizeProjectName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^[._-]+/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/[-._]+$/, "");
}
export function ensureProjectName(value: unknown): string {
  const name = normalizeProjectName(textValue(value, "项目名称"));
  if (
    !/^[a-z0-9][a-z0-9._-]*$/.test(name) ||
    name.length > 100 ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  )
    throw new CliError(
      "项目名称需包含字母或数字，长度不超过 100，且不能使用 Windows 保留名称",
      "INVALID_INPUT",
    );
  return name;
}
export function ensureModuleName(value: unknown): string {
  const name = textValue(value, "模块标识");
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    throw new CliError(
      "模块标识必须以小写字母开头，只能包含小写字母、数字和连字符",
      "INVALID_INPUT",
    );
  return name;
}
export function inferModuleName(projectName: string, fallback: string): string {
  const inferred = projectName
    .replace(/^(?:jh4j|wl)-(?:ui|mobile)-/, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "");
  return /^[a-z]/.test(inferred) ? inferred : fallback;
}
export function ensurePort(value: unknown): number {
  if (typeof value === "string" && !/^\d+$/.test(value))
    throw new CliError(
      "开发端口必须是 1024 到 65535 之间的整数",
      "INVALID_INPUT",
    );
  return integerValue(
    typeof value === "string" ? Number(value) : value,
    "开发端口",
    1024,
    65535,
  );
}
export async function loadCreateConfig(
  file: string | undefined,
  cwd: string,
): Promise<PartialProjectInput> {
  if (!file) return {};
  const input = record(await readJson(path.resolve(cwd, file)), "创建配置");
  return input as PartialProjectInput;
}
export function validateCreateConfig(
  input: PartialProjectInput,
  manifest: TemplateManifest,
  sourceConfig: Record<string, unknown>,
): void {
  exactKeys(
    input,
    [
      "projectName",
      "moduleName",
      "title",
      "devServerPort",
      "npmRegistry",
      "jhlcRegistry",
      "localBackendUrl",
      "localPublicUrl",
      "features",
      "environments",
      ...Object.keys(sourceConfig),
      ...(manifest.parameters ?? []).map((p) => p.name),
    ],
    "创建配置",
  );
  for (const key of ["projectName", "moduleName", "title"])
    if (input[key] !== undefined) textValue(input[key], key);
  if (input.devServerPort !== undefined)
    integerValue(input.devServerPort, "devServerPort", 1024, 65535);
  for (const key of [
    "npmRegistry",
    "jhlcRegistry",
    "localBackendUrl",
    "localPublicUrl",
  ])
    if (input[key] !== undefined) httpUrl(input[key], key);
  if (
    input.features !== undefined &&
    (!Array.isArray(input.features) ||
      input.features.some((id) => typeof id !== "string"))
  )
    throw new CliError("features 必须是字符串数组", "INVALID_CONFIG");
  if (input.environments !== undefined) {
    const environments = record(input.environments, "environments");
    const available = record(sourceConfig.environments, "模板 environments");
    exactKeys(environments, Object.keys(available), "environments");
    for (const [name, value] of Object.entries(environments)) {
      const config = record(value, `environments.${name}`);
      exactKeys(config, ["webUrl", "apiPrefix"], `environments.${name}`);
      if (config.webUrl !== undefined)
        httpUrl(config.webUrl, `environments.${name}.webUrl`);
      if (config.apiPrefix !== undefined)
        textValue(config.apiPrefix, `environments.${name}.apiPrefix`);
    }
  }
  for (const parameter of manifest.parameters ?? []) {
    const value = input[parameter.name];
    if (value !== undefined && typeof value !== parameter.type)
      throw new CliError(
        `参数 ${parameter.name} 必须为 ${parameter.type}`,
        "INVALID_CONFIG",
      );
  }
}
export function validateSourceProjectConfig(
  value: unknown,
  manifest: TemplateManifest,
): Record<string, unknown> {
  const config = record(value, "project.config.json");
  for (const key of ["projectName", "moduleName", "title"])
    textValue(
      config[key] ?? manifest.defaults[key as "projectName"],
      `project.config.${key}`,
    );
  ensurePort(config.devServerPort ?? manifest.defaults.devServerPort);
  httpUrl(
    config.localBackendUrl ?? manifest.defaults.localBackendUrl,
    "本地后端地址",
  );
  httpUrl(
    config.localPublicUrl ?? manifest.defaults.localPublicUrl,
    "本地 public 地址",
  );
  for (const [name, value] of Object.entries(
    record(config.environments, "模板 environments"),
  )) {
    const environment = record(value, `environments.${name}`);
    httpUrl(environment.webUrl, `${name} 平台地址`);
    textValue(environment.apiPrefix, `${name} API 前缀`);
  }
  return config;
}
export function selectFeatures(
  manifest: TemplateManifest,
  file: PartialProjectInput,
  options: CreateOptions,
): string[] {
  const available = manifest.features ?? [];
  const known = new Map(available.map((feature) => [feature.id, feature]));
  let selected = [
    ...new Set(
      options.features !== undefined
        ? options.features
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : (file.features ??
            available
              .filter((f) => f.defaultEnabled || f.required)
              .map((f) => f.id)),
    ),
  ];
  const unknown = selected.filter((id) => !known.has(id));
  if (unknown.length)
    throw new CliError(
      `模板不支持以下能力: ${unknown.join(", ")}。可用能力: ${[...known.keys()].join(", ") || "无"}`,
      "INVALID_INPUT",
    );
  if (options.standards === false) {
    const disabled = available.filter(
      (f) =>
        f.id === "git-standards" || f.package === "@robot-admin/git-standards",
    );
    if (disabled.some((f) => f.required))
      throw new CliError(
        "模板要求 Git 规范能力，不能使用 --no-standards",
        "INVALID_INPUT",
      );
    selected = selected.filter((id) => !disabled.some((f) => f.id === id));
  }
  for (const feature of available)
    if (feature.required && !selected.includes(feature.id))
      selected.push(feature.id);
  return selected;
}
export function validateProjectInput(value: ProjectInput): ProjectInput {
  const environments: ProjectInput["environments"] = {};
  for (const [name, item] of Object.entries(
    record(value.environments, "environments"),
  )) {
    const environment = record(item, `environments.${name}`);
    const prefix = textValue(environment.apiPrefix, `${name} API 前缀`).replace(
      /^\/+|\/+$/g,
      "",
    );
    if (!prefix)
      throw new CliError(`${name} API 前缀不能为空`, "INVALID_INPUT");
    environments[name] = {
      webUrl: httpUrl(environment.webUrl, `${name} 平台地址`),
      apiPrefix: prefix,
    };
  }
  return {
    ...value,
    projectName: ensureProjectName(value.projectName),
    moduleName: ensureModuleName(value.moduleName),
    title: textValue(value.title, "应用标题"),
    devServerPort: ensurePort(value.devServerPort),
    npmRegistry: httpUrl(value.npmRegistry, "npm registry"),
    jhlcRegistry: httpUrl(value.jhlcRegistry, "@jhlc registry"),
    localBackendUrl: httpUrl(value.localBackendUrl, "本地后端地址"),
    localPublicUrl: httpUrl(value.localPublicUrl, "本地 public 地址"),
    environments,
  };
}
export function validateTemplateParameters(
  input: ProjectInput,
  manifest: TemplateManifest,
): void {
  for (const parameter of manifest.parameters ?? []) {
    const value = (input as unknown as Record<string, unknown>)[parameter.name];
    if (value === undefined) {
      if (parameter.required)
        throw new CliError(`缺少模板参数: ${parameter.name}`, "INVALID_INPUT");
      continue;
    }
    if (typeof value !== parameter.type)
      throw new CliError(
        `参数 ${parameter.name} 必须为 ${parameter.type}`,
        "INVALID_INPUT",
      );
    if (typeof value === "string") {
      textValue(value, parameter.name);
      if (parameter.pattern && !new RegExp(parameter.pattern).test(value))
        throw new CliError(
          `参数 ${parameter.name} 不满足 pattern ${parameter.pattern}`,
          "INVALID_INPUT",
        );
      if (parameter.format === "uri") httpUrl(value, parameter.name);
    }
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) ||
        (parameter.minimum !== undefined && value < parameter.minimum) ||
        (parameter.maximum !== undefined && value > parameter.maximum))
    )
      throw new CliError(
        `参数 ${parameter.name} 超出允许范围`,
        "INVALID_INPUT",
      );
    if (
      parameter.enum &&
      !parameter.enum.includes(value as string | number | boolean)
    )
      throw new CliError(
        `参数 ${parameter.name} 必须为 ${parameter.enum.join(", ")}`,
        "INVALID_INPUT",
      );
  }
}
export function resolveProjectInput(
  manifest: TemplateManifest,
  source: Record<string, unknown>,
  file: PartialProjectInput,
  requestedName: string | undefined,
  options: CreateOptions,
  user: UserConfig,
): ProjectInput {
  validateCreateConfig(file, manifest, source);
  const projectName = ensureProjectName(
    requestedName ?? file.projectName ?? manifest.defaults.projectName,
  );
  const inferred = inferModuleName(projectName, manifest.defaults.moduleName);
  const environments = structuredClone(
    record(source.environments, "模板 environments"),
  ) as ProjectInput["environments"];
  for (const [name, config] of Object.entries(file.environments ?? {}))
    environments[name] = { ...environments[name], ...config };
  const parameterDefaults = Object.fromEntries(
    (manifest.parameters ?? [])
      .filter((parameter) => parameter.default !== undefined)
      .map((parameter) => [parameter.name, parameter.default]),
  );
  const input = {
    ...parameterDefaults,
    ...source,
    ...file,
    projectName,
    moduleName:
      options.module ??
      file.moduleName ??
      (/^[a-z][a-z0-9-]*$/.test(inferred)
        ? inferred
        : manifest.defaults.moduleName),
    title:
      options.title ?? file.title ?? source.title ?? manifest.defaults.title,
    devServerPort: ensurePort(
      options.port ??
        file.devServerPort ??
        source.devServerPort ??
        manifest.defaults.devServerPort,
    ),
    npmRegistry:
      options.npmRegistry ??
      file.npmRegistry ??
      user.npmRegistry ??
      manifest.defaults.npmRegistry,
    jhlcRegistry:
      options.jhlcRegistry ??
      file.jhlcRegistry ??
      user.jhlcRegistry ??
      manifest.defaults.jhlcRegistry,
    localBackendUrl:
      options.localBackend ??
      file.localBackendUrl ??
      source.localBackendUrl ??
      manifest.defaults.localBackendUrl,
    localPublicUrl:
      options.localPublic ??
      file.localPublicUrl ??
      source.localPublicUrl ??
      manifest.defaults.localPublicUrl,
    environments,
    features: selectFeatures(manifest, file, options),
  } as ProjectInput;
  const validated = validateProjectInput(input);
  validateTemplateParameters(validated, manifest);
  return validated;
}
