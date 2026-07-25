import { t } from "../i18n/index.js";
import { mountAddProject } from "./add-project.js";
import { downloadExportBundles } from "./export-download.js";
import { type ExportBundle, sendToBackground } from "./messaging.js";
import type { OverflowMenuItem } from "./overflow-menu.js";
import { byId } from "./surface-renderers.js";

// Shared wiring for the popup + side panel header project controls ("New project"
// + "Export"), mirroring how both surfaces already share rendering through
// surface-renderers. Kept here so the two entrypoints stay byte-identical instead
// of drifting copy-paste.
//
// Both controls live in the header's "..." (More actions) overflow menu rather
// than as their own header icons, so this module no longer owns any header
// buttons: it exposes menuItems() (built from the latest surface state) and the
// entrypoint splices them into that menu. The add-project form stays an inline
// panel mounted at #add-project.

/** One project serving the current page, offered as an export target. `id` is the
 *  connection id GET_EXPORT_BUNDLES expects (a `manual:<batchId>` local batch or a
 *  bare sidecar uuid); `project` is the display name. */
export interface ExportTarget {
  id: string;
  project: string;
}

export interface ProjectActions {
  /** Sync the latest surface state (call from refresh()): `enabled` gates both
   *  actions, and `targets` are the local projects serving THIS page (one export
   *  each). Also collapses the add-project panel when disabled. */
  update(enabled: boolean, targets: ExportTarget[]): void;
  /** Open (or close) the inline add-project form. The empty state's call-to-action
   *  drives this directly, as does the "New project" overflow-menu item. */
  toggleAddProject(): void;
  /** The header "..." overflow-menu items for the project actions: "New project"
   *  then Export - a single "Export" when one local project serves the page, or
   *  one labelled item per project when several do (so a click never dumps every
   *  project at once). Built from the latest update() state; empty when Specpin is
   *  off. Spliced into the menu by the entrypoint at open time. */
  menuItems(): OverflowMenuItem[];
}

/** Export exactly one project's specs (by connection id), then zip + download.
 *  Tolerates a missing target (deleted between render and click): the background
 *  returns [] and downloadExportBundles is a no-op. A messaging failure (worker
 *  restarting) is logged rather than surfaced, matching these surfaces' other
 *  fire-and-forget actions (no toast channel here). */
async function exportTarget(id: string): Promise<void> {
  try {
    const bundles = await sendToBackground<ExportBundle[]>({ type: "GET_EXPORT_BUNDLES", id });
    downloadExportBundles(bundles);
  } catch (e) {
    console.error("Specpin: export failed", e);
  }
}

/** Mount the inline add-project panel and expose the project actions as
 *  overflow-menu items. `onChanged` refreshes the project list after a successful
 *  create. `surface` ("popup" | "sidepanel") scopes the add-project draft so the
 *  two surfaces keep independent in-progress forms. */
export function wireProjectActions(
  onChanged: () => void | Promise<void>,
  surface: string,
): ProjectActions {
  const addProject = mountAddProject(byId("add-project"), onChanged, surface);

  // Latest surface state, refreshed by update(); menuItems() reads it when the
  // overflow menu opens, so a rebuilt menu always reflects the current page.
  let enabled = false;
  let targets: ExportTarget[] = [];

  return {
    toggleAddProject() {
      addProject.toggle();
    },
    update(nextEnabled, nextTargets) {
      enabled = nextEnabled;
      targets = nextTargets;
      // Collapse the inline add-project form when Specpin is off (it can no longer
      // act on the page), matching the pre-menu button behaviour.
      if (!enabled) addProject.hide();
    },
    menuItems() {
      if (!enabled) return [];
      const items: OverflowMenuItem[] = [
        { label: t("popup.newProject"), onSelect: () => addProject.toggle() },
      ];
      // One project -> a plain "Export"; several -> one labelled item each. Project
      // names go through OverflowMenuItem.label (rendered via textContent), so a
      // name can never be an HTML-injection sink. Zero targets adds nothing.
      if (targets.length === 1) {
        items.push({
          label: t("popup.exportLocal"),
          onSelect: () => void exportTarget(targets[0].id),
        });
      } else {
        for (const target of targets) {
          items.push({
            label: `${t("popup.exportLocal")}: ${target.project}`,
            title: target.project,
            onSelect: () => void exportTarget(target.id),
          });
        }
      }
      return items;
    },
  };
}
