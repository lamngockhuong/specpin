import { t } from "../i18n/index.js";
import type { ProjectFlowsScreens } from "../shared/messaging.js";
import type { Graph, GraphEdge, GraphNode } from "./config-to-graph.js";
import { wireFlowControls } from "./graph-edit-flow-controls.js";
import { type EditFormHandle, mountEditForm } from "./graph-edit-form.js";
import {
  createFlowsEditMode,
  createScreensEditMode,
  type FlowsEditHandle,
  type ScreensEditHandle,
} from "./graph-edit-mode.js";
import {
  type NodeFormWiringDeps,
  openCreateEdge,
  openCreateNode,
  updateFormForSelection,
} from "./graph-edit-node-form-wiring.js";
import type { OrphanWarning } from "./graph-edit-orphan-shots.js";
import { toDraftId } from "./graph-edit-selection-translate.js";
import {
  deleteSelected as runDeleteSelected,
  save as runSave,
} from "./graph-edit-toolbar-actions.js";
import { mountEditToolbar } from "./graph-edit-toolbar-dom.js";
import type { Dataset } from "./graph-project-picker.js";

// Track C (C1)'s edit-mode DOM wiring: toolbar (Add node/edge, Delete, Save,
// New/Rename/Delete flow) + click routing + the C2 side form. Split out of
// main.ts (mirrors graph-ghost-review.ts); flow lifecycle lives in
// graph-edit-flow-controls.ts, form-opening in graph-edit-node-form-wiring.ts,
// delete/save in graph-edit-toolbar-actions.ts -- all kept out of this file to
// hold it under the plan's 200-line budget. Flows editing is scoped to ONE
// active flow at a time (`activeFlowId`, re-pointed at whichever flow a
// create/rename/delete last touched) -- a full flow picker is C3's scope.

export interface EditWiringDeps {
  currentProject(): ProjectFlowsScreens | undefined;
  currentDataset(): Dataset;
  /** Screen-delete shot guard (graph-edit-mode.ts); omitted = no shots known. */
  hasShotReference?(screenId: string): boolean;
  /** Fires after a draft mutation or a successful Save (which re-fetches
   *  flows/screens -- `refreshedProjects` carries that when present). */
  onChanged(refreshedProjects: ProjectFlowsScreens[] | null): void;
  /** Apply the current selection as SVG styling (GraphSvgView.setSelected). */
  applySelection(nodeIds: ReadonlySet<string>, edgeIds: ReadonlySet<string>): void;
  /** The panel's current content locale (LocalizedString field seeding). */
  locale(): string;
  /** C3: a screens Save would orphan a shot (or, `{}`, the inventory couldn't
   *  be verified) -- confirm before persisting. Omitted = always proceed. */
  confirmOrphanShots?(warning: OrphanWarning): boolean | Promise<boolean>;
}

export interface EditWiringHandle {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  getGraph(locale: string, defaultLocale?: string): Graph;
  /** Selection only (arm a node for Add edge/Delete, or pick an edge to
   *  delete); applies deps.applySelection itself, no re-render. Returns
   *  false (unhandled) when edit mode is off. */
  handleNodeClick(node: GraphNode): boolean;
  handleEdgeClick(edge: GraphEdge): boolean;
  /** Clear the selection + hide the field form (a background click). */
  clearSelection(): void;
  /** C3: true when the active draft has an unsaved mutation. */
  isDirty(): boolean;
  /** C3: run Save (orphan-shot confirm, then persist) -- exposed so main.ts's
   *  leave-guard can offer "save, then leave". Resolves whether it saved. */
  save(): Promise<boolean>;
  /** C3: revert the single last successful mutation (re-renders on success). */
  undoLast(): void;
}

// Debounce the re-render a LIVE field edit triggers: mutating the draft
// (mode.updateNode/updateEdge) is cheap, but deps.onChanged(null) rebuilds the
// whole SVG (main.ts's renderCanvas), which would be jarring on every
// keystroke. Validation/error display still runs per-keystroke; only the
// visual rebuild waits for a short pause.
const RERENDER_DEBOUNCE_MS = 300;

/** `formContainer`: the persistent side-panel host for the C2 field-edit /
 *  create-flow forms (main.ts's `#edit-form`, styled as a right-side panel
 *  like `#ghost-panel` is a fixed corner box) -- separate from `container`
 *  (the toolbar row) since the two are laid out very differently. */
export function wireEditMode(
  container: HTMLElement,
  formContainer: HTMLElement,
  deps: EditWiringDeps,
): EditWiringHandle {
  let enabled = false;
  let kind: Dataset | null = null;
  let connectionId: string | null = null;
  let activeFlowId: string | null = null;
  let mode: ScreensEditHandle | FlowsEditHandle | null = null;
  let selectedNodeIds: string[] = [];
  let selectedEdgeId: string | null = null;
  let rerenderTimer: ReturnType<typeof setTimeout> | undefined;

  const { toolbar, setStatus } = mountEditToolbar(container, {
    addNode,
    addEdge,
    deleteSelected,
    undoLast,
    save: () => void save(),
  });

  formContainer.hidden = true;
  const form: EditFormHandle = mountEditForm(formContainer, {
    knownSpecs: () => deps.currentProject()?.specs ?? [],
    locale: deps.locale,
  });

  const flowControls = wireFlowControls(toolbar, formContainer, {
    connectionId: () => connectionId,
    activeFlow: () => deps.currentProject()?.flows.flows.find((f) => f.id === activeFlowId) ?? null,
    locale: deps.locale,
    onFlowsChanged: (refreshedProjects, flowId) => {
      rebindFlowsMode(refreshedProjects, flowId);
      flowControls.setVisible(kind === "flows");
      deps.onChanged(refreshedProjects);
    },
  });

  function reset(): void {
    selectedNodeIds = [];
    selectedEdgeId = null;
    setStatus("");
    form.hide();
  }

  /** Re-point `mode`/`activeFlowId` at a flow in `projects` (this
   *  connection's project): `flowId` when it still exists there, else the
   *  project's first remaining flow, else null (no flow at all). Shared by
   *  setEnabled's initial bind and every flow-controls outcome. */
  function rebindFlowsMode(projects: ProjectFlowsScreens[] | null, flowId: string | null): void {
    const project = projects?.find((p) => p.connectionId === connectionId);
    if (!project) {
      activeFlowId = null;
      mode = null;
      return;
    }
    const resolvedId =
      flowId && project.flows.flows.some((f) => f.id === flowId)
        ? flowId
        : (project.flows.flows[0]?.id ?? null);
    activeFlowId = resolvedId;
    mode = resolvedId ? createFlowsEditMode(project.flows, resolvedId) : null;
  }

  function setEnabled(next: boolean): void {
    enabled = next;
    toolbar.hidden = !next;
    reset();
    if (!next) {
      mode = null;
      kind = null;
      connectionId = null;
      activeFlowId = null;
      flowControls.setVisible(false);
      return;
    }
    const project = deps.currentProject();
    if (!project) {
      disable(t("graph.edit.noProject"));
      return;
    }
    connectionId = project.connectionId;
    kind = deps.currentDataset();
    flowControls.setVisible(kind === "flows");
    if (kind === "screens") {
      mode = createScreensEditMode(project.screens, { hasShotReference: deps.hasShotReference });
      return;
    }
    rebindFlowsMode([project], project.flows.flows[0]?.id ?? null);
    if (!mode) setStatus(t("graph.edit.noFlow"));
  }

  function disable(message: string): void {
    enabled = false;
    toolbar.hidden = true;
    mode = null;
    flowControls.setVisible(false);
    setStatus(message);
  }

  function getGraph(locale: string, defaultLocale?: string): Graph {
    return mode ? mode.getGraph(locale, defaultLocale) : { nodes: [], edges: [] };
  }

  function applySelection(): void {
    deps.applySelection(new Set(selectedNodeIds), new Set(selectedEdgeId ? [selectedEdgeId] : []));
  }

  /** `selectedNodeIds`/`selectedEdgeId` hold the ids as rendered in the Graph
   *  (display ids -- see graph-edit-selection-translate.ts), since that's
   *  what `applySelection` needs to style the right SVG elements. Every OTHER
   *  consumer (the field form, delete, add edge) mutates the raw draft
   *  instead, so `rawSelection` is the one point ids cross from "display" to
   *  "draft" space. */
  function rawSelection(): { nodeIds: string[]; edgeId: string | null } {
    const toRaw = (id: string) => toDraftId(kind, activeFlowId, id);
    return {
      nodeIds: selectedNodeIds.map(toRaw).filter((id): id is string => id !== null),
      edgeId: selectedEdgeId === null ? null : toRaw(selectedEdgeId),
    };
  }

  /** A live field edit's debounced visual re-render, then re-apply the
   *  selection styling onto the freshly rebuilt SVG (main.ts's renderCanvas
   *  swaps in a brand-new <svg>, which starts with no `.selected` classes). */
  function scheduleRerender(): void {
    if (rerenderTimer) clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(() => {
      rerenderTimer = undefined;
      deps.onChanged(null);
      applySelection();
    }, RERENDER_DEBOUNCE_MS);
  }

  function nodeFormDeps(): NodeFormWiringDeps {
    return {
      getMode: () => mode,
      getKind: () => kind,
      form,
      onLiveApplied: scheduleRerender,
      onCreated: () => {
        reset();
        deps.onChanged(null);
      },
    };
  }

  function handleNodeClick(node: GraphNode): boolean {
    if (!enabled || !mode) return false;
    // A different flow's node rendered read-only alongside the active one --
    // consume the click (edit mode is on) but don't select/mutate it.
    if (toDraftId(kind, activeFlowId, node.id) === null) return true;
    selectedEdgeId = null;
    selectedNodeIds = selectedNodeIds.includes(node.id)
      ? selectedNodeIds.filter((id) => id !== node.id)
      : [...selectedNodeIds, node.id].slice(-2);
    setStatus(
      selectedNodeIds.length === 2
        ? t("graph.edit.readyForEdge")
        : t("graph.edit.selectedNode", { label: node.label }),
    );
    applySelection();
    const raw = rawSelection();
    updateFormForSelection(nodeFormDeps(), raw.nodeIds, raw.edgeId);
    return true;
  }

  function handleEdgeClick(edge: GraphEdge): boolean {
    if (!enabled || !mode) return false;
    if (toDraftId(kind, activeFlowId, edge.id) === null) return true;
    selectedNodeIds = [];
    selectedEdgeId = edge.id;
    setStatus(t("graph.edit.selectedEdge", { label: edge.label }));
    applySelection();
    const raw = rawSelection();
    updateFormForSelection(nodeFormDeps(), raw.nodeIds, raw.edgeId);
    return true;
  }

  function addNode(): void {
    openCreateNode(nodeFormDeps());
  }

  function addEdge(): void {
    if (!mode || selectedNodeIds.length !== 2) {
      setStatus(t("graph.edit.readyForEdge"));
      return;
    }
    const raw = rawSelection();
    openCreateEdge(nodeFormDeps(), raw.nodeIds[0], raw.nodeIds[1]);
  }

  function toolbarActionDeps() {
    return {
      getMode: () => mode,
      getConnectionId: () => connectionId,
      getKind: () => kind,
      getSelection: () => rawSelection(),
      setStatus,
      reset,
      onChanged: deps.onChanged,
      t,
      currentProject: deps.currentProject,
      confirmOrphanShots: deps.confirmOrphanShots,
    };
  }

  function deleteSelected(): void {
    runDeleteSelected(toolbarActionDeps());
  }

  function save(): Promise<boolean> {
    return runSave(toolbarActionDeps());
  }

  function undoLast(): void {
    if (!mode) return;
    const result = mode.undoLast();
    if (!result.ok) {
      setStatus(t("graph.edit.undoNone"));
      return;
    }
    reset();
    setStatus(t("graph.edit.undone"));
    deps.onChanged(null);
  }

  return {
    isEnabled: () => enabled,
    setEnabled,
    getGraph,
    handleNodeClick,
    handleEdgeClick,
    clearSelection: reset,
    isDirty: () => mode?.isDirty() ?? false,
    save,
    undoLast,
  };
}
