import { t } from "../i18n/index.js";
import { mountAddProject } from "./add-project.js";
import { downloadExportBundles } from "./export-download.js";
import { type ExportBundle, sendToBackground } from "./messaging.js";
import { byId } from "./surface-renderers.js";

// Shared wiring for the popup + side panel header project controls (the "+ New
// project" inline form and the "Export" button), mirroring how both surfaces
// already share rendering through surface-renderers. Kept here so the two
// entrypoints stay byte-identical instead of drifting copy-paste.

/** One project serving the current page, offered as an export target. `id` is the
 *  connection id GET_EXPORT_BUNDLES expects (a `manual:<batchId>` local batch or a
 *  bare sidecar uuid); `project` is the display name. */
export interface ExportTarget {
  id: string;
  project: string;
}

export interface ProjectActions {
  /** Sync control visibility with the latest surface state (call from refresh()):
   *  both are hidden when Specpin is off, and Export only shows when at least one
   *  project serves THIS page. `targets` are those projects (one export each). Also
   *  collapses the add-project panel + export menu when disabled. */
  update(enabled: boolean, targets: ExportTarget[]): void;
  /** Open (or close) the inline add-project form. The header "+ New project" button
   *  is wired to this too, so the empty state's call-to-action can drive the same
   *  action directly instead of synthesizing a click on that button. */
  toggleAddProject(): void;
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

/** Wire the header **+ New project** and **Export** buttons (and mount the inline
 *  add-project panel) once. `onChanged` refreshes the project list after a
 *  successful create.
 *
 *  Export scopes to a single local project: it downloads immediately when one
 *  local project serves the page, or opens a small picker when several do, so a
 *  click never dumps every local project at once. The export targets are supplied
 *  by `update()` (scoped to the active page), so no origin getter is needed here.
 *
 *  `surface` ("popup" | "sidepanel") scopes the add-project draft so the two
 *  surfaces keep independent in-progress forms. */
export function wireProjectActions(
  onChanged: () => void | Promise<void>,
  surface: string,
): ProjectActions {
  const addProject = mountAddProject(byId("add-project"), onChanged, surface);
  byId("new-project").addEventListener("click", () => addProject.toggle());

  // The projects serving the active page, refreshed by update(). The Export click
  // reads the latest list at click time.
  let targets: ExportTarget[] = [];

  // Lazily-built picker (only when >1 project serves the page). Appended to <body>
  // and positioned against the Export button, so it is layout-agnostic.
  let menu: HTMLElement | null = null;
  let dismiss: (() => void) | null = null;

  function closeMenu(): void {
    if (menu) menu.hidden = true;
    if (dismiss) {
      dismiss();
      dismiss = null;
    }
  }

  function openMenu(): void {
    // Clear any prior dismiss binding first so re-opening (or rebuilding from
    // update() while already open) never double-registers the document listeners.
    if (dismiss) {
      dismiss();
      dismiss = null;
    }
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "export-menu";
      menu.setAttribute("role", "menu");
      document.body.appendChild(menu);
    }
    // Rebuild from the current targets. Project names go through textContent (never
    // innerHTML), so a name can never be an HTML-injection sink.
    menu.replaceChildren();
    const title = document.createElement("div");
    title.className = "export-menu-title";
    title.textContent = t("popup.exportPickProject");
    menu.appendChild(title);
    for (const target of targets) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "export-menu-item";
      item.setAttribute("role", "menuitem");
      item.textContent = target.project;
      item.title = target.project;
      item.addEventListener("click", () => {
        closeMenu();
        void exportTarget(target.id);
      });
      menu.appendChild(item);
    }

    // Right-align the menu under the Export button (rect is viewport-relative, so
    // position: fixed needs no scroll offset).
    const rect = byId("export").getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = "auto";
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.hidden = false;

    // Dismiss on outside click, Escape, or scroll. Attached on the next tick so the
    // click that opened the menu does not immediately close it.
    const onClick = (e: MouseEvent): void => {
      if (menu && !menu.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") closeMenu();
    };
    const onScroll = (): void => closeMenu();
    setTimeout(() => {
      document.addEventListener("click", onClick, true);
      document.addEventListener("keydown", onKey, true);
      window.addEventListener("scroll", onScroll, true);
    }, 0);
    dismiss = () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }

  byId("export").addEventListener("click", () => {
    if (targets.length === 1) {
      void exportTarget(targets[0].id);
    } else if (targets.length > 1) {
      openMenu();
    }
    // 0 targets: the button is hidden by update(), so there is nothing to export.
  });

  return {
    toggleAddProject() {
      addProject.toggle();
    },
    update(enabled, next) {
      targets = next;
      byId("new-project").hidden = !enabled;
      byId("export").hidden = !enabled || next.length === 0;
      if (!enabled) addProject.hide();
      // Keep an open picker consistent with the fresh target list after a refresh:
      // close it when it no longer applies (disabled, or fewer than 2 projects so
      // a picker is pointless), otherwise rebuild it against the new targets so a
      // click never acts on a stale/removed project.
      if (menu && !menu.hidden) {
        if (!enabled || next.length < 2) closeMenu();
        else openMenu();
      }
    },
  };
}
