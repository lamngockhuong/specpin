import { t } from "../i18n/index.js";
import { sendToTab } from "../shared/messaging.js";

// The "highlight the pinned element on its origin tab" concern (a specId
// click on either a node or an edge), split out of main.ts to keep the
// entrypoint within the plan's 200-line-per-file budget (mirrors
// graph-project-picker.ts's split for the same reason) -- this module has no
// overlap with the ghost-review concern it was split alongside.

/** Parses the "originTab" query param into a tab id, or null if absent/
 *  invalid. A plain `Number(...) || null` would misread tab id 0 as null;
 *  Number.isNaN keeps a valid 0 intact (tab ids start at 1 in practice, but
 *  this stays precise). */
export function parseOriginTabId(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

export interface HighlightController {
  /** Ask the origin tab (the page the graph was opened from -- NOT the graph
   *  tab's own "active tab", which is itself once it has focus) to highlight
   *  `specId`. Shows the "not on this page" hint on failure or when there is
   *  no origin tab / no owning connection to scope the request to. */
  attempt(
    connectionId: string | undefined,
    specId: string,
    urlGlob: string | undefined,
  ): Promise<void>;
}

/** `originTabId`: the tab this graph page was opened FROM (query param set by
 *  the popup/side panel launcher, see shared/open-graph-view.ts). specId
 *  clicks must target this remembered id directly via sendToTab, never
 *  sendToActiveTab. */
export function createHighlightController(
  hintEl: HTMLElement,
  originTabId: number | null,
): HighlightController {
  function showHint(text: string): void {
    hintEl.textContent = text;
    hintEl.classList.add("visible");
  }
  function hideHint(): void {
    hintEl.classList.remove("visible");
  }

  return {
    async attempt(connectionId, specId, urlGlob) {
      if (originTabId === null || !connectionId) {
        showHint(t("graph.notOnPage", { page: urlGlob ?? specId }));
        return;
      }
      const delivered = await sendToTab(originTabId, {
        type: "HIGHLIGHT_SPEC_ON_TAB",
        specId,
        connectionId,
      });
      if (delivered) hideHint();
      else showHint(t("graph.notOnPage", { page: urlGlob ?? specId }));
    },
  };
}
