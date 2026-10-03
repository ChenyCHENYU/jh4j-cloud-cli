export function redactSource(source: string): string {
  try {
    const url = new URL(source);
    if (["http:", "https:", "ssh:", "git:"].includes(url.protocol)) {
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.href.replace(/\/$/, "");
    }
  } catch {
    /* Local paths and SCP-style Git sources are retained. */
  }
  return source;
}

export function redactText(text: string): string {
  return text.replace(/(?:https?|ssh|git):\/\/[^\s"'<>]+/g, redactSource);
}
