import {
  DEFAULT_USER_CONFIG,
  getUserConfigPath,
  loadUserConfig,
  parseUserConfigValue,
  updateUserConfig,
} from "../core/user-config.js";

export async function configListCommand(
  options: { json?: boolean } = {},
): Promise<void> {
  const config = await loadUserConfig();
  if (options.json) {
    console.log(JSON.stringify(config, null, 2));
    return;
  } else
    console.table(
      Object.entries(config).map(([key, value]) => ({ key, value })),
    );
  console.log(`配置文件: ${getUserConfigPath()}`);
}

export async function configGetCommand(key: string): Promise<void> {
  const config = await loadUserConfig();
  if (!Object.hasOwn(config, key)) throw new Error(`配置项不存在: ${key}`);
  console.log(String((config as unknown as Record<string, unknown>)[key]));
}

export async function configSetCommand(
  key: string,
  value: string,
  signal?: AbortSignal,
): Promise<void> {
  const [typedKey, typedValue] = parseUserConfigValue(key, value);
  await updateUserConfig((config) => ({ ...config, [typedKey]: typedValue }), {
    signal,
  });
  console.log(`已设置 ${typedKey}=${String(typedValue)}`);
}

export async function configUnsetCommand(
  key: string,
  signal?: AbortSignal,
): Promise<void> {
  await updateUserConfig(
    (config) => {
      if (
        !Object.hasOwn(DEFAULT_USER_CONFIG, key) &&
        !Object.hasOwn(config, key)
      ) {
        throw new Error(`配置项不存在: ${key}`);
      }
      const defaults = DEFAULT_USER_CONFIG as unknown as Record<
        string,
        unknown
      >;
      const mutable = config as unknown as Record<string, unknown>;
      if (key in defaults) mutable[key] = defaults[key];
      else delete mutable[key];
      return config;
    },
    { signal },
  );
  console.log(`已重置配置项: ${key}`);
}

export async function configResetCommand(signal?: AbortSignal): Promise<void> {
  await updateUserConfig(() => ({ ...DEFAULT_USER_CONFIG }), {
    reset: true,
    signal,
  });
  console.log(`用户配置已恢复默认值: ${getUserConfigPath()}`);
}
