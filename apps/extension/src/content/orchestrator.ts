import { matchElement } from "@specpin/fingerprint-core";
import type { DisplayMode, Manifest, Spec } from "@specpin/spec-schema";
import { createRenderer, resolveMode } from "../renderers/registry.js";
import type { SpecRenderer } from "../renderers/renderer.js";
import type { TaggedSpec } from "../shared/connection-types.js";
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
): RenderSession {
  const byMode = new Map<DisplayMode, SpecRenderer>();
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
    });
    stats.rendered += 1;
  }

  const renderers = [...byMode.values()];
  return {
    stats,
    renderers,
    destroy: () => {
      for (const r of renderers) r.destroy();
    },
  };
}
