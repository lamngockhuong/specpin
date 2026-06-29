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

/**
 * Does a connection (described by its status fields) serve this origin? Encodes
 * the RT-SA1 rule once: a project that pins domains matches by host; one that
 * pins none matches only when opted in (`matchesAllSites`). Mirrors
 * `SidecarConnection.matchesOrigin` so the popup and the registry stay in step.
 */
export function statusServesOrigin(
  status: { domains: string[]; matchesAllSites: boolean },
  origin: string,
): boolean {
  if (status.domains.length === 0) return status.matchesAllSites;
  return originMatchesDomains(origin, status.domains);
}

/**
 * Does a connection serve this origin AND remain enabled? Layers the per-project
 * on/off switch on top of `statusServesOrigin`: a disabled project is excluded
 * from the surface "serving" set (status health + project list) even when its
 * domains match the page. `enabled` is optional so a connection shape missing the
 * field (older callers) is treated as enabled.
 */
export function connectionServesOrigin(
  status: { domains: string[]; matchesAllSites: boolean; enabled?: boolean },
  origin: string,
): boolean {
  return status.enabled !== false && statusServesOrigin(status, origin);
}

/**
 * The origin a guides read is bound to (RT-C1, the personal-guide trust boundary).
 * A trusted extension page (popup/side panel) may query any origin, so its payload
 * `origin` is honored - it legitimately asks for the active tab. A web-page content
 * script is pinned to its OWN frame's origin, derived from the browser-set
 * `senderTabUrl` (which a page script cannot forge), so it can never read another
 * origin's private personal guides. Returns "" when no usable origin resolves.
 */
export function trustedReadOrigin(opts: {
  fromExtensionPage: boolean;
  payloadOrigin: string;
  senderTabUrl: string | undefined;
}): string {
  if (opts.fromExtensionPage) return opts.payloadOrigin;
  if (!opts.senderTabUrl) return "";
  try {
    return new URL(opts.senderTabUrl).origin;
  } catch {
    return "";
  }
}
