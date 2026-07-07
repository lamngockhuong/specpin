// Pick a readable glyph color for a given badge background. Pure + dependency-free
// so it is trivially unit-testable and safe to import into the DOM-pure renderers.
//
// Uses the WCAG relative-luminance formula on sRGB-linearized channels, then
// thresholds: a light background gets the extension's dark ink (today's
// `--sp-accent-on`), a dark background gets white. A fixed ink/white pair (rather
// than a computed shade) keeps the badge glyph crisp and matches the brand.

/** True when `value` is a `#rrggbb` hex string. The only shape the color input
 *  emits and the only shape safe to feed into a CSS custom property, so both the
 *  storage read (config.ts) and the renderer apply-path guard on it (a tampered
 *  value then falls back to the default token instead of injecting into shadow CSS).
 *  Lives here (pure, no storage dep) so the DOM-pure renderer can import it. */
export function isValidBadgeColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

/** The dark ink used on light badge backgrounds. Matches `--sp-accent-on`. */
const DARK_INK = "#04221E";
/** The light glyph used on dark badge backgrounds. */
const LIGHT_INK = "#FFFFFF";

/** Linearize one 0-255 sRGB channel to its 0-1 linear-light value (WCAG). */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0 = black, 1 = white) of a `#rrggbb` hex, or 0 when
 *  the input is not a 6-digit hex (caller should validate first; this is a guard). */
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return 0;
  const int = Number.parseInt(m[1] as string, 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** Dark ink for a light background, white for a dark one. Threshold at 0.5 (the
 *  common "is this color light?" heuristic). */
export function readableGlyph(bgHex: string): string {
  return relativeLuminance(bgHex) > 0.5 ? DARK_INK : LIGHT_INK;
}
