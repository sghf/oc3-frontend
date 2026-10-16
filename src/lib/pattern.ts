/**
 * Whether a value matches the whole of a pattern of oc3's regex constraints, as
 * the server checks it (`^(?:pattern)$`); undefined when the browser cannot
 * compile the pattern. The server compiles it with Go's RE2, whose syntax the
 * common patterns share with JavaScript; for the rest, the server decides alone.
 */
export function matchesPattern(pattern: string, value: string): boolean | undefined {
  let re: RegExp;
  try {
    re = new RegExp(`^(?:${pattern})$`, "u");
  } catch {
    return undefined;
  }
  return re.test(value);
}
