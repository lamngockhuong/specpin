import type { Spec } from "@specpin/spec-schema";
import { resolveLocalized, resolveLocalizedList } from "@specpin/spec-schema";

/** DOM event a renderer's in-panel locale selector dispatches on `document`;
 *  the content script listens for it and applies the locale change (persist +
 *  re-render). `detail` is the chosen locale string. Keeps renderers DOM-only,
 *  free of storage/messaging. */
export const LOCALE_CHANGE_EVENT = "specpin:set-locale";

/** Plain, locale-resolved spec text ready for escaping + rendering. Renderers
 *  read this instead of the raw locale-keyed objects on `Spec`, so no renderer
 *  ever touches a `LocalizedString` directly. */
export interface LocalizedSpecText {
  title: string;
  description: string;
  businessRules: string[];
}

/**
 * Resolve a spec's localizable content for a viewer locale, with fallback to
 * `defaultLocale` then the first present value. `locale` defaults to "en" so
 * callers without locale context (e.g. unit tests) still render.
 */
export function localizeSpec(spec: Spec, locale = "en", defaultLocale?: string): LocalizedSpecText {
  return {
    title: resolveLocalized(spec.title, locale, defaultLocale),
    description: resolveLocalized(spec.description, locale, defaultLocale),
    businessRules: resolveLocalizedList(spec.businessRules, locale, defaultLocale),
  };
}

/** Resolve the active viewer locale: the stored choice if available, else the
 *  project's `defaultLocale`, else "en". Pure so it can be unit-tested without
 *  the storage layer. */
export function pickLocale(
  stored: string | null | undefined,
  defaultLocale?: string | null,
): string {
  if (stored) return stored;
  if (defaultLocale) return defaultLocale;
  return "en";
}
