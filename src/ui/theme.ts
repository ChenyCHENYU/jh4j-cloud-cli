import { stdout } from "node:process";
import { styleText } from "node:util";
import * as prompts from "@clack/prompts";

const BRAND_START = [34, 211, 238] as const;
const BRAND_END = [99, 102, 241] as const;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function supportsTrueColor(): boolean {
  if (process.env.FORCE_COLOR === "0") return false;
  if (Number(process.env.FORCE_COLOR) >= 3) return true;
  if (
    process.env.NO_COLOR !== undefined ||
    process.env.NODE_DISABLE_COLORS !== undefined
  ) {
    return false;
  }
  return Boolean(stdout.isTTY && stdout.getColorDepth?.() >= 24);
}

function interpolate(start: number, end: number, ratio: number): number {
  return Math.round(start + (end - start) * ratio);
}

function gradient(text: string): string {
  if (!supportsTrueColor()) return styleText(["bold", "cyan"], text);
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

function paint(
  format: Parameters<typeof styleText>[0],
  text: string
): string {
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
  command: (text: string) => paint(["bold", "cyan"], text)
};

export function createBrandSpinner(): ReturnType<typeof prompts.spinner> {
  return prompts.spinner({
    frames: SPINNER_FRAMES,
    delay: 80,
    styleFrame: (frame) => ui.accent(frame)
  });
}
