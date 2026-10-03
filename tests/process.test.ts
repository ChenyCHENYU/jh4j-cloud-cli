import { describe, expect, it } from "vitest";
import { runCommand } from "../src/utils/process.js";
import { UserCancelledError } from "../src/core/errors.js";
describe("process lifecycle", () => {
  it("waits for inherited output streams to close", async () => {
    const grandchild = "setTimeout(()=>console.log('late'),80)";
    const parent = `const {spawn}=require('node:child_process');console.log('early');const c=spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'inherit'});c.unref();`;
    expect(
      await runCommand(process.execPath, ["-e", parent], { stdio: "pipe" }),
    ).toBe("early\nlate");
  });
  it("bounds the captured output tail", async () => {
    expect(
      await runCommand(
        process.execPath,
        ["-e", "process.stdout.write('x'.repeat(10000)+'tail')"],
        { maxOutputBytes: 64 },
      ),
    ).toHaveLength(64);
  });
  it("stops a hanging process on timeout", async () => {
    await expect(
      runCommand(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
        timeoutMs: 80,
      }),
    ).rejects.toMatchObject({ code: "COMMAND_TIMEOUT" });
  });
  it("propagates cancellation", async () => {
    const controller = new AbortController();
    const work = runCommand(
      process.execPath,
      ["-e", "setInterval(()=>{},1000)"],
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(new UserCancelledError()), 40);
    await expect(work).rejects.toMatchObject({
      code: "CANCELLED",
      exitCode: 130,
    });
  });
  it("rejects before spawning an already cancelled command", async () => {
    const controller = new AbortController();
    controller.abort(new UserCancelledError());
    await expect(
      runCommand("missing-command", [], { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });
});
