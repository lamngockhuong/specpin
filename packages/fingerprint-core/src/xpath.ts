import { isGeneratedId } from "./generated-id.js";

/**
 * Build an absolute-ish XPath for an element, used as a capture-time fallback
 * signal (the MVP matcher does not evaluate it). A non-generated id yields a
 * short `//*[@id=...]`; otherwise a positional tag path.
 */
export function xpathFor(el: Element): string {
  if (el.id && !isGeneratedId(el.id)) {
    return `//*[@id='${el.id}']`;
  }

  const segments: string[] = [];
  let current: Element | null = el;

  while (current && current.nodeType === 1) {
    const node: Element = current;
    const tag = node.tagName.toLowerCase();
    const parent = node.parentElement;
    if (!parent) {
      segments.unshift(`/${tag}`);
      break;
    }
    const sameTag = Array.from<Element>(parent.children).filter((c) => c.tagName === node.tagName);
    const segment = sameTag.length > 1 ? `/${tag}[${sameTag.indexOf(node) + 1}]` : `/${tag}`;
    segments.unshift(segment);
    current = parent;
  }

  return segments.join("");
}
