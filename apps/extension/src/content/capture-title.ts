// Derive a human title for an element being captured, used to seed each row of
// the bulk-capture form (and reusable by clone/future flows). Pure + DOM-read
// only: it reads text/attributes, writes nothing, so it is unit-testable.
//
// Precedence mirrors what a reader would name the control: its visible text, then
// the accessible name (aria-label), then the tooltip (title), then the input
// placeholder, and finally a humanized tag/role so the result is never empty.

import type { ElementFingerprint } from "@specpin/spec-schema";

/** Longest title we seed; a row title stays a label, not a paragraph. */
export const TITLE_MAX = 80;

function normalize(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

function cap(value: string): string {
  return value.length > TITLE_MAX ? value.slice(0, TITLE_MAX).trimEnd() : value;
}

/** Title-case a single token (tag name or role) for the fallback label. */
function humanize(token: string): string {
  const clean = token.replace(/[-_]+/g, " ").trim();
  if (!clean) return "Element";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** The best available human title for `el`. Never empty (falls back to a
 *  humanized role/tag), always trimmed + length-capped. */
export function deriveTitle(el: Element): string {
  const text = normalize(el.textContent);
  if (text) return cap(text);

  const aria = normalize(el.getAttribute("aria-label"));
  if (aria) return cap(aria);

  const title = normalize(el.getAttribute("title"));
  if (title) return cap(title);

  const placeholder = normalize(el.getAttribute("placeholder"));
  if (placeholder) return cap(placeholder);

  const role = normalize(el.getAttribute("role"));
  return cap(humanize(role || el.tagName.toLowerCase()));
}

/** Suggest a capture Title from an element's already-captured fingerprint signals.
 *  Precedence: aria-label -> visible text -> placeholder -> name attr -> first
 *  nearby label. Unlike `deriveTitle`, this returns "" when the element exposes
 *  nothing (the single capture form seeds empty-only and must not invent a label).
 *  Whitespace-collapsed and length-capped via the same `normalize`/`cap` helpers. */
export function suggestTitle(fp: ElementFingerprint): string {
  return cap(
    normalize(
      fp.ariaLabel ||
        fp.textContent ||
        fp.attributes?.placeholder ||
        fp.attributes?.name ||
        fp.nearbyLabels?.[0] ||
        "",
    ),
  );
}
