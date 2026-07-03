import type { ElementFingerprint, PositionHint } from "@specpin/spec-schema";
import { cssEscapeAttrValue } from "./css-escape.js";
import { detectFramework } from "./detect-framework.js";
import { isGeneratedId } from "./generated-id.js";
import { cssSelectorFor } from "./selector.js";
import { xpathFor } from "./xpath.js";

/** Attributes searched, in priority order, for the Tier-1 test-id anchor. */
export const TEST_ID_ATTRS = ["data-spec-id", "data-testid", "data-cy", "data-qa"] as const;

/** Attributes copied verbatim into the fingerprint (href handled separately). */
const ATTR_WHITELIST = ["role", "type", "name", "placeholder"] as const;

const TEXT_MAX = 100;
const MAX_NEARBY_LABELS = 5;

function extractTestId(el: Element): string | null {
  for (const attr of TEST_ID_ATTRS) {
    const v = el.getAttribute(attr);
    if (v) return v;
  }
  return null;
}

export function normalizeText(text: string | null): string | null {
  if (!text) return null;
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.length > TEXT_MAX ? collapsed.slice(0, TEXT_MAX) : collapsed;
}

function hrefPattern(href: string): string {
  try {
    const url = new URL(href, "http://x");
    return url.pathname;
  } catch {
    return href;
  }
}

export function whitelistedAttributes(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of ATTR_WHITELIST) {
    const v = el.getAttribute(attr);
    if (v != null) out[attr] = v;
  }
  const href = el.getAttribute("href");
  if (href != null) out.href = hrefPattern(href);
  return out;
}

/** The page path the element was captured on, used to scope the spec to its
 *  route. Query and hash are dropped (the scope model matches on path only).
 *  Null when no location is available (e.g. a detached document). */
function pageUrlOf(el: Element): string | null {
  return el.ownerDocument?.location?.pathname || null;
}

export function positionHint(el: Element): PositionHint {
  const parent = el.parentElement;
  if (!parent) return { index: 0, siblingCount: 1 };
  const siblings = Array.from<Element>(parent.children);
  return { index: siblings.indexOf(el), siblingCount: siblings.length };
}

export function domPathFor(el: Element): string[] {
  const path: string[] = [];
  let current: Element | null = el;
  while (
    current &&
    current.nodeType === 1 &&
    current.tagName !== "BODY" &&
    current.tagName !== "HTML"
  ) {
    path.unshift(current.tagName.toLowerCase());
    current = current.parentElement;
  }
  return path;
}

export function nearbyLabels(el: Element): string[] {
  const labels = new Set<string>();
  const doc = el.ownerDocument;

  const pushText = (node: Element | null) => {
    const t = normalizeText(node?.textContent ?? null);
    if (t) labels.add(t);
  };

  // <label for="id"> (id may be framework-generated, e.g. ":r1:", so escape it)
  if (el.id && doc) {
    try {
      pushText(doc.querySelector(`label[for="${cssEscapeAttrValue(el.id)}"]`));
    } catch {
      // unselectable id; skip this label source
    }
  }
  // aria-labelledby references
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy && doc) {
    for (const ref of labelledBy.split(/\s+/)) pushText(doc.getElementById(ref));
  }
  // wrapping <label>
  pushText(el.closest("label"));
  // immediate preceding label/legend sibling
  const prev = el.previousElementSibling;
  if (prev && /^(label|legend)$/i.test(prev.tagName)) pushText(prev);

  return Array.from(labels).slice(0, MAX_NEARBY_LABELS);
}

/**
 * Capture the full multi-signal fingerprint of an element. Every tier is
 * populated best-effort; auto-generated ids are dropped from the `id` anchor.
 */
export function captureFingerprint(el: Element): ElementFingerprint {
  const id = el.id && !isGeneratedId(el.id) ? el.id : null;
  return {
    testId: extractTestId(el),
    ariaLabel: el.getAttribute("aria-label"),
    id,
    cssSelector: cssSelectorFor(el),
    xpath: xpathFor(el),
    domPath: domPathFor(el),
    tagName: el.tagName.toLowerCase(),
    textContent: normalizeText(el.textContent),
    attributes: whitelistedAttributes(el),
    nearbyLabels: nearbyLabels(el),
    positionHint: positionHint(el),
    frameworkHint: detectFramework(el.ownerDocument ?? undefined),
    pageUrl: pageUrlOf(el),
  };
}
