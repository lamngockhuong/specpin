import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectFlowsScreens } from "../src/shared/messaging.js";

// The graph panel's two-phase load. Regression cover for the panel sitting blank
// for seconds whenever a configured sidecar was down: phase one must answer with
// no network, and phase two must be entirely optional and non-destructive.

const h = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../src/shared/messaging.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/shared/messaging.js")>()),
  sendToBackground: h.send,
}));

import {
  fetchProjects,
  loadSidecarProjects,
  projectsSignature,
} from "../src/graph/graph-project-load.js";

function project(id: string, screens: string[] = []): ProjectFlowsScreens {
  return {
    connectionId: id,
    project: id,
    recordEnabled: false,
    recordExclude: [],
    flows: { version: "1.0", flows: [] },
    screens: {
      version: "1.0",
      screens: screens.map((s) => ({ id: s, name: { en: s }, urlGlob: "/*" })),
      transitions: [],
    },
    specs: [],
    shotScreenIds: null,
  } as unknown as ProjectFlowsScreens;
}

const clean = () => false;
const dirty = () => true;

beforeEach(() => {
  h.send.mockReset();
});

describe("fetchProjects", () => {
  it("omits `refresh` by default, so the background answers without touching the network", async () => {
    h.send.mockResolvedValue({ projects: [], pending: 0 });
    await fetchProjects();
    expect(h.send).toHaveBeenCalledWith({ type: "GET_FLOWS_SCREENS", refresh: undefined });
  });

  it("opts into the sidecar round-trip when asked", async () => {
    h.send.mockResolvedValue({ projects: [], pending: 0 });
    await fetchProjects(true);
    expect(h.send).toHaveBeenCalledWith({ type: "GET_FLOWS_SCREENS", refresh: true });
  });
});

describe("projectsSignature", () => {
  it("is stable across two equivalent lists", () => {
    expect(projectsSignature([project("a", ["home"])])).toBe(
      projectsSignature([project("a", ["home"])]),
    );
  });

  it("moves when a project appears or its config grows", () => {
    const base = projectsSignature([project("a")]);
    expect(projectsSignature([project("a"), project("b")])).not.toBe(base);
    expect(projectsSignature([project("a", ["home"])])).not.toBe(base);
  });
});

describe("loadSidecarProjects", () => {
  it("returns the list to paint when a project came online in phase two", async () => {
    h.send.mockResolvedValue({ projects: [project("manual"), project("side")], pending: 0 });
    const list = await loadSidecarProjects([project("manual")], clean);
    expect(list?.map((p: ProjectFlowsScreens) => p.connectionId)).toEqual(["manual", "side"]);
  });

  it("returns null when the refresh returns what phase one already showed", async () => {
    h.send.mockResolvedValue({ projects: [project("manual")], pending: 1 });
    expect(await loadSidecarProjects([project("manual")], clean)).toBeNull();
  });

  it("still repaints an empty panel, so 'connecting' falls back to 'nothing configured'", async () => {
    h.send.mockResolvedValue({ projects: [], pending: 1 });
    expect(await loadSidecarProjects([], clean)).toEqual([]);
  });

  it("never overwrites an unsaved edit draft", async () => {
    h.send.mockResolvedValue({ projects: [project("manual"), project("side")], pending: 0 });
    expect(await loadSidecarProjects([project("manual")], dirty)).toBeNull();
  });

  it("keeps phase one's list when the background call fails", async () => {
    h.send.mockRejectedValue(new Error("worker gone"));
    expect(await loadSidecarProjects([project("manual")], clean)).toBeNull();
  });
});
