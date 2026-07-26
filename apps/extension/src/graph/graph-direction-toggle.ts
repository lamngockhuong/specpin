import { t } from "../i18n/index.js";
import { createIconButton } from "../shared/icons.js";
import type { GraphDirection } from "./graph-layout.js";

// Layout-direction toggle (Horizontal/Vertical) for the on-canvas graph
// toolbar. Icon-only (right-arrow = LR, down-arrow = TB) with the localized
// label kept as the tooltip + accessible name; purely presentational -- it owns
// the active-button styling and calls `onChange`, leaving the caller (main.ts)
// to re-run the layout.

export interface DirectionToggleHandle {
  /** The toggle row, for the caller to place in the graph toolbar. */
  element: HTMLElement;
}

export function mountDirectionToggle(
  onChange: (direction: GraphDirection) => void,
  initial: GraphDirection = "LR",
): DirectionToggleHandle {
  let current = initial;
  const row = document.createElement("div");
  row.className = "graph-toolbar-group";

  function make(
    dir: GraphDirection,
    icon: "arrowRight" | "arrowDown",
    label: string,
  ): HTMLButtonElement {
    return createIconButton(document, "icon-btn", icon, label, () => {
      if (current === dir) return;
      current = dir;
      paint();
      onChange(current);
    });
  }

  const lrBtn = make("LR", "arrowRight", t("graph.directionLR"));
  const tbBtn = make("TB", "arrowDown", t("graph.directionTB"));

  function paint(): void {
    lrBtn.classList.toggle("active", current === "LR");
    tbBtn.classList.toggle("active", current === "TB");
  }
  paint();

  row.append(lrBtn, tbBtn);
  return { element: row };
}
