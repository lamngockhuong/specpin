// Provenance rendering + logic, shared by all four reader surfaces (tooltip,
// sidebar, modal, side panel). The helpers return safe HTML *strings* (aligning
// with the three innerHTML renderers, the majority and the hot path); the DOM-
// built side panel adopts the same strings via its existing trusted-fragment
// innerHTML step. A single string-returning contract avoids a 4-way node/string
// fork.
//
// Security: link URLs route through the same hardened `classifyHref` sanitizer
// the Markdown renderer uses (rejects javascript:/data:/scheme-relative), and
// every leaf of author text (labels, test paths, reviewer) is escapeHtml'd. The
// schema's `^https?://` + `format:uri` on Link.url is defense-in-depth at the
// storage boundary; this render-time sanitizer is authoritative.

import type { Link, Spec, SpecMeta, SpecStatus } from "@specpin/spec-schema";
import { t } from "../i18n/index.js";
import { escapeAttr, escapeHtml } from "./html.js";
import { classifyHref } from "./markdown.js";

/** Runtime default when a project pins no `stalenessThresholdDays`. Local/manual
 *  projects (no manifest) always use this. */
export const DEFAULT_STALENESS_THRESHOLD_DAYS = 90;
const MIN_THRESHOLD_DAYS = 1;
const MAX_THRESHOLD_DAYS = 3650;
const DAY_MS = 86_400_000;

/** Resolve a project's configured staleness threshold to a usable day count.
 *  Clamps to [1, 3650] (mirrors the schema bound as defense-in-depth) and falls
 *  back to the 90-day default when absent or non-finite — so a value smuggled in
 *  outside the schema path (or a manifest-less local project) cannot disable the
 *  freshness signal. */
export function resolveStalenessThreshold(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(MAX_THRESHOLD_DAYS, Math.max(MIN_THRESHOLD_DAYS, raw));
  }
  return DEFAULT_STALENESS_THRESHOLD_DAYS;
}

/** Whether a review timestamp is older than the threshold. A future timestamp
 *  (clock skew) is never stale. */
export function isStale(reviewedAtMs: number, nowMs: number, thresholdDays: number): boolean {
  return nowMs - reviewedAtMs > thresholdDays * DAY_MS;
}

// Largest-first units for the relative-time reducer. Weeks omitted: Intl renders
// "last week"/"N weeks ago" but months read more naturally past ~4 weeks.
const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3600],
  ["minute", 60],
];

// One cached formatter per locale: Intl.RelativeTimeFormat construction resolves
// locale data and is comparatively expensive, and the locale is constant across a
// render pass — so N reviewed specs would otherwise rebuild it identically N times.
let rtfCache: Intl.RelativeTimeFormat | undefined;
let rtfCacheKey: string | undefined;
function relativeTimeFormatter(locale?: string): Intl.RelativeTimeFormat {
  const key = locale || "";
  if (!rtfCache || rtfCacheKey !== key) {
    rtfCache = new Intl.RelativeTimeFormat(locale || undefined, { numeric: "auto" });
    rtfCacheKey = key;
  }
  return rtfCache;
}

/** Locale-aware "N days ago" via `Intl.RelativeTimeFormat` (no new i18n keys).
 *  Rounds to the largest whole unit; a future timestamp (clock skew) and any
 *  delta under a minute both read as "now". */
export function formatRelativeTime(fromMs: number, nowMs: number, locale?: string): string {
  const rtf = relativeTimeFormatter(locale);
  let deltaSec = Math.round((fromMs - nowMs) / 1000);
  if (deltaSec > 0) deltaSec = 0; // never show a review in the future
  const abs = Math.abs(deltaSec);
  for (const [unit, secs] of RELATIVE_UNITS) {
    if (abs >= secs) return rtf.format(Math.round(deltaSec / secs), unit);
  }
  return rtf.format(0, "second"); // "now"
}

/** Tier-styled status chip, or "" when status is absent (absent = neutral, no
 *  badge). The tier class is derived from the validated enum value, never from
 *  free text. */
export function statusBadgeHtml(status?: SpecStatus): string {
  if (!status) return "";
  const label =
    status === "draft"
      ? t("prov.statusDraft")
      : status === "approved"
        ? t("prov.statusApproved")
        : t("prov.statusDeprecated");
  return `<span class="prov-status prov-status-${status}">${escapeHtml(label)}</span>`;
}

/** Issue/doc link row. Each URL routes through `classifyHref`; a URL that fails
 *  the allowlist keeps its label as plain (non-linked) text rather than vanishing.
 *  Provenance links are external references, so they always open in a new tab with
 *  `rel="noopener noreferrer"`. */
export function provenanceLinksHtml(links?: Link[], pageOrigin?: string): string {
  if (!links || links.length === 0) return "";
  const anchors = links.map((link) => {
    const label = escapeHtml(link.label);
    const classified = classifyHref(link.url, pageOrigin);
    if (!classified) return `<span class="prov-link prov-link-broken">${label}</span>`;
    return `<a class="prov-link" href="${escapeAttr(classified.href)}" rel="noopener noreferrer" target="_blank">${label}</a>`;
  });
  return `<div class="prov-links">${anchors.join("")}</div>`;
}

/** Declarative "linked tests (N)" disclosure. Wording is intentionally "linked"
 *  (never "verified"/"passed"): `specpin validate` checks the paths exist, it does
 *  not run them. Paths are trimmed, empties dropped, and each is escapeHtml'd. */
export function linkedTestsHtml(verifiedBy?: string[]): string {
  const paths = (verifiedBy ?? []).map((p) => p.trim()).filter(Boolean);
  if (paths.length === 0) return "";
  const items = paths.map((p) => `<li>${escapeHtml(p)}</li>`).join("");
  return (
    `<details class="linked-tests">` +
    `<summary title="${escapeAttr(t("prov.linkedTestsTitle"))}">` +
    `${escapeHtml(t("prov.linkedTests", { count: paths.length }))}</summary>` +
    `<ul>${items}</ul></details>`
  );
}

/** "Reviewed {relative}" line + a stale indicator past the threshold. Returns
 *  `{ html, isStale }`; both empty/false when `meta`/`reviewedAt` is absent or
 *  unparseable (never throws). `reviewedBy`, when present, is appended (escaped).
 *  `isStale` is the staleness decision as a discrete value (also encoded into the
 *  html as the `is-stale` class): exposed so tests and future callers can assert
 *  it without parsing the HTML. */
export function reviewedInfoHtml(
  meta: SpecMeta | undefined,
  thresholdDays: number,
  nowMs: number,
  locale?: string,
): { html: string; isStale: boolean } {
  const reviewedAt = meta?.reviewedAt;
  if (!reviewedAt) return { html: "", isStale: false };
  const ms = Date.parse(reviewedAt);
  if (Number.isNaN(ms)) return { html: "", isStale: false };
  const stale = isStale(ms, nowMs, thresholdDays);
  const when = formatRelativeTime(ms, nowMs, locale);
  const who = meta?.reviewedBy?.trim();
  // Substitute into the (plain-text) template first, then escape the whole label,
  // so a `<` in the author-controlled reviewer token can never open a tag.
  const label = escapeHtml(
    who ? t("prov.reviewedBy", { when, who }) : t("prov.reviewed", { when }),
  );
  const staleBadge = stale
    ? `<span class="prov-stale" title="${escapeAttr(t("prov.staleTitle", { days: thresholdDays }))}">${escapeHtml(t("prov.stale"))}</span>`
    : "";
  return {
    html: `<div class="prov-reviewed${stale ? " is-stale" : ""}">${label}${staleBadge}</div>`,
    isStale: stale,
  };
}

export interface ProvenanceRenderOpts {
  /** Host page origin, threaded to `classifyHref` (link routing). */
  pageOrigin?: string;
  /** Per-spec staleness threshold (already clamped by the background resolver).
   *  Omitted → the 90-day default (also the value for manifest-less projects). */
  thresholdDays?: number;
  /** Active viewer locale for the relative-time formatter. */
  locale?: string;
  /** Injectable "now" (ms) for deterministic tests; defaults to Date.now(). */
  nowMs?: number;
}

/** The whole provenance block for one spec as a safe HTML string, or "" when the
 *  spec carries none of the provenance fields (so a legacy spec renders byte-
 *  identical to before). Every surface appends exactly this after its rules/tags. */
export function provenanceSectionHtml(spec: Spec, opts: ProvenanceRenderOpts): string {
  const status = statusBadgeHtml(spec.status);
  const links = provenanceLinksHtml(spec.links, opts.pageOrigin);
  const tests = linkedTestsHtml(spec.verifiedBy);
  const reviewed = reviewedInfoHtml(
    spec.meta,
    opts.thresholdDays ?? DEFAULT_STALENESS_THRESHOLD_DAYS,
    opts.nowMs ?? Date.now(),
    opts.locale,
  );
  if (!status && !links && !tests && !reviewed.html) return "";
  return `<div class="prov">${status}${links}${tests}${reviewed.html}</div>`;
}

/** Shared Shadow-DOM CSS for the provenance block. Token-based so it themes per
 *  host; each Shadow-DOM renderer interpolates it into its STYLES (like
 *  MARKDOWN_BODY_CSS). The side panel styles the same classes in its page CSS. */
export const PROVENANCE_CSS = `
.prov { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; font-size: 0.85em; }
.prov-status {
  align-self: flex-start; padding: 1px 8px; border-radius: 999px;
  border: 1px solid var(--sp-border); font-size: 0.8em; font-weight: 600;
}
.prov-status-draft { background: var(--sp-control); color: var(--sp-text-2); }
.prov-status-approved {
  background: var(--sp-success-bg); color: var(--sp-success-text);
  border-color: var(--sp-success-border);
}
.prov-status-deprecated {
  background: var(--sp-warning-bg); color: var(--sp-warning);
  border-color: var(--sp-warning-border); text-decoration: line-through;
}
.prov-links { display: flex; flex-wrap: wrap; gap: 8px; }
.prov-link { color: var(--sp-accent); text-decoration: underline; }
.prov-link-broken { color: var(--sp-text-3); text-decoration: none; }
.linked-tests > summary { cursor: pointer; color: var(--sp-text-2); }
.linked-tests ul { margin: 4px 0; padding-left: 18px; }
.linked-tests li { font-family: var(--sp-font-mono); font-size: 0.9em; word-break: break-all; }
.prov-reviewed { color: var(--sp-text-2); }
.prov-reviewed.is-stale { color: var(--sp-warning); }
.prov-stale {
  margin-left: 6px; padding: 0 6px; border-radius: 999px;
  background: var(--sp-warning-bg); color: var(--sp-warning);
  border: 1px solid var(--sp-warning-border); font-size: 0.85em;
}
`;
