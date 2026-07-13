import packageJson from "../package.json" with { type: "json" };

export const CLI_NAME = "@jhlc/jh4j-cloud-cli";
export const CLI_VERSION = packageJson.version;
export const COMMAND_NAME = "jh4j";
export const SUPPORTED_NODE_MAJORS = new Set([22, 24]);
export const TEMPLATE_SOURCE_ENV = "JH4J_UI_TEMPLATE_SOURCE";
