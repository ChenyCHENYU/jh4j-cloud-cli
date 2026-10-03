import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { CliError, throwIfAborted } from "../core/errors.js";

async function isStale(lockPath: string): Promise<boolean> {
  try {
    const owner = JSON.parse(
      await readFile(path.join(lockPath, "owner.json"), "utf8"),
    ) as { pid: number };
    if (Number.isInteger(owner.pid) && owner.pid > 0) {
      try {
        process.kill(owner.pid, 0);
        return false;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ESRCH";
      }
    }
  } catch {
    /* A new owner may not have written its identity yet. */
  }
  try {
    return Date.now() - (await stat(lockPath)).mtimeMs > 30_000;
  } catch {
    return false;
  }
}

export async function withFileLock<T>(
  lockPath: string,
  action: () => Promise<T>,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 30_000;
  const token = randomUUID();
  const ownerFile = path.join(lockPath, "owner.json");
  await mkdir(path.dirname(lockPath), { recursive: true });
  while (true) {
    throwIfAborted(options.signal);
    try {
      await mkdir(lockPath);
      try {
        await writeFile(
          ownerFile,
          JSON.stringify({ pid: process.pid, token }),
          { flag: "wx", mode: 0o600 },
        );
      } catch (error) {
        await rm(lockPath, { recursive: true, force: true });
        throw error;
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const remaining = timeoutMs - (Date.now() - started);
      if (remaining <= 0)
        throw new CliError(
          `等待目录锁超时，请确认其他任务是否仍在运行: ${lockPath}`,
          "LOCK_TIMEOUT",
        );
      if (await isStale(lockPath)) {
        // Recovery also has an owner, so a crash during recovery is recoverable.
        // Recheck after acquisition to protect a newer live owner.
        await withFileLock(
          `${lockPath}.reaper`,
          async () => {
            if (!(await isStale(lockPath))) return;
            const tombstone = `${lockPath}.stale-${randomUUID()}`;
            try {
              await rename(lockPath, tombstone);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
              throw error;
            }
            await rm(tombstone, { recursive: true, force: true });
          },
          { signal: options.signal, timeoutMs: remaining },
        );
      }
      try {
        await delay(40, undefined, { signal: options.signal });
      } catch {
        throwIfAborted(options.signal);
      }
    }
  }
  try {
    throwIfAborted(options.signal);
    return await action();
  } finally {
    try {
      const owner = JSON.parse(await readFile(ownerFile, "utf8")) as {
        token: string;
      };
      if (owner.token === token)
        await rm(lockPath, { recursive: true, force: true });
    } catch {
      /* Never remove another owner's lock. */
    }
  }
}
