import { describe, expect, it, vi } from "vitest";
import type { FlowsEditHandle, ScreensEditHandle } from "../src/graph/graph-edit-mode.js";
import { deleteSelected, type ToolbarActionDeps } from "../src/graph/graph-edit-toolbar-actions.js";

// Test the Delete-selected toolbar action: confirm flow, selection validation,
// error/success paths, and back-compat (no confirmDelete dep = delete immediately).

type FakeResult = { ok: boolean; error?: string };

function fakeModeResult(ok: boolean, error?: string): FakeResult {
  return { ok, error };
}

function fakeMode(
  options: { deleteNode?: () => FakeResult; deleteEdge?: () => FakeResult } = {},
): ScreensEditHandle | FlowsEditHandle {
  return {
    deleteNode: options.deleteNode || (() => fakeModeResult(true)),
    deleteEdge: options.deleteEdge || (() => fakeModeResult(true)),
  } as unknown as ScreensEditHandle | FlowsEditHandle;
}

function baseDeps(): ToolbarActionDeps {
  return {
    getMode: () => null,
    getConnectionId: () => "conn-1",
    getKind: () => "flows",
    getSelection: () => ({ nodeIds: [], edgeId: null }),
    setStatus: vi.fn(),
    reset: vi.fn(),
    onChanged: vi.fn(),
    t: (key: string) => key,
  };
}

describe("deleteSelected -- confirm, selection, result paths", () => {
  it("confirmDelete true → deletes, calls reset + onChanged(null)", async () => {
    const deleteNode = vi.fn(() => fakeModeResult(true));
    const reset = vi.fn();
    const onChanged = vi.fn();
    const confirmDelete = vi.fn(() => true);

    const deps: ToolbarActionDeps = {
      ...baseDeps(),
      getMode: () => fakeMode({ deleteNode }),
      getSelection: () => ({ nodeIds: ["n1"], edgeId: null }),
      reset,
      onChanged,
      confirmDelete,
    };

    await deleteSelected(deps);

    expect(confirmDelete).toHaveBeenCalledWith("node");
    expect(deleteNode).toHaveBeenCalledWith("n1");
    expect(reset).toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledWith(null);
  });

  it("confirmDelete false → NO deleteNode call, NO reset, NO onChanged", async () => {
    const deleteNode = vi.fn(() => fakeModeResult(true));
    const reset = vi.fn();
    const onChanged = vi.fn();
    const confirmDelete = vi.fn(() => false);

    const deps: ToolbarActionDeps = {
      ...baseDeps(),
      getMode: () => fakeMode({ deleteNode }),
      getSelection: () => ({ nodeIds: ["n1"], edgeId: null }),
      reset,
      onChanged,
      confirmDelete,
    };

    await deleteSelected(deps);

    expect(confirmDelete).toHaveBeenCalledWith("node");
    expect(deleteNode).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('confirmDelete receives "edge" when an edge is selected', async () => {
    const deleteEdge = vi.fn(() => fakeModeResult(true));
    const confirmDelete = vi.fn(() => true);

    const deps: ToolbarActionDeps = {
      ...baseDeps(),
      getMode: () => fakeMode({ deleteEdge }),
      getSelection: () => ({ nodeIds: [], edgeId: "e1" }),
      confirmDelete,
    };

    await deleteSelected(deps);

    expect(confirmDelete).toHaveBeenCalledWith("edge");
    expect(deleteEdge).toHaveBeenCalledWith("e1");
  });

  it('confirmDelete receives "node" when a single node is selected', async () => {
    const deleteNode = vi.fn(() => fakeModeResult(true));
    const confirmDelete = vi.fn(() => true);

    const deps: ToolbarActionDeps = {
      ...baseDeps(),
      getMode: () => fakeMode({ deleteNode }),
      getSelection: () => ({ nodeIds: ["n1"], edgeId: null }),
      confirmDelete,
    };

    await deleteSelected(deps);

    expect(confirmDelete).toHaveBeenCalledWith("node");
    expect(deleteNode).toHaveBeenCalledWith("n1");
  });

  it("no confirmDelete dep → deletes immediately (back-compat)", async () => {
    const deleteNode = vi.fn(() => fakeModeResult(true));
    const reset = vi.fn();
    const onChanged = vi.fn();

    const deps: ToolbarActionDeps = {
      ...baseDeps(),
      getMode: () => fakeMode({ deleteNode }),
      getSelection: () => ({ nodeIds: ["n1"], edgeId: null }),
      reset,
      onChanged,
      // no confirmDelete
    };

    await deleteSelected(deps);

    expect(deleteNode).toHaveBeenCalledWith("n1");
    expect(reset).toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledWith(null);
  });

  it("unactionable selection (0 nodes, no edge) → sets status, confirmDelete NOT called", async () => {
    const confirmDelete = vi.fn(() => true);
    const setStatus = vi.fn();

    const deps: ToolbarActionDeps = {
      ...baseDeps(),
      getMode: () => fakeMode(),
      getSelection: () => ({ nodeIds: [], edgeId: null }),
      setStatus,
      confirmDelete,
    };

    await deleteSelected(deps);

    expect(setStatus).toHaveBeenCalledWith("graph.edit.selectOneToDelete");
    expect(confirmDelete).not.toHaveBeenCalled();
  });

  it("unactionable selection (2+ nodes, no edge) → sets status, confirmDelete NOT called", async () => {
    const confirmDelete = vi.fn(() => true);
    const setStatus = vi.fn();

    const deps: ToolbarActionDeps = {
      ...baseDeps(),
      getMode: () => fakeMode(),
      getSelection: () => ({ nodeIds: ["n1", "n2"], edgeId: null }),
      setStatus,
      confirmDelete,
    };

    await deleteSelected(deps);

    expect(setStatus).toHaveBeenCalledWith("graph.edit.selectOneToDelete");
    expect(confirmDelete).not.toHaveBeenCalled();
  });

  it("Promise-returning confirmDelete is awaited", async () => {
    const deleteNode = vi.fn(() => fakeModeResult(true));
    const confirmDelete = vi.fn(() => Promise.resolve(true));

    const deps: ToolbarActionDeps = {
      ...baseDeps(),
      getMode: () => fakeMode({ deleteNode }),
      getSelection: () => ({ nodeIds: ["n1"], edgeId: null }),
      confirmDelete,
    };

    await deleteSelected(deps);

    expect(deleteNode).toHaveBeenCalledWith("n1");
  });

  it("deleteNode returns error → sets status, NO reset, NO onChanged", async () => {
    const deleteNode = vi.fn(() => fakeModeResult(false, "Not found"));
    const reset = vi.fn();
    const onChanged = vi.fn();
    const setStatus = vi.fn();

    const deps: ToolbarActionDeps = {
      ...baseDeps(),
      getMode: () => fakeMode({ deleteNode }),
      getSelection: () => ({ nodeIds: ["n1"], edgeId: null }),
      setStatus,
      reset,
      onChanged,
    };

    await deleteSelected(deps);

    expect(setStatus).toHaveBeenCalledWith("Not found");
    expect(reset).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("no mode → early return", async () => {
    const reset = vi.fn();
    const onChanged = vi.fn();

    const deps: ToolbarActionDeps = {
      ...baseDeps(),
      getMode: () => null,
      reset,
      onChanged,
    };

    await deleteSelected(deps);

    expect(reset).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
