import type { MatchAnchor, MatchResult, SignalScores } from "@specpin/fingerprint-core";
import type { DisplayMode, Spec } from "@specpin/spec-schema";
import type { LauncherPosition } from "../shared/config.js";
import { escapeHtml } from "../shared/html.js";
import { renderInlineMarkdown } from "../shared/markdown.js";
import type { Theme } from "../shared/theme.js";

// Extra signal passed from the matcher so renderers can distinguish a confident
// hit from a lower-confidence one that needs review, plus the viewer locale used
// to resolve the spec's localized text (Phase 1 passes the base/default locale;
// Phase 2 passes the viewer's chosen locale).
export interface RenderMeta {
  confidence: number;
  needsReview: boolean;
  /** Match tier from the matcher, so a renderer can show a confidence badge for
   *  the cautionary tiers (an exact match stays silent). */
  strategy?: MatchResult["strategy"];
  /** Which signal resolved the match, for the "why matched" hint. */
  anchor?: MatchAnchor;
  /** Per-signal similarity breakdown for a scored match, so the badge can name
   *  the dominant signal ("why matched"). Present only for strategy:"scored". */
  signals?: SignalScores;
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
  /** Callback a renderer invokes to delete this spec (runs a confirm first).
   *  Threaded from the content script like onEdit; renderers stay DOM-pure. */
  onDelete?: (specId: string) => void;
  /** Callback a renderer invokes to affirm a scored match is correct (the confirm
   *  loop). Records a supervised confirmation in the local corpus. Provided only
   *  when the corpus opt-in is ON, so the "Correct" action appears only then. */
  onConfirm?: (specId: string) => void;
  /** Callback a renderer invokes to clone this spec onto a newly-picked element.
   *  Threaded like onEdit; shown only when the spec is editable. */
  onClone?: (specId: string) => void;
  /** False for read-only specs (Manual import); renderers hide the Edit + Delete
   *  affordances when false. Defaults to editable when omitted. */
  editable?: boolean;
  /** True when this display mode is currently dismissed. Aggregate renderers
   *  (sidebar, modal) show the floating relaunch pill instead of their panel. */
  dismissed?: boolean;
  /** Persist a dismiss (true) or reopen (false) for a whole display mode. Threaded
   *  from the content script so renderers stay DOM-pure; the content script owns
   *  the dismissed-modes state and re-renders. Omitted in tests/stubs. */
  onSetDismissed?: (mode: DisplayMode, dismissed: boolean) => void;
  /** Stored position for the relaunch pill (viewport px), or null/omitted for the
   *  default bottom-right corner. */
  launcherPosition?: LauncherPosition | null;
  /** Persist a user-dragged relaunch-pill position. Threaded like onSetDismissed so
   *  the renderer stays DOM-pure; the content script owns the storage write. */
  onLauncherMove?: (pos: LauncherPosition) => void;
  /** Forced UI theme for the renderer's shadow host. Threaded from the content
   *  script so the host carries `data-theme` and the `:host([data-theme])` token
   *  block activates. Omitted in tests/stubs leaves the host on the system default. */
  theme?: Theme;
  /** Origin of the page the spec is pinned to. Threaded so spec-text links to the
   *  same origin open in the current tab and cross-origin links open in a new tab
   *  (see classifyHref). Omitted leaves every link opening in a new tab. */
  pageOrigin?: string;
  /** This spec's project staleness threshold (days), resolved + clamped by the
   *  background per the spec's own project (90-day default for manifest-less local
   *  projects). Threaded per-spec so the freshness signal is correct on a
   *  multi-project page. Omitted falls back to the 90-day default at render. */
  stalenessThresholdDays?: number;
  /** 1-based reading-order position among tooltip-mode badges on the page, set
   *  only when the user enabled badge numbering (Options) and this spec renders as
   *  a tooltip badge. The tooltip renderer prints it instead of "S"; other
   *  renderers ignore it. Its presence is the "numbering on" signal (always >= 1). */
  ordinal?: number;
}

// SpecRenderer is the pluggable display contract. The DisplayMode union already
// covers all five modes even though Phase 1 implements only tooltip + sidebar.
export interface SpecRenderer {
  readonly mode: DisplayMode;
  render(spec: Spec, target: Element, meta?: RenderMeta): void;
  /** Bring a spec to the foreground in this surface, if it can (the context-menu
   *  "Show spec here" action: the tooltip pins its tip). Returns true when this
   *  renderer handled the spec. Optional: only tooltip implements it for now. */
  revealSpec?(specId: string): boolean;
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

/** `<ul>` of business rules, or "" when there are none. Each rule renders its
 *  inline Markdown subset (bold/italic/link); the renderer escapes every leaf, so
 *  the output is safe to insert via innerHTML. Shared by tooltip/modal/sidebar. */
export function rulesListHtml(rules: string[], pageOrigin?: string): string {
  if (rules.length === 0) return "";
  return `<ul>${rules.map((r) => `<li>${renderInlineMarkdown(r, pageOrigin)}</li>`).join("")}</ul>`;
}

/** Shared CSS for the Markdown subset emitted into a `.d` description block (its
 *  paragraphs + lists) and for content links. The styled tag set is a property of
 *  the renderer here, so it lives in one place; each Shadow-DOM renderer
 *  interpolates it into its own STYLES and keeps its surface-specific container
 *  (`.d`/`.tip`/`.card`) and rule-list chrome. Token-based, so it themes per host. */
export const MARKDOWN_BODY_CSS = `
.d p { margin: 4px 0; }
.d p:first-child { margin-top: 0; }
.d ul, .d ol { margin: 4px 0; padding-left: 18px; }
a { color: var(--sp-accent); text-decoration: underline; }
code {
  font: 0.9em/1.4 var(--sp-font-mono);
  padding: 1px 5px; border-radius: 4px;
  /* --sp-control (teal tint) not --sp-elevated: elevated is pure white in the
     light theme, so a code chip would vanish against the white surface. */
  background: var(--sp-control); border: 1px solid var(--sp-border);
  word-break: break-word;
}
`;
