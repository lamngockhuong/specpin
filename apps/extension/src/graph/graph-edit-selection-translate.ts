import { unprefixFlowId } from "./config-to-graph.js";
import type { Dataset } from "./graph-project-picker.js";

// The Graph a `getGraph()` call returns uses DISPLAY ids: flows carry the
// active flow's `${flowId}:` prefix (config-to-graph.ts's flowsToGraph),
// screens don't. graph-edit-wiring.ts's click handlers store those display
// ids for `applySelection` (SVG `.selected` styling needs the rendered id),
// but every OTHER consumer -- the field form, delete, add-edge -- mutates the
// raw ScreensEditHandle/FlowsEditHandle draft, which never heard of the
// prefix. This is the one place that conversion happens, split out as a pure
// function so it's unit-testable without standing up the whole wiring layer.

/** Translate one display id to the raw draft id `mode`'s mutations expect.
 *  Returns null for a flows id that isn't `activeFlowId`'s own -- a different
 *  flow's node/edge rendered read-only alongside the one being edited, which
 *  callers must refuse to select or mutate rather than accidentally target
 *  the wrong flow's draft. */
export function toDraftId(
  kind: Dataset | null,
  activeFlowId: string | null,
  displayId: string,
): string | null {
  if (kind !== "flows") return displayId;
  return activeFlowId ? unprefixFlowId(activeFlowId, displayId) : null;
}
