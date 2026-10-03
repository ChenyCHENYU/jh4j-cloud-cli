import { stdout } from "node:process";
import { styleText } from "node:util";
import type * as prompts from "@clack/prompts";

const BRAND_START = [34, 211, 238] as const;
const BRAND_END = [99, 102, 241] as const;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function supportsTrueColor(): boolean {
  if (process.env.FORCE_COLOR === "0") return false;
  if (
    process.env.NO_COLOR !== undefined ||
    process.env.NODE_DISABLE_COLORS !== undefined
  ) {
    return false;
  }
  if (process.env.TERM === "dumb" || !stdout.isTTY) return false;
  if (Number(process.env.FORCE_COLOR) >= 3) return true;
  return Boolean(stdout.getColorDepth?.() >= 24);
}

function interpolate(start: number, end: number, ratio: number): number {
  return Math.round(start + (end - start) * ratio);
}

function gradient(text: string): string {
  if (!supportsTrueColor()) return paint(["bold", "cyan"], text);
  const characters = [...text];
  const denominator = Math.max(characters.length - 1, 1);
  return characters
    .map((character, index) => {
      if (/\s/.test(character)) return character;
      const ratio = index / denominator;
      const red = interpolate(BRAND_START[0], BRAND_END[0], ratio);
      const green = interpolate(BRAND_START[1], BRAND_END[1], ratio);
      const blue = interpolate(BRAND_START[2], BRAND_END[2], ratio);
      return `\u001B[1;38;2;${red};${green};${blue}m${character}\u001B[0m`;
    })
    .join("");
}

function paint(format: Parameters<typeof styleText>[0], text: string): string {
  if (
    !stdout.isTTY ||
    process.env.NO_COLOR !== undefined ||
    process.env.NODE_DISABLE_COLORS !== undefined ||
    process.env.TERM === "dumb"
  )
    return text;
  return styleText(format, text, { stream: stdout });
}

export const ui = {
  brand: () => gradient("JH4J CLOUD"),
  badge: (text: string) => paint(["bold", "black", "bgCyan"], ` ${text} `),
  accent: (text: string) => paint("cyan", text),
  secondary: (text: string) => paint("blueBright", text),
  success: (text: string) => paint("green", text),
  warning: (text: string) => paint("yellow", text),
  danger: (text: string) => paint("red", text),
  muted: (text: string) => paint("dim", text),
  strong: (text: string) => paint("bold", text),
  command: (text: string) => paint(["bold", "cyan"], text),
};

export function createBrandSpinner(
  signal?: AbortSignal,
): ReturnType<typeof prompts.spinner> {
  // Clack's spinner enters raw mode and its keyboard blocker calls exit(0).
  // Keep stdin in normal mode so Ctrl+C reaches the CLI's AbortController.
  let timer: NodeJS.Timeout | undefined;
  let text = "";
  let frame = 0;
  let cancelled = false;
  const render = () => {
    const available = Math.max(0, (stdout.columns ?? 80) - 5);
    let width = 0,
      visible = "";
    for (const character of text) {
      const columns = character.codePointAt(0)! > 255 ? 2 : 1;
      if (width + columns > available) break;
      visible += character;
      width += columns;
    }
    stdout.write(
      `\r\u001b[2K${ui.accent(SPINNER_FRAMES[frame++ % SPINNER_FRAMES.length])}  ${visible}`,
    );
  };
  const finish = (
    message: string,
    kind: "stop" | "cancel" | "error",
    silent = false,
  ) => {
    if (!timer) return;
    clearInterval(timer);
    timer = undefined;
    signal?.removeEventListener("abort", abort);
    stdout.write("\r\u001b[2K\u001b[?25h");
    if (!silent)
      stdout.write(
        `${kind === "stop" ? ui.success("◇") : ui.warning("■")}  ${message}\n`,
      );
  };
  const abort = () => {
    cancelled = true;
    finish("操作已取消", "cancel");
  };
  return {
    start(message = "") {
      if (cancelled || signal?.aborted) {
        cancelled = true;
        return;
      }
      text = message;
      if (timer) return;
      stdout.write("\u001b[?25l");
      timer = setInterval(render, 80);
      render();
      signal?.addEventListener("abort", abort, { once: true });
    },
    stop: (message = "") => finish(message, "stop"),
    cancel(message = "操作已取消") {
      cancelled = true;
      finish(message, "cancel");
    },
    error: (message = "操作未完成") => finish(message, "error"),
    message: (message = "") => {
      text = message;
      if (timer) render();
    },
    clear: () => finish("", "stop", true),
    get isCancelled() {
      return cancelled;
    },
  };
}
