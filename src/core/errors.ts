export class CliError extends Error {
  details?: Record<string, unknown>;
  constructor(
    message: string,
    public readonly code = "OPERATION_FAILED",
    public readonly exitCode = 1,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CliError";
  }
}

export class UserCancelledError extends CliError {
  constructor(signal: "SIGINT" | "SIGTERM" = "SIGINT") {
    super("操作已取消", "CANCELLED", signal === "SIGTERM" ? 143 : 130);
    this.name = "UserCancelledError";
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw signal.reason instanceof Error
      ? signal.reason
      : new UserCancelledError();
}
