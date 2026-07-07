// Inverse-coverage scan: which *interactive* elements on the live page have no
// matching spec. This is the runtime mirror of the match pass — the orchestrator
// resolves specs -> elements; here we walk the interactive elements and subtract
// the ones a spec already documents, leaving the gaps a ghost marker flags.
//
// Pure + DOM-read only (no writes, no globals): the caller passes the document,
// the already-matched element Set, and the personal ignore-list, so this module
// is unit-testable and carries no extension/messaging deps. The stable-key
// definition reuses fingerprint-core's anchor precedence so an "ignore" keys on
// the same signal a spec would match on (DRY with capture/matching).
import {
  cssSelectorFor,
  isGeneratedId,
  safeQueryAll,
  TEST_ID_ATTRS,
} from "@specpin/fingerprint-core";

/** ARIA roles that make an element interactive (a spec-worthy control). A bare
 *  `[role]` selector is far too broad (role="heading" etc.), so the predicate
 *  narrows to this set after the cheap selector pre-filter. */
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "combobox",
  "option",
  "slider",
  "spinbutton",
]);

/** A cheap CSS pre-filter for the scan. Broad on purpose (`[role]`, `[tabindex]`,
 *  `[contenteditable]` catch far more than we want); `isInteractiveCandidate`
 *  applies the precise predicate afterward. */
export const INTERACTIVE_SELECTOR =
  "button, a[href], input, select, textarea, [role], [onclick], [tabindex], [contenteditable]";

/** How many interactive nodes a single scan will examine before it stops. A huge
 *  DOM must never stall the scan; the scan reports `truncated` when it hits this. */
export const DEFAULT_SCAN_CAP = 500;

/** True when `el` is an interactive control worth documenting. Native form
 *  controls + links, ARIA widget roles, click/keyboard-focusable elements, and
 *  content-editable regions. A plain `<div>`/`<span>` (no role/tabindex/onclick)
 *  is NOT interactive. */
export function isInteractiveCandidate(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "button" || tag === "select" || tag === "textarea") return true;
  // A hidden input carries no on-screen control; every other input type does.
  if (tag === "input") return (el.getAttribute("type") ?? "").toLowerCase() !== "hidden";
  if (tag === "a") return el.hasAttribute("href");

  const role = el.getAttribute("role");
  if (role && INTERACTIVE_ROLES.has(role.trim().toLowerCase())) return true;
  if (el.hasAttribute("onclick")) return true;

  // tabindex >= 0 puts the element in the tab order (a custom control); a negative
  // tabindex is programmatic-focus only and not a user-facing control.
  const tabindex = el.getAttribute("tabindex");
  if (tabindex !== null && Number.parseInt(tabindex, 10) >= 0) return true;

  const editable = el.getAttribute("contenteditable");
  if (editable === "" || editable === "true") return true;

  return false;
}

/** True when `el` is both visible and enabled — a gap the user could actually
 *  interact with. Rejects `disabled`/`aria-disabled`, the `hidden` attribute,
 *  `display:none` / `visibility:hidden`, and a zero-size layout box. */
export function isVisibleEnabled(el: Element): boolean {
  // Enabled: native `disabled` (form controls) + the ARIA equivalent.
  if ((el as { disabled?: boolean }).disabled === true) return false;
  if (el.getAttribute("aria-disabled") === "true") return false;
  if (el.hasAttribute("disabled")) return false;

  // Visible: the `hidden` attribute + the two CSS ways to hide without a box swap.
  if ((el as HTMLElement).hidden || el.hasAttribute("hidden")) return false;
  const view = el.ownerDocument?.defaultView;
  const style = view?.getComputedStyle?.(el);
  if (style) {
    if (style.display === "none" || style.visibility === "hidden") return false;
    // opacity:0 hides the element while keeping its box (custom file inputs, toggles).
    if (style.opacity === "0") return false;
    // sr-only clip: rect(0..) / clip-path: inset(50%) hides content while keeping a box.
    if (isSrOnlyClip(style)) return false;
  }

  // Layout-box checks. Skipped when getBoundingClientRect is unavailable so a
  // headless test env can rely on the attribute/style signals above.
  const rect = el.getBoundingClientRect?.();
  if (rect) {
    // Zero-size box (display:none in a real browser) or the sr-only ~1px pattern:
    // neither is a real on-screen control.
    if (rect.width <= 1 && rect.height <= 1) return false;
    // Off-screen positioning (e.g. left:-9999px / top:-9999px). getBoundingClientRect
    // is viewport-relative, so add the scroll offset to test the DOCUMENT-relative
    // box — a control merely scrolled above/left of the viewport keeps a non-negative
    // document position and must stay a gap, unlike one parked off the page origin.
    const docRight = rect.right + (view?.scrollX ?? 0);
    const docBottom = rect.bottom + (view?.scrollY ?? 0);
    if (docRight <= 0 || docBottom <= 0) return false;
  }

  return true;
}

/** Match the two canonical sr-only clip shapes (which hide content while keeping
 *  a layout box) without being fooled by `clip: auto` / `clip-path: none`:
 *  `clip-path: inset(50%)` and the legacy `clip: rect(0 0 0 0)` / `rect(1px …)`.
 *  Only the collapsed `inset(50%)` form matches (a partial `inset(50% 0 0 0)`
 *  still shows content, so it is not treated as hidden). */
function isSrOnlyClip(style: CSSStyleDeclaration): boolean {
  const clipPath = style.clipPath;
  if (clipPath && clipPath !== "none" && /^inset\(\s*50%\s*\)/.test(clipPath)) return true;
  const clip = style.clip; // deprecated but still emitted for sr-only
  if (clip && clip !== "auto" && /^rect\(/.test(clip)) {
    // rect(0 0 0 0) / rect(1px, 1px, 1px, 1px): all offsets collapse to <=1px.
    const nums = clip.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
    if (nums.length >= 4 && nums.every((n) => Math.abs(n) <= 1)) return true;
  }
  return false;
}

/** A stable, reusable key for the personal ignore-list, or null when the element
 *  has no durable signal (so "ignore" is not offered — an unstable key would drop
 *  the moment the DOM shifts). Precedence mirrors fingerprint anchoring:
 *  test-id attrs -> non-generated id -> a uniquely-resolving CSS selector. */
export function stableGapKey(el: Element): string | null {
  for (const attr of TEST_ID_ATTRS) {
    const v = el.getAttribute(attr);
    if (v) return `${attr}=${v}`;
  }
  if (el.id && !isGeneratedId(el.id)) return `#${el.id}`;
  const sel = cssSelectorFor(el);
  const doc = el.ownerDocument ?? undefined;
  if (doc) {
    const hits = safeQueryAll(doc, sel);
    if (hits.length === 1 && hits[0] === el) return `css:${sel}`;
  }
  return null;
}

/** The result of one coverage scan. `gaps` are the elements a ghost marker flags;
 *  the counts feed the popup / side-panel "N interactive · M documented · K gaps"
 *  line. `considered` is every node the pre-filter matched (before the cap);
 *  `truncated` is true when the DOM exceeded the cap and the tail was skipped. */
export interface GapScan {
  gaps: Element[];
  /** Visible + enabled interactive candidates (documented + undocumented). */
  interactive: number;
  /** Candidates already matched by a spec. */
  documented: number;
  /** Nodes the interactive selector matched, before the cap. */
  considered: number;
  truncated: boolean;
}

/** Scan `doc` for interactive elements with no matching spec. Subtracts the
 *  already-matched element Set and the personal ignore-list (keyed by
 *  `stableGapKey`). Bounded by `cap` so a huge DOM can never stall. */
export function findGaps(
  doc: Document,
  matched: Set<Element>,
  ignore: Set<string>,
  cap: number = DEFAULT_SCAN_CAP,
): GapScan {
  const nodes = safeQueryAll(doc, INTERACTIVE_SELECTOR);
  const truncated = nodes.length > cap;
  const scanned = truncated ? nodes.slice(0, cap) : nodes;

  const gaps: Element[] = [];
  let interactive = 0;
  let documented = 0;
  for (const el of scanned) {
    if (!isInteractiveCandidate(el)) continue;
    if (!isVisibleEnabled(el)) continue;
    interactive += 1;
    if (matched.has(el)) {
      documented += 1;
      continue;
    }
    const key = stableGapKey(el);
    if (key && ignore.has(key)) continue;
    gaps.push(el);
  }
  return { gaps, interactive, documented, considered: nodes.length, truncated };
}
