import { browser } from "#imports";
import { UI_LOCALE_KEY } from "../shared/config.js";
import { setTrustedHtml } from "../shared/html.js";
import { resolveUiLocale, type UiLocale } from "./locales.js";
import en, { type Messages } from "./messages/en.js";
import ja from "./messages/ja.js";
import vi from "./messages/vi.js";

export type { UiLocale } from "./locales.js";
export { resolveUiLocale } from "./locales.js";
export type MessageKey = keyof Messages;

// One catalog per supported locale. English is the canonical key set; every other
// catalog is typed against it, so this map stays exhaustive over UiLocale.
const CATALOGS: Record<UiLocale, Record<string, string>> = { en, vi, ja };

// The active catalog, set once per surface load by initI18n. English is the
// startup default so a render before init still produces real text.
let current: UiLocale = "en";
let table: Record<string, string> = en;

/** Select the active UI-chrome catalog. Call early in each surface's init (page
 *  main.ts or content-script startup) BEFORE rendering any string. */
export function initI18n(locale: UiLocale): void {
  current = locale;
  table = CATALOGS[locale] ?? en;
}

/** The currently active UI locale. */
export function currentUiLocale(): UiLocale {
  return current;
}

/** Resolve a message key against the active catalog, falling back to English,
 *  then to the raw key (so a missing key is visible, not blank). `{name}`
 *  placeholders are substituted from `params`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let s = table[key] ?? en[key] ?? (key as string);
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

/** Minimal pluralization for the few English strings that inflect: picks the
 *  one/other key by count and passes `{count}`. Vietnamese has no plural
 *  inflection, so both VI keys are typically identical (count-neutral wording is
 *  preferred over this helper; use only where an English plural reads better). */
export function plural(
  count: number,
  oneKey: MessageKey,
  otherKey: MessageKey,
  params?: Record<string, string | number>,
): string {
  return t(count === 1 ? oneKey : otherKey, { count, ...params });
}

/** Hydrate static HTML: fill every `[data-i18n]` node's text and the
 *  `[data-i18n-placeholder]` / `[data-i18n-aria]` attributes from the active
 *  catalog. Called after the DOM is present and after initI18n. Re-runnable, so a
 *  language switch can re-hydrate in place. */
export function hydrateI18n(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key as MessageKey);
  }
  // Rich text with inline markup (e.g. a paragraph containing <code>/<strong>).
  // Catalog values are authored in-repo and trusted (no user data), so parsing
  // them here is safe; never use this for runtime/spec-derived strings.
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-html]")) {
    const key = el.dataset.i18nHtml;
    if (key) setTrustedHtml(el, t(key as MessageKey));
  }
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-placeholder]")) {
    const key = el.dataset.i18nPlaceholder;
    if (key) el.setAttribute("placeholder", t(key as MessageKey));
  }
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-aria]")) {
    const key = el.dataset.i18nAria;
    if (key) el.setAttribute("aria-label", t(key as MessageKey));
  }
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-title]")) {
    const key = el.dataset.i18nTitle;
    if (key) el.setAttribute("title", t(key as MessageKey));
  }
}

/** Re-init i18n and run `onChange` whenever the stored UI locale changes. Extension
 *  pages (popup/options/side panel) receive `storage.onChanged`, so a language
 *  change in Options reflects live in an open side panel. Content-script renderers
 *  use the SET_UI_LOCALE message instead (storage relay is not threaded there). */
export function watchUiLocaleChanges(onChange: () => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[UI_LOCALE_KEY]) return;
    initI18n(resolveUiLocale((changes[UI_LOCALE_KEY].newValue as UiLocale | undefined) ?? null));
    onChange();
  });
}
