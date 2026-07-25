import { t } from "../i18n/index.js";
import { openGraphView } from "./open-graph-view.js";
import { openSpecshot } from "./open-specshot.js";
import type { OverflowMenuItem } from "./overflow-menu.js";
import type { ProjectActions } from "./project-actions.js";

// The full ordered item list for the header "..." (More actions) menu, shared by
// the popup and side panel so the two surfaces can never drift (a new launcher
// added here appears on both at once - the same reason projectActions.menuItems()
// is shared). Rebuilt on each open so it reflects the current page state.
//
// Project actions (New project + Export) come first, then the graph-view +
// spec-sheet launchers. Both launchers open a full-page view in a new tab;
// `onLaunched` runs after the tab opens - the popup passes window.close (it has no
// docked state to preserve), the side panel omits it and stays docked.
export function headerMoreMenuItems(
  projectActions: ProjectActions,
  onLaunched?: () => void,
): OverflowMenuItem[] {
  const launch = (open: () => Promise<unknown>) => (): void => {
    const done = open();
    void (onLaunched ? done.then(onLaunched) : done);
  };
  return [
    ...projectActions.menuItems(),
    { label: t("common.openGraphView"), onSelect: launch(openGraphView) },
    { label: t("common.openSpecshot"), onSelect: launch(openSpecshot) },
  ];
}
