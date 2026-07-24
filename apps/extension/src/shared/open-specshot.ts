import { browser } from "#imports";

// Shared "Open spec sheet" launcher, wired from both the popup and the side
// panel header. Opens the specshot authoring page (an extension entrypoint,
// chrome-extension://<id>/specshot.html) in a new tab. Unlike the graph view,
// this page is standalone and not tied to a specific origin, so it carries no
// `originTab` — the sidecar connection it persists to is chosen inside the page.
export async function openSpecshot(): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL("/specshot.html") });
}
