import packageJson from "../package.json" with { type: "json" };

export const CLI_NAME = "@agile-team/jh4j-cloud-cli";
export const CLI_VERSION = packageJson.version;
export const COMMAND_NAME = "jh4j";
export const CLI_NODE_RANGE = packageJson.engines.node;
export const TEMPLATE_SOURCE_ENV = "JH4J_UI_TEMPLATE_SOURCE";
export const JH4J_HOME_ENV = "JH4J_HOME";
export const CATALOG_FILE_ENV = "JH4J_CATALOG_FILE";
export const USER_CONFIG_SCHEMA_VERSION = 1;
