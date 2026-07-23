import type { ProjectFlowsScreens } from "../shared/messaging.js";

// The project + dataset (flows/screens) `<select>` pair above the graph canvas.
// DOM-only glue, split out of main.ts to keep the entrypoint within the phase's
// 200-line-per-file budget: the two selects only ever need to know the current
// project list and report back which (project, dataset) pair is now chosen.

export type Dataset = "flows" | "screens";
export interface DatasetChoice {
  projectIdx: number;
  dataset: Dataset;
}

/** Show the dataset select only when a project actually has BOTH flows and
 *  screens configured (nothing to toggle otherwise); default to whichever one
 *  is non-empty. Returns the resolved default so the caller can build the
 *  initial graph without a redundant round trip through the change handler. */
function resolveDataset(datasetSelect: HTMLSelectElement, project: ProjectFlowsScreens): Dataset {
  const hasFlows = project.flows.flows.length > 0;
  const hasScreens = project.screens.screens.length > 0;
  datasetSelect.hidden = !(hasFlows && hasScreens);
  const dataset: Dataset = hasFlows ? "flows" : "screens";
  datasetSelect.value = dataset;
  return dataset;
}

export function wireProjectPicker(
  projectSelect: HTMLSelectElement,
  datasetSelect: HTMLSelectElement,
  onChange: (choice: DatasetChoice) => void,
): { populate(projects: ProjectFlowsScreens[]): DatasetChoice | null } {
  let projects: ProjectFlowsScreens[] = [];

  function currentDataset(): Dataset {
    return datasetSelect.value === "screens" ? "screens" : "flows";
  }

  projectSelect.addEventListener("change", () => {
    const projectIdx = Number(projectSelect.value) || 0;
    const project = projects[projectIdx];
    const dataset = project ? resolveDataset(datasetSelect, project) : currentDataset();
    onChange({ projectIdx, dataset });
  });
  datasetSelect.addEventListener("change", () => {
    onChange({ projectIdx: Number(projectSelect.value) || 0, dataset: currentDataset() });
  });

  return {
    populate(next: ProjectFlowsScreens[]): DatasetChoice | null {
      projects = next;
      if (projects.length === 0) return null;
      projectSelect.hidden = projects.length <= 1;
      projectSelect.replaceChildren();
      for (const [i, p] of projects.entries()) {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = p.project;
        projectSelect.appendChild(opt);
      }
      projectSelect.value = "0";
      return { projectIdx: 0, dataset: resolveDataset(datasetSelect, projects[0]) };
    },
  };
}
