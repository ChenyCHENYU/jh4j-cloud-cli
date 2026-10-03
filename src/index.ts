import { runCli } from "./cli.js";
import { reportError } from "./ui/reporter.js";

runCli().catch((error) =>
  reportError(error, { json: process.argv.includes("--json") }),
);
