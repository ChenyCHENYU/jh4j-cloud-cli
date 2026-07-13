import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { JH4J_HOME_ENV, USER_CONFIG_SCHEMA_VERSION } from "../constants.js";
import { readJson, writeJson } from "../utils/fs.js";
import type { UserConfig } from "../types.js";

export const DEFAULT_USER_CONFIG: UserConfig = {
  schemaVersion: USER_CONFIG_SCHEMA_VERSION,
  autoInstall: false,
  autoGit: true,
  cacheTtlMinutes: 60
};

export function getJh4jHome(): string {
  return path.resolve(process.env[JH4J_HOME_ENV] || path.join(os.homedir(), ".jh4j"));
}

export function getUserConfigPath(): string {
  return path.join(getJh4jHome(), "config.json");
}

export async function loadUserConfig(): Promise<UserConfig> {
  const configPath = getUserConfigPath();
  if (!existsSync(configPath)) return { ...DEFAULT_USER_CONFIG };

  const stored = await readJson<Partial<UserConfig>>(configPath);
  if (
    stored.schemaVersion !== undefined &&
    stored.schemaVersion !== USER_CONFIG_SCHEMA_VERSION
  ) {
    throw new Error(
      `不支持的用户配置版本: ${stored.schemaVersion}，当前要求 ${USER_CONFIG_SCHEMA_VERSION}`
    );
  }
  return { ...DEFAULT_USER_CONFIG, ...stored };
}

export async function saveUserConfig(config: UserConfig): Promise<void> {
  await writeJson(getUserConfigPath(), {
    ...config,
    schemaVersion: USER_CONFIG_SCHEMA_VERSION
  });
}

const CONFIG_KEYS = new Set<keyof UserConfig>([
  "catalogFile",
  "templateSource",
  "templateRef",
  "npmRegistry",
  "jhlcRegistry",
  "autoInstall",
  "autoGit",
  "cacheTtlMinutes"
]);

export function parseUserConfigValue(
  key: string,
  rawValue: string
): [keyof UserConfig, UserConfig[keyof UserConfig]] {
  if (!CONFIG_KEYS.has(key as keyof UserConfig)) {
    throw new Error(`不支持的配置项: ${key}`);
  }
  const typedKey = key as keyof UserConfig;
  if (typedKey === "autoInstall" || typedKey === "autoGit") {
    const normalized = rawValue.toLowerCase();
    if (!new Set(["true", "false"]).has(normalized)) {
      throw new Error(`${key} 只能是 true 或 false`);
    }
    return [typedKey, normalized === "true"];
  }
  if (typedKey === "cacheTtlMinutes") {
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 0 || value > 10080) {
      throw new Error("cacheTtlMinutes 必须是 0 到 10080 之间的整数");
    }
    return [typedKey, value];
  }
  return [typedKey, rawValue.trim()];
}
