import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Dataset, wireProjectPicker } from "../src/graph/graph-project-picker.js";
import type { ProjectFlowsScreens } from "../src/shared/messaging.js";

// Persistence of the (project, dataset) pick across a reload (graph-project-
// picker.ts): a saved pick is keyed on connectionId and restored by populate.

const flush = () => new Promise((r) => setTimeout(r, 0));

function project(connectionId: string): ProjectFlowsScreens {
  return {
    connectionId,
    project: connectionId,
    recordEnabled: false,
    // Both datasets non-empty so the dataset <select> is shown and toggleable.
    flows: {
      version: "1.0",
      flows: [{ id: "f", object: { en: connectionId }, states: [], transitions: [] }],
    },
    screens: {
      version: "1.0",
      screens: [{ id: "s", name: { en: connectionId }, urlGlob: "/" }],
      transitions: [],
    },
    specs: [],
    shotScreenIds: null,
  };
}

function mountPicker() {
  const projectSelect = document.createElement("select");
  const datasetSelect = document.createElement("select");
  for (const v of ["flows", "screens"] as Dataset[]) {
    const opt = document.createElement("option");
    opt.value = v;
    datasetSelect.appendChild(opt);
  }
  document.body.append(projectSelect, datasetSelect);
  const picker = wireProjectPicker(projectSelect, datasetSelect, () => {});
  return { projectSelect, datasetSelect, picker };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
});

describe("wireProjectPicker persistence", () => {
  const projects = [project("conn-a"), project("conn-b")];

  it("defaults to the first project + flows when nothing is saved", () => {
    const { picker } = mountPicker();
    expect(picker.populate(projects)).toEqual({ projectIdx: 0, dataset: "flows" });
  });

  it("restores the saved project + dataset by connectionId after a reload", async () => {
    // First mount: pick project B, then dataset "screens" -- each change persists.
    const first = mountPicker();
    first.picker.populate(projects);
    first.projectSelect.value = "1";
    first.projectSelect.dispatchEvent(new Event("change"));
    await flush();
    first.datasetSelect.value = "screens";
    first.datasetSelect.dispatchEvent(new Event("change"));
    await flush();
    document.body.innerHTML = "";

    // Second mount (a fresh page load) restores the pick, not index 0/flows.
    const second = mountPicker();
    expect(second.picker.populate(projects)).toEqual({ projectIdx: 1, dataset: "screens" });
    expect(second.projectSelect.value).toBe("1");
    expect(second.datasetSelect.value).toBe("screens");
  });

  it("falls back to the first project when the saved connectionId is gone", () => {
    localStorage.setItem(
      "specpin:graph:selection",
      JSON.stringify({ connectionId: "conn-removed", dataset: "screens" }),
    );
    const { picker } = mountPicker();
    expect(picker.populate(projects)).toEqual({ projectIdx: 0, dataset: "flows" });
  });
});
