import type { FlowsConfig, ScreensConfig } from "@specpin/spec-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectFlowsScreens } from "../src/shared/messaging.js";
import { must } from "./test-utils.js";

// Regression: creating a new flow persisted it but the flow picker never
// showed it (and re-adding hit "a flow with id ... already exists"). Root
// cause was graph-edit-wiring.ts's onFlowsChanged rendering the picker
// (flowControls.setVisible -> renderFlowOptions, which reads currentProject())
// BEFORE deps.onChanged pushed the refreshed project list into main.ts's
// shared `projects`. This mirrors that exact wiring: currentProject() reads a
// mutable list that onChanged replaces.

const h = vi.hoisted(() => ({ createFlow: vi.fn() }));
vi.mock("../src/graph/graph-edit-flow-save.js", () => ({
  createFlow: h.createFlow,
  renameFlow: vi.fn(),
  deleteFlow: vi.fn(),
}));

import { wireEditMode } from "../src/graph/graph-edit-wiring.js";

function emptyScreensConfig(): ScreensConfig {
  return { version: "1.0", screens: [], transitions: [] };
}

function oneFlowConfig(): FlowsConfig {
  return {
    version: "1.0",
    flows: [
      {
        id: "checkout",
        object: { en: "Order" },
        states: [{ id: "draft", label: { en: "Draft" }, kind: "initial" }],
        transitions: [],
      },
    ],
  };
}

/** The list the sidecar would return after "hihi" was appended and saved. */
function twoFlowConfig(): FlowsConfig {
  const config = oneFlowConfig();
  config.flows.push({ id: "hihi", object: { en: "Hihi" }, states: [], transitions: [] });
  return config;
}

function projectWith(flows: FlowsConfig): ProjectFlowsScreens {
  return {
    connectionId: "conn-1",
    project: "demo",
    recordEnabled: false,
    recordExclude: [],
    flows,
    screens: emptyScreensConfig(),
    specs: [],
    shotScreenIds: null,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  h.createFlow.mockReset();
});

describe("wireEditMode -- new flow shows up without a manual refresh", () => {
  it("rebuilds the flow picker from the refreshed project list after a create", async () => {
    const container = document.createElement("div");
    const formContainer = document.createElement("div");
    document.body.append(container, formContainer);

    // main.ts's wiring: currentProject() reads `projects`, onChanged replaces it.
    let projects: ProjectFlowsScreens[] = [projectWith(oneFlowConfig())];
    const onChanged = vi.fn((fresh: ProjectFlowsScreens[] | null) => {
      if (fresh) projects = fresh;
    });

    h.createFlow.mockResolvedValue({ ok: true, refreshedProjects: [projectWith(twoFlowConfig())] });

    wireEditMode(container, formContainer, {
      currentProject: () => projects[0],
      currentDataset: () => "flows",
      onChanged,
      applySelection: () => {},
      locale: () => "en",
    }).setEnabled(true);

    // The flow picker sits just before the "New flow" button in the toolbar.
    const flowSelect = must(container.querySelector<HTMLSelectElement>(".graph-edit-flow-select"));
    // One flow so far -> picker hidden, and it does not list "hihi" yet.
    expect(flowSelect.hidden).toBe(true);
    const newBtn = flowSelect.nextElementSibling as HTMLButtonElement;
    newBtn.click();

    // Fill the create-flow form: [id input, "en" object input].
    const inputs = formContainer.querySelectorAll("input");
    (inputs[0] as HTMLInputElement).value = "hihi";
    (inputs[1] as HTMLInputElement).value = "Hihi";
    must(formContainer.querySelector<HTMLButtonElement>(".edit-form-submit")).click();

    // Let the async onCreate -> createFlow -> onFlowsChanged chain settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(h.createFlow).toHaveBeenCalledTimes(1);
    // The picker must now list the freshly-created flow and be visible (2 flows).
    const options = [...flowSelect.options].map((o) => o.value);
    expect(options).toContain("hihi");
    expect(flowSelect.hidden).toBe(false);
  });
});
