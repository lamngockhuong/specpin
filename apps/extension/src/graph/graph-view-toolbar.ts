import { t } from "../i18n/index.js";
import { createIconButton } from "../shared/icons.js";
import { mountDirectionToggle } from "./graph-direction-toggle.js";
import type { GraphDirection } from "./graph-layout.js";

// The floating toolbar that sits ON the graph canvas (a corner overlay, like
// #hint / #ghost-panel), holding the controls that act on the diagram itself:
// the layout-direction toggle (Horizontal/Vertical) and zoom (in / out / fit).
// Data/mode controls (Graph<->Table, Edit, filters, search) stay in the top
// control bar -- those aren't "on the graph". Mounted once and kept across
// re-renders; the caller shows/hides it with the canvas and routes the zoom
// callbacks to whichever PanZoomController is current.

export interface GraphViewToolbarDeps {
  onDirectionChange(direction: GraphDirection): void;
  initialDirection: GraphDirection;
  onZoomIn(): void;
  onZoomOut(): void;
  onZoomFit(): void;
}

export function mountGraphViewToolbar(container: HTMLElement, deps: GraphViewToolbarDeps): void {
  const direction = mountDirectionToggle(deps.onDirectionChange, deps.initialDirection);

  const zoom = document.createElement("div");
  zoom.className = "graph-toolbar-group";
  zoom.append(
    createIconButton(document, "icon-btn", "plus", t("graph.zoomIn"), deps.onZoomIn),
    createIconButton(document, "icon-btn", "minus", t("graph.zoomOut"), deps.onZoomOut),
    createIconButton(document, "icon-btn", "fit", t("graph.zoomFit"), deps.onZoomFit),
  );

  container.append(direction.element, zoom);
}
