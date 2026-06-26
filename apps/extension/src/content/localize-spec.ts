import type { Spec } from "@specpin/spec-schema";
import { resolveLocalized, resolveLocalizedList } from "@specpin/spec-schema";

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
