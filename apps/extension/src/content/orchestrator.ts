import { matchElement } from "@specpin/fingerprint-core";
import type { DisplayMode, Manifest, Spec } from "@specpin/spec-schema";
import type { SpecRenderer } from "../renderers/renderer.js";
import { createRenderer, resolveMode } from "../renderers/registry.js";

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
 */
export function renderSession(
  specs: Spec[],
  manifest: Manifest | null,
  doc: Document = document,
  forcedMode?: DisplayMode | null,
): RenderSession {
  const byMode = new Map<DisplayMode, SpecRenderer>();
  const stats: RenderStats = { rendered: 0, needsReview: 0, unmatched: 0 };

  for (const spec of specs) {
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
    renderer.render(spec, match.el, { confidence: match.confidence, needsReview: match.needsReview });
    stats.rendered += 1;
  }

  const renderers = [...byMode.values()];
  return { stats, renderers, destroy: () => renderers.forEach((r) => r.destroy()) };
}

/** Does this page origin fall under the manifest's configured domains? An empty
 * domain list means "any origin" (useful before a project pins its domains).
 * Matching is host-exact or a true subdomain (label-boundary) match, so a domain
 * like "acme.io" matches "app.acme.io" but never "evil-acme.io" or a look-alike
 * embedded in the path/query. */
export function originMatchesDomains(origin: string, domains: string[]): boolean {
  if (!domains || domains.length === 0) return true;
  let host = origin;
  try {
    host = new URL(origin).host;
  } catch {
    // origin may already be a bare host:port
  }
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}
