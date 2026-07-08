import { cssEscapeAttrValue, cssEscapeIdent } from "./css-escape.js";
import { IDENTITY_ATTRS, isGeneratedClass, isGeneratedId, isUtilityClass } from "./generated-id.js";

const MAX_DEPTH = 6;

/** querySelectorAll that never throws on a malformed selector. */
export function safeQueryAll(root: ParentNode, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function isUnique(root: ParentNode, selector: string, target: Element): boolean {
  const hits = safeQueryAll(root, selector);
  return hits.length === 1 && hits[0] === target;
}

/** First stable (non-generated, non-utility) class on an element, or undefined.
 *  The compound uses a single semantic class; utility/hashed classes are
 *  churn-prone and must never become identity. */
function firstStableClass(el: Element): string | undefined {
  for (const c of el.classList) {
    if (!isGeneratedClass(c) && !isUtilityClass(c)) return c;
  }
  return undefined;
}

/**
 * Compound selector for a single element (no position): tag + any stable
 * identity attributes + at most one semantic class. Identity attributes
 * (role/type/name/data-slot/part/scope) are preferred over classes because
 * headless libraries expose them as stable structural hooks; classes are the
 * churn-prone fallback.
 */
function compound(el: Element): string {
  let part = el.tagName.toLowerCase();
  for (const attr of IDENTITY_ATTRS) {
    const v = el.getAttribute(attr);
    if (v != null && v !== "") part += `[${attr}="${cssEscapeAttrValue(v)}"]`;
  }
  const cls = firstStableClass(el);
  if (cls) part += `.${cssEscapeIdent(cls)}`;
  return part;
}

/** Index of `el` among same-tag siblings, 1-based, for :nth-of-type. */
function nthOfType(el: Element): number {
  const parent = el.parentElement;
  if (!parent) return 1;
  const sameTag = Array.from<Element>(parent.children).filter((c) => c.tagName === el.tagName);
  return sameTag.indexOf(el) + 1;
}

/**
 * Build an optimized CSS selector, preferring stable anchors:
 * a non-generated id short-circuits to `#id`; otherwise a `>`-joined path of
 * tag + stable-class compounds, adding `:nth-of-type` only to disambiguate, and
 * returning as soon as the accumulated path is unique in the document.
 */
export function cssSelectorFor(el: Element): string {
  const doc: ParentNode = el.ownerDocument ?? el;

  if (el.id && !isGeneratedId(el.id)) {
    const sel = `#${cssEscapeIdent(el.id)}`;
    if (isUnique(doc, sel, el)) return sel;
  }

  const parts: string[] = [];
  let current: Element | null = el;
  let depth = 0;

  while (current && current.nodeType === 1 && depth < MAX_DEPTH) {
    if (current.id && !isGeneratedId(current.id)) {
      parts.unshift(`#${cssEscapeIdent(current.id)}`);
      break;
    }

    let part = compound(current);
    const parent: HTMLElement | null = current.parentElement;
    if (parent) {
      const twins = Array.from<Element>(parent.children).filter((c) => compound(c) === part);
      if (twins.length > 1) part += `:nth-of-type(${nthOfType(current)})`;
    }
    parts.unshift(part);

    const candidate = parts.join(" > ");
    if (isUnique(doc, candidate, el)) return candidate;

    current = parent;
    depth += 1;
  }

  return parts.join(" > ");
}
