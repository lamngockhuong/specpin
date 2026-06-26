import type { DisplayMode, Spec } from "@specpin/spec-schema";

// Extra signal passed from the matcher so renderers can distinguish a confident
// hit from a lower-confidence one that needs review, plus the viewer locale used
// to resolve the spec's localized text (Phase 1 passes the base/default locale;
// Phase 2 passes the viewer's chosen locale).
export interface RenderMeta {
  confidence: number;
  needsReview: boolean;
  locale?: string;
  defaultLocale?: string;
  /** Locales offered by the in-renderer language selector (sidebar only). When
   *  fewer than two are available the selector is omitted. */
  availableLocales?: string[];
}

// SpecRenderer is the pluggable display contract. The DisplayMode union already
// covers all five modes even though Phase 1 implements only tooltip + sidebar.
export interface SpecRenderer {
  readonly mode: DisplayMode;
  render(spec: Spec, target: Element, meta?: RenderMeta): void;
  /** Remove all rendered UI and listeners. */
  destroy(): void;
}
