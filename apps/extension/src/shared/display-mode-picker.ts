import type { DisplayMode } from "@specpin/spec-schema";
import { getDisplayMode, setDisplayMode } from "./config.js";
import { sendToActiveTab } from "./messaging.js";

/** Wire the display-mode <select> shared by the popup and the side panel: reflect
 *  the persisted choice once, then on change persist it and forward it to the
 *  active tab's content script. The select options are static HTML, so there is
 *  nothing to re-render per refresh - only the value to restore once and the
 *  change to handle - which is why this lives here, not in the render path. */
export async function wireDisplayModePicker(select: HTMLSelectElement): Promise<void> {
  select.value = (await getDisplayMode()) ?? ""; // empty = per-spec mode
  select.addEventListener("change", async () => {
    const mode = (select.value || null) as DisplayMode | null;
    await setDisplayMode(mode); // persist so the choice survives close + reload
    await sendToActiveTab({ type: "SET_DISPLAY_MODE", mode });
  });
}
