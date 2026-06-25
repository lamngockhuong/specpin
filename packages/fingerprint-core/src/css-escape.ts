// CSS identifier/attribute-value escaping with a fallback for environments
// (some test DOMs) that do not expose the native CSS.escape.

type CssGlobal = { escape?: (value: string) => string };

/** Escape a string for use as a CSS identifier (e.g. an id in `#id`). */
export function cssEscapeIdent(value: string): string {
  const native = (globalThis as { CSS?: CssGlobal }).CSS?.escape;
  if (native) return native(value);
  // Minimal fallback: escape anything that is not a safe identifier char.
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

/** Escape a string for use inside a double-quoted CSS attribute selector. */
export function cssEscapeAttrValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
