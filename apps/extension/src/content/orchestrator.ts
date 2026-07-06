import {
  captureFingerprint,
  generateCandidates,
  hasContentSignal,
  matchElement,
  rankCandidates,
} from "@specpin/fingerprint-core";
import type { DisplayMode, Manifest, Spec } from "@specpin/spec-schema";
import { createRenderer, resolveMode } from "../renderers/registry.js";
import type { SpecRenderer } from "../renderers/renderer.js";
import type { LauncherPosition } from "../shared/config.js";
import type { TaggedSpec } from "../shared/connection-types.js";
import type { PassiveDriftInput } from "../shared/messaging.js";
import type { Theme } from "../shared/theme.js";
import {
  EMPTY_VISIBILITY,
  makeVisibilityFilter,
  pageScopeAllows,
  type VisibilityState,
} from "../shared/visibility.js";

/** Top-K candidate fingerprints captured per passive drift snapshot: enough to
 *  carry "what the DOM looks like now" without storing the whole page. */
const PASSIVE_K = 5;

export interface RenderStats {
  rendered: number;
  needsReview: number;
  unmatched: number;
}

/** A live render: the renderers created for this pass plus a teardown. */
export interface RenderSession {
  stats: RenderStats;
  renderers: SpecRenderer[];
  /** Matched element per rendered spec id, so a surface that only knows a spec id
   *  (popup / side panel, via the HIGHLIGHT_ELEMENT message) can resolve the
   *  element to highlight without re-running the matcher. */
  matches: Map<string, Element>;
  /** Passive drift snapshots collected this pass (orphaned + MID-scored specs),
   *  for the local corpus. Empty unless `opts.captureDrift` was set (opt-in). The
   *  caller sends these to the background single-writer. */
  drift: PassiveDriftInput[];
  destroy(): void;
}

/** Snapshot the candidate fingerprints the scorer weighed for a non-healthy spec
 *  (orphaned or MID-scored), so the local corpus captures "what the DOM looks
 *  like now" — fingerprints only, no raw HTML. `matchedEl` is the scorer's choice
 *  for a MID match (null for an orphan); its index becomes the TENTATIVE
 *  `chosenByScorer` label. Returns null when the fingerprint has no identifying
 *  signal (nothing to learn). */
function capturePassiveDrift(
  spec: Spec,
  doc: Document,
  matchedEl: Element | null,
): PassiveDriftInput | null {
  const fp = spec.fingerprint;
  if (!hasContentSignal(fp)) return null;
  const { candidates } = generateCandidates(fp, doc);
  const ranked = rankCandidates(fp, candidates).slice(0, PASSIVE_K);
  const chosen = matchedEl ? ranked.findIndex((r) => r.el === matchedEl) : -1;
  return {
    kind: "passive",
    old: fp,
    candidates: ranked.map((r) => captureFingerprint(r.el)),
    chosenByScorer: chosen >= 0 ? chosen : undefined,
    pageUrl: fp.pageUrl ?? null,
    project: (spec as Partial<TaggedSpec>).project,
    specId: spec.id,
  };
}

/**
 * Match and render specs through the renderer registry. Each spec's mode is
 * resolved per-spec (or overridden by forcedMode from the keyboard toggle);
 * one renderer is created per distinct mode and shared across its specs.
 *
 * Specs are first filtered by the visibility cascade (`state` + the current page
 * `url`); an empty state means "all visible" (backward compatible). The optional
 * `onOpenInPanel` callback is threaded to renderers (the tooltip pin action).
 */
export function renderSession(
  specs: Spec[],
  manifest: Manifest | null,
  doc: Document = document,
  forcedMode?: DisplayMode | null,
  locale?: string,
  availableLocales?: string[],
  state: VisibilityState = EMPTY_VISIBILITY,
  url = "",
  onOpenInPanel?: (specId: string) => void,
  onHighlight?: (el: Element) => void,
  onEdit?: (specId: string) => void,
  theme?: Theme,
  dismiss?: {
    /** Modes currently dismissed; their renderers show the relaunch pill only. */
    modes: Set<DisplayMode>;
    /** Persist a dismiss/reopen and re-render (owned by the content script). */
    onToggle: (mode: DisplayMode, dismissed: boolean) => void;
    /** Stored relaunch-pill position, or null for the default corner. */
    position?: LauncherPosition | null;
    /** Persist a user-dragged pill position (owned by the content script). */
    onMove?: (pos: LauncherPosition) => void;
  },
  onDelete?: (specId: string) => void,
  opts?: {
    /** Collect passive drift snapshots for orphaned/MID-scored specs (corpus
     *  opt-in). Off by default so the hot render path stays free of candidate
     *  generation. */
    captureDrift?: boolean;
    /** Confirm-loop "Correct" callback, threaded to renderers only when the corpus
     *  opt-in is ON (so the action appears only then). */
    onConfirm?: (specId: string) => void;
    /** When on, tooltip-mode badges show a 1-based reading-order number instead of
     *  "S" (Options opt-in, default OFF). */
    badgeNumbering?: boolean;
    /** "Duplicate to element" callback (clone), threaded like onEdit; renderers
     *  show it only when the spec is editable/writable. */
    onClone?: (specId: string) => void;
  },
): RenderSession {
  const numbering = opts?.badgeNumbering ?? false;
  const byMode = new Map<DisplayMode, SpecRenderer>();
  const matches = new Map<string, Element>();
  const drift: PassiveDriftInput[] = [];
  const stats: RenderStats = { rendered: 0, needsReview: 0, unmatched: 0 };
  // The viewer's chosen locale drives rendering; fall back to the project's
  // default then "en" so callers without a manifest still render.
  const defaultLocale = manifest?.settings?.defaultLocale;
  const activeLocale = locale ?? defaultLocale ?? "en";
  // Visibility cascade: hide specs the team/personal filter disabled before any
  // matching or rendering. Empty state keeps every spec (today's behavior). The
  // filter precomputes the disabled set + page gate once for the whole list.
  // Page scope: drop specs whose fingerprint `pageUrl` glob does not cover this
  // page, so a spec pinned on another route (same layout, colliding selector)
  // never renders here. A spec with no `pageUrl` matches anywhere (legacy).
  const visible = makeVisibilityFilter(url, state);
  const visibleSpecs = specs.filter(
    (spec) =>
      pageScopeAllows(spec.fingerprint.pageUrl, url) &&
      visible({ id: spec.id, tags: spec.tags, file: (spec as Partial<TaggedSpec>)._file }),
  );
  // Show project labels only when more than one project contributes specs to the
  // page, so single-project pages stay uncluttered.
  const projects = new Set<string>();
  for (const spec of visibleSpecs) {
    const project = (spec as Partial<TaggedSpec>).project;
    if (project) projects.add(project);
  }
  const showProject = projects.size > 1;
  // Origin of the host page, so spec-text links to the same origin open in the
  // current tab (renderers run inside the host page, so a plain same-origin <a>
  // navigates it). Falls back to undefined when `url` is empty/unparseable, which
  // leaves every link opening in a new tab (legacy behavior).
  let pageOrigin: string | undefined;
  try {
    if (url) pageOrigin = new URL(url).origin;
  } catch {
    // Unparseable url: leave pageOrigin undefined (legacy: all links new-tab).
  }

  // One matched-and-rendered spec, collected before rendering so the ordinal pass
  // (which needs the whole set) can run first. `el` is the resolved match target.
  interface RenderRecord {
    spec: Spec;
    el: Element;
    match: ReturnType<typeof matchElement>;
    mode: DisplayMode;
  }

  // Loop A - match + collect. Run matchElement once per spec, keep the orphan /
  // needsReview stats and the drift snapshots, and record each matched spec (with
  // its resolved display mode) for the render pass. No rendering happens here so
  // the ordinal pass below sees the full matched set first.
  const renderList: RenderRecord[] = [];
  for (const spec of visibleSpecs) {
    const match = matchElement(spec.fingerprint, doc);
    if (!match.el) {
      if (match.needsReview) stats.needsReview += 1;
      else stats.unmatched += 1;
      // Orphaned: snapshot the current candidates for the corpus (opt-in).
      if (opts?.captureDrift) {
        const entry = capturePassiveDrift(spec, doc, null);
        if (entry) drift.push(entry);
      }
      continue;
    }
    // MID-tier scored match (matched, but low-confidence): snapshot too, tagging
    // the scorer's chosen element as the tentative label.
    if (opts?.captureDrift && match.strategy === "scored" && match.needsReview) {
      const entry = capturePassiveDrift(spec, doc, match.el);
      if (entry) drift.push(entry);
    }
    const mode = forcedMode ?? resolveMode(spec, manifest);
    renderList.push({ spec, el: match.el, match, mode });
  }

  // Ordinal pass: number tooltip-mode badges in DOM document order (1-based) so a
  // spec appearing first in the DOM gets `1`. Only tooltip badges are numbered, so
  // the largest number equals the on-page badge count with no gaps. DOM order (via
  // compareDocumentPosition) is deterministic and layout-free; it equals visual
  // reading order for effectively all real pages (CSS-reordered / absolutely
  // positioned layouts are the accepted imperfection).
  const ordinalById = new Map<string, number>();
  if (numbering) {
    const inReadingOrder = renderList
      .filter((r) => r.mode === "tooltip")
      .sort((a, b) => {
        if (a.el === b.el) return 0;
        const pos = a.el.compareDocumentPosition(b.el);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1; // a before b
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });
    inReadingOrder.forEach((r, i) => {
      ordinalById.set(r.spec.id, i + 1);
    });
  }

  // Loop B - render. Iterate renderList in its original order (unchanged render
  // semantics), creating one renderer per distinct mode, and pass the per-spec
  // meta plus the numbering flag + resolved ordinal (undefined for non-tooltip or
  // when numbering is off).
  for (const { spec, el, match, mode } of renderList) {
    let renderer = byMode.get(mode);
    if (!renderer) {
      renderer = createRenderer(mode, doc);
      byMode.set(mode, renderer);
    }
    renderer.render(spec, el, {
      confidence: match.confidence,
      needsReview: match.needsReview,
      strategy: match.strategy,
      anchor: match.anchor,
      signals: match.signals,
      locale: activeLocale,
      defaultLocale,
      availableLocales,
      project: (spec as Partial<TaggedSpec>).project,
      showProject,
      onOpenInPanel,
      onHighlight,
      onEdit,
      onDelete,
      onConfirm: opts?.onConfirm,
      onClone: opts?.onClone,
      // Editable only when this origin can write the spec back to its source
      // (sidecar serving the page, or a local batch serving it under the
      // applyToAllSites gate). The background sets `writable`; gating on it avoids
      // offering an Edit whose save the origin guard would reject.
      editable: Boolean((spec as Partial<TaggedSpec>).writable),
      theme,
      pageOrigin,
      stalenessThresholdDays: (spec as Partial<TaggedSpec>).stalenessThresholdDays,
      dismissed: dismiss?.modes.has(mode) ?? false,
      onSetDismissed: dismiss?.onToggle,
      launcherPosition: dismiss?.position ?? null,
      onLauncherMove: dismiss?.onMove,
      // ordinalById is empty unless numbering is on, so this is undefined when off.
      ordinal: ordinalById.get(spec.id),
    });
    matches.set(spec.id, el);
    stats.rendered += 1;
  }

  const renderers = [...byMode.values()];
  return {
    stats,
    renderers,
    matches,
    drift,
    destroy: () => {
      for (const r of renderers) r.destroy();
    },
  };
}
