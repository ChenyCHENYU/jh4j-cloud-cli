import * as prompts from "@clack/prompts";
import { runCli } from "./cli.js";

runCli().catch((error) => {
  prompts.cancel(`操作失败：${(error as Error).message}`);
  process.exitCode = 1;
});
