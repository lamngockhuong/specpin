// Pure helpers for the right-click context-menu actions. Kept out of the content
// entrypoint so they are unit-testable without a content-script runtime.

// True when the element belongs to Specpin's own UI. Every Specpin surface mounts
// in a shadow host whose id is `specpin-*`, and an open-shadow `contextmenu` event
// retargets to that host at the document level, so a single ancestor check covers
// the tooltip, sidebar, modal, capture form, highlight box, and relaunch pill.
export function isSpecpinOwned(el: Element): boolean {
  return !!el.closest('[id^="specpin-"]');
}

// Walk up from `start` to the nearest ancestor (inclusive) that a spec matched,
// per the live render session's `matches` (specId -> element). Returns that spec's
// id and element, or null when neither the element nor any ancestor was matched.
export function findMatchedSpec(
  start: Element | null,
  matches: Map<string, Element>,
): { specId: string; el: Element } | null {
  const byElement = new Map<Element, string>();
  for (const [specId, el] of matches) byElement.set(el, specId);
  for (let el = start; el; el = el.parentElement) {
    const specId = byElement.get(el);
    if (specId) return { specId, el };
  }
  return null;
}
