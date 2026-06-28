import { browser } from "#imports";
import { t } from "../i18n/index.js";
import type { Message } from "../shared/messaging.js";

// The page right-click "Specpin" submenu, owned by the background service worker.
// contextMenus.onClicked fires here and does NOT carry the clicked DOM element, so
// element-targeted items only dispatch a message to the active tab; the content
// script resolves the element it recorded on the last `contextmenu` event.

const PARENT_ID = "specpin";
const PIN_ID = "specpin-pin";
const SHOW_ID = "specpin-show";
const SEPARATOR_ID = "specpin-separator";
const CAPTURE_ID = "specpin-capture";
const TOGGLE_OFF_ID = "specpin-toggle-off";

// The onClicked listener is registered once per service-worker lifetime. The SW
// re-runs setup on every wake (onStartup/onInstalled/eval); without this guard
// each wake would stack another listener and fire the action N times.
let listenerAdded = false;

export interface ContextMenuHandlers {
  /** Current global on/off state, read at build time to set initial visibility. */
  isEnabled: () => Promise<boolean>;
  /** "Turn off Specpin" action. Routed to the same path as SET_ENABLED:false so
   *  the registry watch lifecycle stays correct (no self-message round-trip). */
  onToggleOff: () => void;
}

// Serialize builds so overlapping callers never interleave. initWorker runs at
// module eval and again on onStartup/onInstalled within one SW evaluation; without
// this, a second build's removeAll() could wipe a first build's items mid-flight,
// or a create() could throw "duplicate id". Mirrors background.ts's mutate() chain.
let buildChain: Promise<void> = Promise.resolve();

// Build (or rebuild) the whole submenu. Idempotent: removeAll() first so a wake
// that re-runs setup never throws "duplicate id". Titles come from the active
// i18n catalog, so a rebuild also re-localizes (used by retitleContextMenu).
function buildMenu(enabled: boolean): Promise<void> {
  buildChain = buildChain.then(
    () => runBuild(enabled),
    () => runBuild(enabled),
  );
  return buildChain;
}

async function runBuild(enabled: boolean): Promise<void> {
  const menus = browser.contextMenus;
  if (!menus) return;
  await menus.removeAll();
  // Hiding the parent hides the entire subtree, so visibility is gated once here.
  menus.create({
    id: PARENT_ID,
    title: t("contextMenu.parent"),
    contexts: ["all"],
    visible: enabled,
  });
  menus.create({
    id: PIN_ID,
    parentId: PARENT_ID,
    title: t("contextMenu.pin"),
    contexts: ["all"],
  });
  menus.create({
    id: SHOW_ID,
    parentId: PARENT_ID,
    title: t("contextMenu.show"),
    contexts: ["all"],
  });
  menus.create({ id: SEPARATOR_ID, parentId: PARENT_ID, type: "separator", contexts: ["all"] });
  menus.create({
    id: CAPTURE_ID,
    parentId: PARENT_ID,
    title: t("contextMenu.capture"),
    contexts: ["all"],
  });
  menus.create({
    id: TOGGLE_OFF_ID,
    parentId: PARENT_ID,
    title: t("contextMenu.toggleOff"),
    contexts: ["all"],
  });
}

function sendToTab(tabId: number | undefined, message: Message): void {
  // Tabs without a content script (chrome://, the store) reject; swallow it.
  if (tabId === undefined) return;
  browser.tabs.sendMessage(tabId, message).catch(() => {});
}

/** Create the submenu and register the click router. Safe to call on every SW
 *  wake: the menu is rebuilt idempotently and the listener is added only once. */
export async function setupContextMenu(handlers: ContextMenuHandlers): Promise<void> {
  const menus = browser.contextMenus;
  if (!menus) return;
  await buildMenu(await handlers.isEnabled());
  if (listenerAdded) return;
  listenerAdded = true;
  menus.onClicked.addListener((info, tab) => {
    switch (info.menuItemId) {
      case PIN_ID:
        sendToTab(tab?.id, { type: "PIN_ELEMENT" });
        break;
      case SHOW_ID:
        sendToTab(tab?.id, { type: "SHOW_SPEC_HERE" });
        break;
      case CAPTURE_ID:
        sendToTab(tab?.id, { type: "START_CAPTURE" });
        break;
      case TOGGLE_OFF_ID:
        handlers.onToggleOff();
        break;
    }
  });
}

/** Show/hide the submenu when the global on/off state changes. Falls back to a
 *  full rebuild if the menu does not exist yet (SW woke without setup). */
export async function updateContextMenuVisibility(enabled: boolean): Promise<void> {
  const menus = browser.contextMenus;
  if (!menus) return;
  try {
    await menus.update(PARENT_ID, { visible: enabled });
  } catch {
    await buildMenu(enabled);
  }
}

/** Re-localize the menu titles after a UI-language change. Rebuilds with the
 *  active catalog, preserving the current visibility. */
export async function retitleContextMenu(enabled: boolean): Promise<void> {
  await buildMenu(enabled);
}
