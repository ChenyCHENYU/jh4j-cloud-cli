import {
  DEFAULT_USER_CONFIG,
  getUserConfigPath,
  loadUserConfig,
  parseUserConfigValue,
  saveUserConfig
} from "../core/user-config.js";

export async function configListCommand(options: { json?: boolean } = {}): Promise<void> {
  const config = await loadUserConfig();
  if (options.json) console.log(JSON.stringify(config, null, 2));
  else console.table(Object.entries(config).map(([key, value]) => ({ key, value })));
  console.log(`配置文件: ${getUserConfigPath()}`);
}

export async function configGetCommand(key: string): Promise<void> {
  const config = await loadUserConfig();
  if (!(key in config)) throw new Error(`配置项不存在: ${key}`);
  console.log(String((config as unknown as Record<string, unknown>)[key]));
}

export async function configSetCommand(key: string, value: string): Promise<void> {
  const config = await loadUserConfig();
  const [typedKey, typedValue] = parseUserConfigValue(key, value);
  (config as unknown as Record<string, unknown>)[typedKey] = typedValue;
  await saveUserConfig(config);
  console.log(`已设置 ${typedKey}=${String(typedValue)}`);
}

export async function configUnsetCommand(key: string): Promise<void> {
  const config = await loadUserConfig();
  if (!(key in DEFAULT_USER_CONFIG) && !(key in config)) {
    throw new Error(`配置项不存在: ${key}`);
  }
  const defaults = DEFAULT_USER_CONFIG as unknown as Record<string, unknown>;
  const mutable = config as unknown as Record<string, unknown>;
  if (key in defaults) mutable[key] = defaults[key];
  else delete mutable[key];
  await saveUserConfig(config);
  console.log(`已重置配置项: ${key}`);
}

export async function configResetCommand(): Promise<void> {
  await saveUserConfig({ ...DEFAULT_USER_CONFIG });
  console.log(`用户配置已恢复默认值: ${getUserConfigPath()}`);
}
