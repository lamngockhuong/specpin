import type { LocalizedString } from "./types.gen.js";

// Keys that must never be read back from a locale map. JSON.parse can place a
// literal "__proto__" (etc.) as an own property without polluting the prototype,
// but resolving it would leak an unexpected value into rendered text. The schema
// already rejects these via propertyNames, but the resolver stays safe on
// unvalidated input too.
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function ownValue(value: LocalizedString, key: string): string | undefined {
  if (FORBIDDEN_KEYS.has(key)) return undefined;
  if (!Object.hasOwn(value, key)) return undefined;
  const v = value[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * Resolve locale-keyed text: the requested `locale`, else `defaultLocale`, else
 * the first own (safe) value, else "". Reads only own, non-prototype keys, so a
 * crafted "__proto__" entry never leaks. Returns "" for missing/non-object input
 * so callers can render without null checks.
 */
export function resolveLocalized(
  value: LocalizedString | undefined,
  locale: string,
  defaultLocale?: string,
): string {
  if (!value || typeof value !== "object") return "";

  const exact = ownValue(value, locale);
  if (exact !== undefined) return exact;

  if (defaultLocale) {
    const fallback = ownValue(value, defaultLocale);
    if (fallback !== undefined) return fallback;
  }

  for (const key of Object.keys(value)) {
    const v = ownValue(value, key);
    if (v !== undefined) return v;
  }
  return "";
}

/**
 * Resolve a list of locale-keyed items (e.g. businessRules). Entries that
 * resolve to "" are dropped, so a partly translated list never renders blank
 * rows for the locales it lacks.
 */
export function resolveLocalizedList(
  items: LocalizedString[] | undefined,
  locale: string,
  defaultLocale?: string,
): string[] {
  if (!items) return [];
  const out: string[] = [];
  for (const item of items) {
    const text = resolveLocalized(item, locale, defaultLocale);
    if (text !== "") out.push(text);
  }
  return out;
}
