import type { Flow } from "@specpin/spec-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectFlowsScreens } from "../src/shared/messaging.js";

// RT-H3 regression cover. The graph save pipelines re-read the live config
// before merging a draft into it, so a teammate's concurrent edit is never
// clobbered. Once GET_FLOWS_SCREENS grew a two-phase contract (a default read
// answered from the background's cache, `refresh: true` for the real disk read),
// that guarantee started depending on which phase each caller asks for -- and a
// plain read silently downgrades the merge base to a cached snapshot. These
// tests pin the phase per call site so the downgrade cannot happen unnoticed.

const h = vi.hoisted(() => ({ fetchProjects: vi.fn(), dispatchWriteFlows: vi.fn() }));
vi.mock("../src/graph/graph-project-load.js", () => ({ fetchProjects: h.fetchProjects }));
vi.mock("../src/graph/graph-write-dispatch.js", () => ({
  dispatchWriteFlows: h.dispatchWriteFlows,
  dispatchWriteScreens: vi.fn(),
}));

import { createFlow } from "../src/graph/graph-edit-flow-save.js";

const newFlow = (id: string): Flow =>
  ({ id, object: { en: id }, states: [], transitions: [] }) as unknown as Flow;

function project(): ProjectFlowsScreens {
  return {
    connectionId: "a",
    project: "A",
    recordEnabled: false,
    recordExclude: [],
    flows: { version: "1.0", flows: [] },
    screens: { version: "1.0", screens: [], transitions: [] },
    specs: [],
    shotScreenIds: null,
  } as unknown as ProjectFlowsScreens;
}

beforeEach(() => {
  h.fetchProjects.mockReset().mockResolvedValue({ projects: [project()], pending: 0 });
  h.dispatchWriteFlows.mockReset().mockResolvedValue({ ok: true });
});

describe("graph flow save: which GET_FLOWS_SCREENS phase each read takes", () => {
  it("reads the merge base with refresh:true, so the write never merges onto a cached snapshot", async () => {
    await createFlow("a", newFlow("checkout"));
    expect(h.fetchProjects.mock.calls[0]?.[0]).toBe(true);
  });

  it("takes the cheap cached read afterwards -- the write path already reloaded that connection", async () => {
    await createFlow("a", newFlow("checkout"));
    expect(h.fetchProjects).toHaveBeenCalledTimes(2);
    expect(h.fetchProjects.mock.calls[1]?.[0]).toBeUndefined();
  });

  it("does not write at all when the project vanished between edit and save", async () => {
    h.fetchProjects.mockResolvedValue({ projects: [], pending: 0 });
    const result = await createFlow("a", newFlow("checkout"));
    expect(result.ok).toBe(false);
    expect(h.dispatchWriteFlows).not.toHaveBeenCalled();
  });
});
