import type { MatchAnchor } from "@specpin/fingerprint-core";
import { type MessageKey, t } from "../i18n/index.js";
import { escapeHtml } from "../shared/html.js";
import type { RenderMeta } from "./renderer.js";

// Shared confidence-badge markup for the in-page renderers (tooltip, sidebar,
// modal), so the badge lives in one place instead of being re-authored three
// times (DRY). Escaped HTML, token-styled, Shadow-DOM-safe.
//
// Tiers (Validation Session 1 decision — the exact tier is SILENT): only the
// fuzzy (css / 0.7) tier renders a badge, since a confident exact match is the
// common good state and a badge on it just clutters the tip. The needs-review
// tag is rendered separately by each renderer (existing behavior).

/** i18n key naming the anchor that resolved a match, for the "why matched" hint. */
function anchorLabelKey(anchor: MatchAnchor): MessageKey | null {
  switch (anchor) {
    case "testId":
      return "match.byTestId";
    case "aria":
      return "match.byAria";
    case "id":
      return "match.byId";
    case "css":
      return "match.byCss";
    default:
      return null;
  }
}

/** "Matched by <anchor>" text, or "" when the anchor is unknown. */
export function whyMatched(meta?: RenderMeta): string {
  const key = anchorLabelKey(meta?.anchor ?? null);
  return key ? `${t("match.whyPrefix")} ${t(key)}` : "";
}

/** Escaped badge markup for a spec's match tier, or "" for the silent exact tier
 *  (and any non-fuzzy tier). The fuzzy badge carries the "why matched" hint as a
 *  `title` so it stays compact. */
export function confidenceBadge(meta?: RenderMeta): string {
  if (meta?.strategy !== "css") return "";
  const why = whyMatched(meta);
  const title = why ? ` title="${escapeHtml(why)}"` : "";
  return `<span class="sp-conf sp-conf-fuzzy"${title}>${escapeHtml(t("match.fuzzy"))}</span>`;
}

/** Shared badge CSS each Shadow-DOM renderer interpolates into its STYLES, so the
 *  badge themes per host via tokens and its look lives in one place. */
export const CONFIDENCE_BADGE_CSS = `
.sp-conf {
  display: inline-block; vertical-align: middle;
  font: 600 9px/1 var(--sp-font-mono); letter-spacing: 0.06em; text-transform: uppercase;
  padding: 3px 6px; border-radius: 5px; border: 1px solid var(--sp-border);
  color: var(--sp-text-3);
}
.sp-conf-fuzzy { color: var(--sp-warning); border-color: var(--sp-warning-border); }
`;
