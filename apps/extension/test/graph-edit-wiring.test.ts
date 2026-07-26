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

  it("ignores a click on a node belonging to a DIFFERENT flow than the one being edited (does not mutate the active flow)", () => {
    const { handle, container } = setup();
    const foreign = findNode(handle, "signup:start"); // active flow is "checkout" (the first flow)
    expect(handle.handleNodeClick(foreign)).toBe(true); // consumed, but not selected

    toolbarButtons(container).deleteSelected.click(); // nothing selected -> no-op
    const graph = handle.getGraph("en");
    expect(graph.nodes.map((n) => n.id)).toContain("signup:start");
    expect(graph.nodes.map((n) => n.id)).toContain("checkout:draft");
  });

  it("ignores a click on an edge belonging to a DIFFERENT flow than the one being edited", () => {
    const { handle, container } = setup();
    const foreignEdge = findEdge(handle, "signup:loop");
    expect(handle.handleEdgeClick(foreignEdge)).toBe(true); // consumed, but not selected

    toolbarButtons(container).deleteSelected.click(); // nothing selected -> no-op
    const graph = handle.getGraph("en");
    expect(graph.edges.map((e) => e.id)).toContain("signup:loop");
    expect(graph.edges.map((e) => e.id)).toContain("checkout:pay");
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
