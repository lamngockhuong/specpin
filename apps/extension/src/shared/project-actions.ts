import { mountAddProject } from "./add-project.js";
import { downloadExportBundles } from "./export-download.js";
import { type ExportBundle, sendToBackground } from "./messaging.js";
import { byId } from "./surface-renderers.js";

// Shared wiring for the popup + side panel header project controls (the "+ New
// project" inline form and the "Export" button), mirroring how both surfaces
// already share rendering through surface-renderers. Kept here so the two
// entrypoints stay byte-identical instead of drifting copy-paste.

export interface ProjectActions {
  /** Sync control visibility with the latest surface state (call from refresh()):
   *  both are hidden when Specpin is off, and Export only shows when a local
   *  project exists. Also collapses the add-project panel when disabled. */
  update(enabled: boolean, hasLocalBatches: boolean): void;
}

/** Wire the header **+ New project** and **Export** buttons (and mount the inline
 *  add-project panel) once. `getOrigin` returns the active page origin at click
 *  time; `onChanged` refreshes the project list after a successful create. */
export function wireProjectActions(
  getOrigin: () => string,
  onChanged: () => void | Promise<void>,
): ProjectActions {
  const addProject = mountAddProject(byId("add-project"), onChanged);
  byId("new-project").addEventListener("click", () => addProject.toggle());
  byId("export").addEventListener("click", async () => {
    const bundles = await sendToBackground<ExportBundle[]>({
      type: "GET_EXPORT_BUNDLES",
      origin: getOrigin(),
    });
    downloadExportBundles(bundles);
  });
  return {
    update(enabled, hasLocalBatches) {
      byId("new-project").hidden = !enabled;
      byId("export").hidden = !enabled || !hasLocalBatches;
      if (!enabled) addProject.hide();
    },
  };
}
