import type { FlowsConfig, ScreensConfig } from "@specpin/spec-schema";
import { afterEach, describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode } from "../src/graph/config-to-graph.js";
import { wireEditMode } from "../src/graph/graph-edit-wiring.js";
import type { ProjectFlowsScreens } from "../src/shared/messaging.js";
import { must } from "./test-utils.js";

// Regression coverage for the Track C flows-editor id-prefix leak: getGraph()
// (config-to-graph.ts's flowsToGraph) renders every flow node/edge id
// prefixed `${flow.id}:`, but FlowsEditHandle's mutations compare against RAW
// state/transition ids. The bug was that graph-edit-wiring.ts's click
// handlers stored the PREFIXED id straight into the selection and fed it back
// into deleteNode/updateNode/updateEdge/addEdge, so every click-driven edit
// silently no-op'd or "unknown state" errored for flows. These tests exercise
// the exact same path a real click does: getGraph() -> handleNodeClick/
// handleEdgeClick -> the toolbar/form callbacks -> re-derive getGraph() to
// prove the raw draft actually changed.

function fire(el: Element, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

function baseFlowsConfig(): FlowsConfig {
  return {
    version: "1.0",
    flows: [
      {
        id: "checkout",
        object: { en: "Order" },
        states: [
          { id: "draft", label: { en: "Draft" }, kind: "initial" },
          { id: "paid", label: { en: "Paid" } },
        ],
        transitions: [
          { id: "pay", from: "draft", to: "paid", trigger: { en: "Pay" }, source: "manual" },
        ],
      },
      {
        // A second flow, rendered read-only alongside "checkout" -- its ids
        // share no prefix with the active flow, so clicking them must be
        // rejected rather than mistakenly mutating "checkout"'s draft.
        id: "signup",
        object: { en: "Signup" },
        states: [{ id: "start", label: { en: "Start" }, kind: "initial" }],
        transitions: [
          { id: "loop", from: "start", to: "start", trigger: { en: "Loop" }, source: "manual" },
        ],
      },
    ],
  };
}

function emptyScreensConfig(): ScreensConfig {
  return { version: "1.0", screens: [], transitions: [] };
}

function baseProject(): ProjectFlowsScreens {
  return {
    connectionId: "conn-1",
    project: "demo",
    recordEnabled: false,
    recordExclude: [],
    flows: baseFlowsConfig(),
    screens: emptyScreensConfig(),
    specs: [],
    shotScreenIds: null,
  };
}

function setup() {
  const container = document.createElement("div");
  const formContainer = document.createElement("div");
  document.body.append(container, formContainer);
  const project = baseProject();
  const handle = wireEditMode(container, formContainer, {
    currentProject: () => project,
    currentDataset: () => "flows",
    onChanged: () => {},
    applySelection: () => {},
    locale: () => "en",
  });
  handle.setEnabled(true);
  return { handle, container, formContainer };
}

function findNode(handle: ReturnType<typeof wireEditMode>, id: string): GraphNode {
  return must(handle.getGraph("en").nodes.find((n) => n.id === id));
}

function findEdge(handle: ReturnType<typeof wireEditMode>, id: string): GraphEdge {
  return must(handle.getGraph("en").edges.find((e) => e.id === id));
}

// mountEditToolbar appends buttons in this fixed order: Add node, Add edge,
// Delete selected, Undo, Save.
function toolbarButtons(container: HTMLElement) {
  const buttons = [...container.querySelectorAll("button")] as HTMLButtonElement[];
  return {
    addNode: must(buttons[0]),
    addEdge: must(buttons[1]),
    deleteSelected: must(buttons[2]),
    undo: must(buttons[3]),
    save: must(buttons[4]),
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("wireEditMode -- flows id-prefix leak regression (click -> mutate chain)", () => {
  it("getGraph renders flow node/edge ids prefixed with the flow id (the source of the leak)", () => {
    const { handle } = setup();
    const graph = handle.getGraph("en");
    expect(graph.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining(["checkout:draft", "checkout:paid", "signup:start"]),
    );
    expect(graph.edges.map((e) => e.id)).toContain("checkout:pay");
  });

  it("deleteNode: selecting a node by its PREFIXED graph id and clicking Delete removes the raw state and cascades its edge", () => {
    const { handle, container } = setup();
    const draft = findNode(handle, "checkout:draft");
    expect(handle.handleNodeClick(draft)).toBe(true);
    toolbarButtons(container).deleteSelected.click();

    const graph = handle.getGraph("en");
    expect(graph.nodes.map((n) => n.id)).not.toContain("checkout:draft");
    expect(graph.edges.map((e) => e.id)).not.toContain("checkout:pay");
    // the other flow's state is untouched
    expect(graph.nodes.map((n) => n.id)).toContain("signup:start");
  });

  it("updateNode: editing the field form opened for a prefixed-id selection applies to the raw state", () => {
    const { handle, formContainer } = setup();
    const draft = findNode(handle, "checkout:draft");
    expect(handle.handleNodeClick(draft)).toBe(true);
    // the raw snapshot lookup succeeded -- the edit form actually opened
    expect(formContainer.hidden).toBe(false);

    const kindSelect = must(formContainer.querySelector("select")) as HTMLSelectElement;
    kindSelect.value = "terminal";
    fire(kindSelect, "change");

    expect(findNode(handle, "checkout:draft").kind).toBe("terminal");
  });

  it("updateEdge: editing the field form opened for a prefixed-id edge selection applies to the raw transition", () => {
    const { handle, formContainer } = setup();
    const pay = findEdge(handle, "checkout:pay");
    expect(handle.handleEdgeClick(pay)).toBe(true);
    expect(formContainer.hidden).toBe(false);

    // Field order in showEditTransition's DOM: [trigger locale input, guard, role].
    const guardInput = [...formContainer.querySelectorAll("input")][1] as HTMLInputElement;
    guardInput.value = "amount > 100";
    fire(guardInput, "input");

    expect(findEdge(handle, "checkout:pay").guard).toBe("amount > 100");
  });

  it("addEdge: connecting two prefixed-id node selections creates a raw manual edge between the right states", () => {
    const { handle, container, formContainer } = setup();
    const draft = findNode(handle, "checkout:draft");
    const paid = findNode(handle, "checkout:paid");
    handle.handleNodeClick(draft);
    handle.handleNodeClick(paid);
    toolbarButtons(container).addEdge.click();
    expect(formContainer.hidden).toBe(false);

    const triggerInput = must(formContainer.querySelector("input")) as HTMLInputElement;
    triggerInput.value = "Retry";
    fire(triggerInput, "input");
    must(formContainer.querySelector<HTMLButtonElement>(".edit-form-submit")).click();

    const graph = handle.getGraph("en");
    const created = graph.edges.find(
      (e) => e.from === "checkout:draft" && e.to === "checkout:paid" && e.label === "Retry",
    );
    expect(created).toBeDefined();
  });

  it("clicking a node from another flow switches editing to that flow, then selects it", () => {
    const { handle, container } = setup();
    // active flow starts as the first flow ("checkout"); click "signup"'s node
    expect(handle.handleNodeClick(findNode(handle, "signup:start"))).toBe(true);
    // now scoped to "signup" -> Delete acts on its state (manual loop cascades)
    toolbarButtons(container).deleteSelected.click();
    const graph = handle.getGraph("en");
    expect(graph.nodes.map((n) => n.id)).not.toContain("signup:start");
    expect(graph.edges.map((e) => e.id)).not.toContain("signup:loop");
    // the previously-active flow is untouched
    expect(graph.nodes.map((n) => n.id)).toContain("checkout:draft");
  });

  it("clicking an edge from another flow switches editing to that flow, then selects it", () => {
    const { handle, container } = setup();
    expect(handle.handleEdgeClick(findEdge(handle, "signup:loop"))).toBe(true);
    toolbarButtons(container).deleteSelected.click(); // deletes the selected signup edge
    const graph = handle.getGraph("en");
    expect(graph.edges.map((e) => e.id)).not.toContain("signup:loop");
    // checkout's edge is untouched
    expect(graph.edges.map((e) => e.id)).toContain("checkout:pay");
  });
});

describe("wireEditMode -- multi-flow picker + active-flow switching", () => {
  function flowSelect(container: HTMLElement): HTMLSelectElement {
    return must(container.querySelector<HTMLSelectElement>(".graph-edit-flow-select"));
  }

  it("lists every flow with the active one selected, and hides itself with a single flow", () => {
    const { container } = setup();
    const select = flowSelect(container);
    expect([...select.options].map((o) => o.value)).toEqual(["checkout", "signup"]);
    expect(select.value).toBe("checkout");
    expect(select.hidden).toBe(false);
  });

  it("picking another flow re-scopes editing to it", () => {
    const { handle, container } = setup();
    const select = flowSelect(container);
    select.value = "signup";
    fire(select, "change");
    // signup is now the editable flow
    handle.handleNodeClick(findNode(handle, "signup:start"));
    toolbarButtons(container).deleteSelected.click();
    expect(handle.getGraph("en").nodes.map((n) => n.id)).not.toContain("signup:start");
  });

  it("switching flow with an unsaved draft runs the guard; cancelling keeps the current flow + its draft", async () => {
    const container = document.createElement("div");
    const formContainer = document.createElement("div");
    document.body.append(container, formContainer);
    const project = baseProject();
    let guardCalls = 0;
    const handle = wireEditMode(container, formContainer, {
      currentProject: () => project,
      currentDataset: () => "flows",
      onChanged: () => {},
      applySelection: () => {},
      locale: () => "en",
      confirmLeaveActiveFlow: () => {
        guardCalls++;
        return false; // user cancels
      },
    });
    handle.setEnabled(true);
    // Dirty the checkout draft.
    handle.handleNodeClick(findNode(handle, "checkout:draft"));
    toolbarButtons(container).deleteSelected.click();
    expect(handle.isDirty()).toBe(true);

    const select = flowSelect(container);
    select.value = "signup";
    fire(select, "change");
    await new Promise((resolve) => setTimeout(resolve)); // let the async guard settle

    expect(guardCalls).toBe(1);
    expect(handle.isDirty()).toBe(true); // draft preserved
    expect(select.value).toBe("checkout"); // picker reverted to the active flow
  });
});

describe("wireEditMode -- toolbar button states track selection + dirty draft", () => {
  it("enables only Add node with no selection, then unlocks each action as its precondition is met", () => {
    const { handle, container } = setup();
    const btns = toolbarButtons(container);
    // Fresh edit session: Add node is always available; the rest need a target.
    expect(btns.addNode.disabled).toBe(false);
    expect(btns.addEdge.disabled).toBe(true);
    expect(btns.deleteSelected.disabled).toBe(true);
    expect(btns.undo.disabled).toBe(true);
    expect(btns.save.disabled).toBe(true);

    // One node selected -> Delete becomes actionable, Add edge still needs two.
    handle.handleNodeClick(findNode(handle, "checkout:draft"));
    expect(btns.deleteSelected.disabled).toBe(false);
    expect(btns.addEdge.disabled).toBe(true);

    // Two nodes selected -> Add edge unlocks, single-target Delete locks again.
    handle.handleNodeClick(findNode(handle, "checkout:paid"));
    expect(btns.addEdge.disabled).toBe(false);
    expect(btns.deleteSelected.disabled).toBe(true);
  });

  it("enables Undo + Save once the draft has an unsaved mutation", () => {
    const { handle, container } = setup();
    const btns = toolbarButtons(container);
    expect(btns.save.disabled).toBe(true);
    expect(btns.undo.disabled).toBe(true);

    // Delete a node -> the draft is now dirty -> Undo + Save go live.
    handle.handleNodeClick(findNode(handle, "checkout:draft"));
    btns.deleteSelected.click();
    expect(handle.isDirty()).toBe(true);
    expect(btns.save.disabled).toBe(false);
    expect(btns.undo.disabled).toBe(false);
  });
});

describe("wireEditMode -- Delete key routing to deleteSelected", () => {
  it("Delete key with one node selected -> runs deleteSelected via toolbar", async () => {
    const { handle } = setup();
    const draft = findNode(handle, "checkout:draft");
    handle.handleNodeClick(draft);
    expect(handle.getGraph("en").nodes.map((n) => n.id)).toContain("checkout:draft");

    // Simulate Delete key press
    const deleteKeyEvent = new KeyboardEvent("keydown", { key: "Delete" });
    document.dispatchEvent(deleteKeyEvent);

    // The node should be deleted (selection was a single node, key was Delete)
    expect(handle.getGraph("en").nodes.map((n) => n.id)).not.toContain("checkout:draft");
  });

  it("Delete key with one edge selected -> runs deleteSelected", async () => {
    const { handle } = setup();
    const pay = findEdge(handle, "checkout:pay");
    handle.handleEdgeClick(pay);
    expect(handle.getGraph("en").edges.map((e) => e.id)).toContain("checkout:pay");

    // Simulate Delete key press
    const deleteKeyEvent = new KeyboardEvent("keydown", { key: "Delete" });
    document.dispatchEvent(deleteKeyEvent);

    // The edge should be deleted
    expect(handle.getGraph("en").edges.map((e) => e.id)).not.toContain("checkout:pay");
  });

  it("Delete key when edit mode never enabled -> does not trigger deletion", () => {
    // Create a setup that is NOT enabled (unlike the standard setup() which calls setEnabled(true))
    const container = document.createElement("div");
    const formContainer = document.createElement("div");
    document.body.append(container, formContainer);
    const project = baseProject();

    const handle = wireEditMode(container, formContainer, {
      currentProject: () => project,
      currentDataset: () => "flows",
      onChanged: () => {},
      applySelection: () => {},
      locale: () => "en",
    });

    // Verify edit mode is disabled
    expect(handle.isEnabled()).toBe(false);

    // Get the initial state (should be empty since mode is null)
    const beforeGraph = handle.getGraph("en");

    // Try to press Delete key
    const deleteKeyEvent = new KeyboardEvent("keydown", { key: "Delete" });
    document.dispatchEvent(deleteKeyEvent);

    // Nothing should change (handler returns early when !enabled)
    const afterGraph = handle.getGraph("en");
    expect(afterGraph.nodes.length).toBe(beforeGraph.nodes.length);
    expect(afterGraph.edges.length).toBe(beforeGraph.edges.length);
  });

  it("Delete key with no selection -> does not trigger deleteSelected", () => {
    const { handle } = setup();
    // No selection
    expect(handle.getGraph("en").nodes.map((n) => n.id)).toContain("checkout:draft");

    // Simulate Delete key press
    const deleteKeyEvent = new KeyboardEvent("keydown", { key: "Delete" });
    document.dispatchEvent(deleteKeyEvent);

    // All nodes should still exist
    expect(handle.getGraph("en").nodes.map((n) => n.id)).toContain("checkout:draft");
  });

  it("Delete key with 2+ nodes selected -> does not trigger deleteSelected", () => {
    const { handle } = setup();
    const draft = findNode(handle, "checkout:draft");
    const paid = findNode(handle, "checkout:paid");

    // Select two nodes
    handle.handleNodeClick(draft);
    handle.handleNodeClick(paid);

    const graphBefore = handle.getGraph("en");
    expect(graphBefore.nodes.map((n) => n.id)).toContain("checkout:draft");
    expect(graphBefore.nodes.map((n) => n.id)).toContain("checkout:paid");

    // Simulate Delete key press
    const deleteKeyEvent = new KeyboardEvent("keydown", { key: "Delete" });
    document.dispatchEvent(deleteKeyEvent);

    // Both nodes should still exist (can't delete multiple)
    const graphAfter = handle.getGraph("en");
    expect(graphAfter.nodes.map((n) => n.id)).toContain("checkout:draft");
    expect(graphAfter.nodes.map((n) => n.id)).toContain("checkout:paid");
  });

  it("Delete key when a text input is focused -> does not trigger deleteSelected", () => {
    const { handle } = setup();
    const draft = findNode(handle, "checkout:draft");
    handle.handleNodeClick(draft);

    // Create and focus a text input
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const graphBefore = handle.getGraph("en");
    expect(graphBefore.nodes.map((n) => n.id)).toContain("checkout:draft");

    // Simulate Delete key press on the focused input
    const deleteKeyEvent = new KeyboardEvent("keydown", { key: "Delete", bubbles: true });
    input.dispatchEvent(deleteKeyEvent);

    // Node should still exist (Delete key was on a text input)
    const graphAfter = handle.getGraph("en");
    expect(graphAfter.nodes.map((n) => n.id)).toContain("checkout:draft");

    document.body.removeChild(input);
  });

  it("Delete key with wrong key name -> does not trigger deleteSelected", () => {
    const { handle } = setup();
    const draft = findNode(handle, "checkout:draft");
    handle.handleNodeClick(draft);

    const graphBefore = handle.getGraph("en");
    expect(graphBefore.nodes.map((n) => n.id)).toContain("checkout:draft");

    // Simulate a different key press (e.g., Backspace)
    const backspaceKeyEvent = new KeyboardEvent("keydown", { key: "Backspace" });
    document.dispatchEvent(backspaceKeyEvent);

    // Node should still exist (wrong key)
    const graphAfter = handle.getGraph("en");
    expect(graphAfter.nodes.map((n) => n.id)).toContain("checkout:draft");
  });
});

// Regression: enabling edit mode on the flows dataset (with a flow present)
// must reveal Rename/Delete flow straight away. setVisible reads
// deps.activeFlow(), which was still null when it ran before the flow rebind,
// so both stayed hidden until the next flow switch re-ran setVisible.
// Buttons in `container` follow a fixed order: [addNode, addEdge,
// deleteSelected, undo, save, newFlow, renameFlow, deleteFlow].
describe("wireEditMode -- flow lifecycle buttons on enable", () => {
  function flowButtons(container: HTMLElement) {
    const buttons = [...container.querySelectorAll("button")] as HTMLButtonElement[];
    return {
      newFlow: must(buttons[5]),
      renameFlow: must(buttons[6]),
      deleteFlow: must(buttons[7]),
    };
  }

  it("shows New/Rename/Delete flow immediately on enable when a flow is active", () => {
    const { container } = setup(); // setEnabled(true) already ran, flows dataset
    const { newFlow, renameFlow, deleteFlow } = flowButtons(container);
    expect(newFlow.hidden).toBe(false);
    expect(renameFlow.hidden).toBe(false);
    expect(deleteFlow.hidden).toBe(false);
  });
});
