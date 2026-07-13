import { runCli } from "./cli.js";

runCli().catch((error) => {
  console.error(`\n错误: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
