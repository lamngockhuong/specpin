import type { DisplayMode, Spec } from "@specpin/spec-schema";
import { escapeHtml } from "../shared/html.js";

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
  /** Project (connection) this spec belongs to. */
  project?: string;
  /** True when the page has specs from more than one project, so renderers show
   *  the project label to disambiguate (kept off for the common single-project
   *  case to avoid noise). */
  showProject?: boolean;
  /** Callback a renderer invokes to open a spec in the side panel (tooltip pin
   *  action). The orchestrator threads it from the content script; renderers stay
   *  DOM-pure and testable with a stub. */
  onOpenInPanel?: (specId: string) => void;
  /** Callback a renderer invokes to scroll to and highlight the matched element
   *  on the page. Threaded from the content script like onOpenInPanel so
   *  renderers stay DOM-pure; omitted in tests/stubs makes the jump a no-op. */
  onHighlight?: (el: Element) => void;
  /** Callback a renderer invokes to open the in-place edit form for this spec.
   *  Threaded from the content script like onOpenInPanel; renderers stay DOM-pure. */
  onEdit?: (specId: string) => void;
  /** False for read-only specs (Manual import); renderers hide the Edit
   *  affordance when false. Defaults to editable when omitted. */
  editable?: boolean;
}

// SpecRenderer is the pluggable display contract. The DisplayMode union already
// covers all five modes even though Phase 1 implements only tooltip + sidebar.
export interface SpecRenderer {
  readonly mode: DisplayMode;
  render(spec: Spec, target: Element, meta?: RenderMeta): void;
  /** Remove all rendered UI and listeners. */
  destroy(): void;
}

/** Escaped `<span class="project">` caption, shown only when the page has specs
 *  from more than one project. Shared by all renderers so the guard + markup
 *  live in one place. */
export function projectCaptionHtml(meta?: RenderMeta): string {
  return meta?.showProject && meta.project
    ? `<span class="project">${escapeHtml(meta.project)}</span>`
    : "";
}

/** Escaped `<ul>` of business rules, or "" when there are none. */
export function rulesListHtml(rules: string[]): string {
  if (rules.length === 0) return "";
  return `<ul>${rules.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`;
}
