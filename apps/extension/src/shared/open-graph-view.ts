import { browser } from "#imports";

// Shared "Open graph view" launcher, wired from both the popup and the side
// panel header. Opens the graph entrypoint (Phase 5) in a new tab, carrying the
// CURRENT active tab's id as `?originTab=` so the graph page can later send a
// HIGHLIGHT_SPEC_ON_TAB message back to the exact tab it was launched from --
// once the graph tab has focus, `tabs.query({active:true})` would resolve to
// the graph tab itself, not the original page.
export async function openGraphView(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const url = browser.runtime.getURL("/graph.html");
  const withOrigin = tab?.id !== undefined ? `${url}?originTab=${tab.id}` : url;
  await browser.tabs.create({ url: withOrigin });
}
