import type { DisplayMode, Spec } from "@specpin/spec-schema";

// Extra signal passed from the matcher so renderers can distinguish a confident
// hit from a lower-confidence one that needs review.
export interface RenderMeta {
  confidence: number;
  needsReview: boolean;
}

// SpecRenderer is the pluggable display contract. The DisplayMode union already
// covers all five modes even though Phase 1 implements only tooltip + sidebar.
export interface SpecRenderer {
  readonly mode: DisplayMode;
  render(spec: Spec, target: Element, meta?: RenderMeta): void;
  /** Remove all rendered UI and listeners. */
  destroy(): void;
}
