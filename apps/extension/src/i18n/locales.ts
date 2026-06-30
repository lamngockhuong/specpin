import { browser } from "#imports";

// Supported UI-chrome languages. English is the source of truth; Vietnamese and
// Japanese are full translations. This axis is independent from the spec-content
// locale (see shared/config.ts getLocale / localize-spec.ts pickLocale).
export const SUPPORTED = ["en", "vi", "ja"] as const;
export type UiLocale = (typeof SUPPORTED)[number];

function isSupported(value: string): value is UiLocale {
  return (SUPPORTED as readonly string[]).includes(value);
}

/** The browser's UI language, e.g. "vi", "vi-VN", "en-US". Falls back to
 *  navigator.language, then "en", and never throws (fakeBrowser in tests may not
 *  implement i18n.getUILanguage). */
function detectBrowserLocale(): string {
  try {
    const ui = browser.i18n?.getUILanguage?.();
    if (ui) return ui;
  } catch {
    // ignore and fall through to navigator
  }
  return (typeof navigator !== "undefined" && navigator.language) || "en";
}

/** Resolve a stored UI-locale choice to a concrete supported locale:
 *  stored choice -> browser UI language (primary subtag) -> "en". */
export function resolveUiLocale(stored: UiLocale | null): UiLocale {
  if (stored && isSupported(stored)) return stored;
  const primary = detectBrowserLocale().toLowerCase().split("-")[0] ?? "en";
  return isSupported(primary) ? primary : "en";
}
