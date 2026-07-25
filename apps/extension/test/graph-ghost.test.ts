import type { ScreensConfig } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { screensToGraph } from "../src/graph/config-to-graph.js";
import { overlayGhostBuffer } from "../src/graph/graph-ghost.js";
import type { CaptureBufferEntry } from "../src/shared/messaging.js";

function committedGraph(): ReturnType<typeof screensToGraph> {
  const config: ScreensConfig = {
    version: "1.0",
    screens: [{ id: "home", name: { en: "Home" }, urlGlob: "/" }],
    transitions: [],
  };
  return screensToGraph(config, "en");
}

function bufferEntry(overrides: Partial<CaptureBufferEntry> = {}): CaptureBufferEntry {
  return {
    project: "proj-a",
    capturedAt: 1,
    transition: {
      id: "home__checkout",
      from: "home",
      to: "checkout",
      trigger: { en: "navigation" },
      source: "auto-captured",
    },
    from: { id: "home", urlGlob: "/", name: "Home" },
    to: { id: "checkout", urlGlob: "/checkout", name: "Checkout" },
    ...overrides,
  };
}

describe("overlayGhostBuffer", () => {
  it("adds a pending ghost node + edge for a candidate screen not yet committed", () => {
    const graph = overlayGhostBuffer(committedGraph(), [bufferEntry()], "en");
    const ghostNode = graph.nodes.find((n) => n.id === "checkout");
    expect(ghostNode).toMatchObject({ label: "Checkout", urlGlob: "/checkout", pending: true });
    const ghostEdge = graph.edges.find((e) => e.id === "home__checkout");
    expect(ghostEdge).toMatchObject({ from: "home", to: "checkout", pending: true });
    // Committed node untouched (no `pending` field at all).
    const committed = graph.nodes.find((n) => n.id === "home");
    expect(committed?.pending).toBeUndefined();
  });

  it("resolves the edge label via the requested locale, falling back to the transition id", () => {
    const graph = overlayGhostBuffer(
      committedGraph(),
      [
        bufferEntry({
          transition: {
            id: "e1",
            from: "home",
            to: "checkout",
            trigger: { vi: "Điều hướng" },
            source: "auto-captured",
          },
        }),
      ],
      "vi",
      "en",
    );
    expect(graph.edges.find((e) => e.id === "e1")?.label).toBe("Điều hướng");
  });

  it("skips a buffer entry whose transition id is ALREADY a committed edge (stale/approved-elsewhere)", () => {
    const config: ScreensConfig = {
      version: "1.0",
      screens: [
        { id: "home", name: { en: "Home" }, urlGlob: "/" },
        { id: "checkout", name: { en: "Checkout" }, urlGlob: "/checkout" },
      ],
      transitions: [{ id: "home__checkout", from: "home", to: "checkout", trigger: { en: "Go" } }],
    };
    const graph = overlayGhostBuffer(screensToGraph(config, "en"), [bufferEntry()], "en");
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.pending).toBeUndefined();
  });

  it("skips a ghost NODE whose id OR urlGlob already names a committed node, remapping the edge to it (no duplicate node)", () => {
    const config: ScreensConfig = {
      version: "1.0",
      // A committed screen already covers "/checkout" under a DIFFERENT id.
      screens: [
        { id: "home", name: { en: "Home" }, urlGlob: "/" },
        { id: "checkout-page", name: { en: "Checkout" }, urlGlob: "/checkout" },
      ],
      transitions: [],
    };
    const graph = overlayGhostBuffer(screensToGraph(config, "en"), [bufferEntry()], "en");
    // No new "checkout" ghost node was added.
    expect(graph.nodes.find((n) => n.id === "checkout")).toBeUndefined();
    expect(graph.nodes).toHaveLength(2);
    // The ghost edge resolves to the EXISTING node id, not the candidate's.
    const ghostEdge = graph.edges.find((e) => e.id === "home__checkout");
    expect(ghostEdge).toMatchObject({ from: "home", to: "checkout-page", pending: true });
  });

  it("returns the committed graph unchanged when the buffer is empty", () => {
    const committed = committedGraph();
    const graph = overlayGhostBuffer(committed, [], "en");
    expect(graph).toEqual(committed);
  });

  it("dedupes two buffer entries that share the same new candidate screen into one ghost node", () => {
    const graph = overlayGhostBuffer(
      committedGraph(),
      [
        bufferEntry({
          transition: { id: "e1", from: "home", to: "checkout", trigger: { en: "a" } },
        }),
        bufferEntry({
          transition: { id: "e2", from: "checkout", to: "home", trigger: { en: "b" } },
        }),
      ],
      "en",
    );
    expect(graph.nodes.filter((n) => n.id === "checkout")).toHaveLength(1);
    expect(graph.edges.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });
});
