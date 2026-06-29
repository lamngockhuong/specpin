import { t } from "../i18n/index.js";
import { type Message, sendToActiveTab } from "./messaging.js";
import { showSurfaceToast } from "./surface-toast.js";

// Active-tab actions (highlight/edit/capture) are delivered to the page's content
// script. Pages with none (the extension's own pages, chrome://, the store) drop
// the send; surface that as a toast instead of failing silently. `onDelivered`
// runs only when the page received it: the popup uses it to close itself, the
// side panel passes nothing and stays docked.
export async function actOnActiveTab(message: Message, onDelivered?: () => void): Promise<void> {
  if (await sendToActiveTab(message)) onDelivered?.();
  else showSurfaceToast(t("common.cannotActOnPage"));
}
