import { matchElement } from "@specpin/fingerprint-core";
import type { DisplayMode, Manifest, Spec } from "@specpin/spec-schema";
import { createRenderer, resolveMode } from "../renderers/registry.js";
import type { SpecRenderer } from "../renderers/renderer.js";
import type { LauncherPosition } from "../shared/config.js";
import { MANUAL_CONNECTION_ID, type TaggedSpec } from "../shared/connection-types.js";
import type { Theme } from "../shared/theme.js";
import {
  EMPTY_VISIBILITY,
  makeVisibilityFilter,
  type VisibilityState,
} from "../shared/visibility.js";

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
  destroy(): void;
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
): RenderSession {
  const byMode = new Map<DisplayMode, SpecRenderer>();
  const matches = new Map<string, Element>();
  const stats: RenderStats = { rendered: 0, needsReview: 0, unmatched: 0 };
  // The viewer's chosen locale drives rendering; fall back to the project's
  // default then "en" so callers without a manifest still render.
  const defaultLocale = manifest?.settings?.defaultLocale;
  const activeLocale = locale ?? defaultLocale ?? "en";
  // Visibility cascade: hide specs the team/personal filter disabled before any
  // matching or rendering. Empty state keeps every spec (today's behavior). The
  // filter precomputes the disabled set + page gate once for the whole list.
  const visible = makeVisibilityFilter(url, state);
  const visibleSpecs = specs.filter((spec) =>
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

  for (const spec of visibleSpecs) {
    const match = matchElement(spec.fingerprint, doc);
    if (!match.el) {
      if (match.needsReview) stats.needsReview += 1;
      else stats.unmatched += 1;
      continue;
    }
    const mode = forcedMode ?? resolveMode(spec, manifest);
    let renderer = byMode.get(mode);
    if (!renderer) {
      renderer = createRenderer(mode, doc);
      byMode.set(mode, renderer);
    }
    renderer.render(spec, match.el, {
      confidence: match.confidence,
      needsReview: match.needsReview,
      locale: activeLocale,
      defaultLocale,
      availableLocales,
      project: (spec as Partial<TaggedSpec>).project,
      showProject,
      onOpenInPanel,
      onHighlight,
      onEdit,
      // Manual-import specs are read-only; everything else can be edited.
      editable: (spec as Partial<TaggedSpec>).connectionId !== MANUAL_CONNECTION_ID,
      theme,
      dismissed: dismiss?.modes.has(mode) ?? false,
      onSetDismissed: dismiss?.onToggle,
      launcherPosition: dismiss?.position ?? null,
      onLauncherMove: dismiss?.onMove,
    });
    matches.set(spec.id, match.el);
    stats.rendered += 1;
  }

  const renderers = [...byMode.values()];
  return {
    stats,
    renderers,
    matches,
    destroy: () => {
      for (const r of renderers) r.destroy();
    },
  };
}
