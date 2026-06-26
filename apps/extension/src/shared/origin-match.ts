// Pure origin/domain matching, shared by the content orchestrator, the
// background registry, and the popup. Kept free of DOM/render imports so the
// service worker and popup bundles do not pull in the rendering stack just to
// reuse this predicate.

/**
 * Does this page origin fall under a manifest's configured domains? An empty
 * domain list means "any origin" (the registry layers an explicit opt-in on top
 * of that for sidecar connections). Matching is host-exact or a true subdomain
 * (label-boundary) match, so a domain like "acme.io" matches "app.acme.io" but
 * never "evil-acme.io" or a look-alike embedded in the path/query.
 */
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
