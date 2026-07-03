import {
  type MatchAnchor,
  type Signal,
  type SignalScores,
  WEIGHTS,
} from "@specpin/fingerprint-core";
import { type MessageKey, t } from "../i18n/index.js";
import { escapeHtml } from "../shared/html.js";
import type { RenderMeta } from "./renderer.js";

// Shared confidence-badge markup for the in-page renderers (tooltip, sidebar,
// modal), so the badge lives in one place instead of being re-authored three
// times (DRY). Escaped HTML, token-styled, Shadow-DOM-safe.
//
// Tiers: the exact tier is SILENT (a confident exact match is the common good
// state; a badge on it just clutters the tip). The fuzzy (css / 0.7) tier and
// the hybrid "scored" tier each render a badge; a MID scored match reuses the
// cautionary fuzzy style so the reader calibrates trust. The needs-review tag is
// rendered separately by each renderer (existing behavior).

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

/** i18n key naming a scorer signal, for the scored-tier "why matched" hint. */
const SIGNAL_LABEL_KEYS: Record<Signal, MessageKey> = {
  textContent: "match.signal.text",
  nearbyLabels: "match.signal.labels",
  attributes: "match.signal.attributes",
  tagName: "match.signal.tag",
  domPath: "match.signal.structure",
  positionHint: "match.signal.position",
};

/** The signal that contributed most to a scored match (similarity × weight), or
 *  null when nothing scored above zero. */
function topSignal(signals: SignalScores): Signal | null {
  let best: Signal | null = null;
  let bestVal = 0;
  for (const key of Object.keys(SIGNAL_LABEL_KEYS) as Signal[]) {
    const val = signals[key] * WEIGHTS[key];
    if (val > bestVal) {
      bestVal = val;
      best = key;
    }
  }
  return best;
}

/** "Matched by <reason>" text, or "" when the reason is unknown. A scored match
 *  explains itself by its dominant signal; other tiers by their anchor. */
export function whyMatched(meta?: RenderMeta): string {
  if (meta?.strategy === "scored" && meta.signals) {
    const sig = topSignal(meta.signals);
    if (sig) return `${t("match.whyPrefix")} ${t(SIGNAL_LABEL_KEYS[sig])}`;
  }
  const key = anchorLabelKey(meta?.anchor ?? null);
  return key ? `${t("match.whyPrefix")} ${t(key)}` : "";
}

/** Escaped badge markup for a spec's match tier, or "" for the silent exact tier.
 *  The fuzzy (css) badge is fixed-confidence; the scored badge shows its
 *  confidence and reads as the cautionary fuzzy style when MID (needsReview) so
 *  the reader calibrates trust. Both carry the "why matched" hint as a compact
 *  `title`. */
export function confidenceBadge(meta?: RenderMeta): string {
  if (meta?.strategy === "scored") {
    const why = whyMatched(meta);
    const title = why ? ` title="${escapeHtml(why)}"` : "";
    const pct = Math.round((meta.confidence ?? 0) * 100);
    // MID scored (needsReview) reuses the warning style; HIGH gets its own
    // accent state, weaker than the silent exact tier.
    const cls = meta.needsReview ? "sp-conf-fuzzy" : "sp-conf-scored";
    const label = `${t("match.scored")} ${pct}%`;
    return `<span class="sp-conf ${cls}"${title}>${escapeHtml(label)}</span>`;
  }
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
.sp-conf-scored { color: var(--sp-accent); border-color: var(--sp-accent); }
`;
