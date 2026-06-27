// Narrow typings for the Chrome-only MV3 APIs Specpin uses for the side panel.
// webextension-polyfill's `browser` does not model `chrome.sidePanel`, and these
// are absent on Firefox (which uses sidebar_action with its own toggle), so we
// feature-detect this shim rather than depend on the full @types/chrome.
export interface ChromeLike {
  sidePanel?: {
    open(options: { tabId?: number; windowId?: number }): Promise<void>;
    setPanelBehavior(behavior: { openPanelOnActionClick: boolean }): Promise<void>;
  };
  action?: {
    setPopup(details: { popup: string }): Promise<void>;
  };
  runtime: {
    getManifest(): { action?: { default_popup?: string } };
  };
}

/** The `chrome` global when present (Chromium MV3), else undefined (Firefox). */
export function chromeApi(): ChromeLike | undefined {
  return (globalThis as { chrome?: ChromeLike }).chrome;
}
