import { cssEscapeIdent } from "./css-escape.js";
import { isGeneratedClass, isGeneratedId } from "./generated-id.js";

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

/** Stable (non-generated) class names on an element, original order preserved. */
function stableClasses(el: Element): string[] {
  return Array.from(el.classList).filter((c) => !isGeneratedClass(c));
}

/** Compound selector for a single element: tag + stable classes (no position). */
function compound(el: Element): string {
  let part = el.tagName.toLowerCase();
  for (const cls of stableClasses(el)) part += `.${cssEscapeIdent(cls)}`;
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
