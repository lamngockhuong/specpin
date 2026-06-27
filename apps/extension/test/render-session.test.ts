import type { Spec } from "@specpin/spec-schema";
import { afterEach, describe, expect, it } from "vitest";
import { renderSession } from "../src/content/orchestrator.js";
import { must } from "./test-utils.js";

afterEach(() => {
  document.body.innerHTML = "";
  document.getElementById("specpin-tooltip-host")?.remove();
  document.getElementById("specpin-sidebar-host")?.remove();
});

function spec(id: string, testId: string, mode?: "tooltip" | "sidebar"): Spec {
  return {
    id,
    title: { en: id },
    description: { en: "d" },
    preferredDisplayMode: mode,
    fingerprint: {
      cssSelector: `[data-testid="${testId}"]`,
      xpath: "",
      domPath: [],
      tagName: "button",
      attributes: {},
      positionHint: { index: 0, siblingCount: 1 },
      testId,
    },
  };
}

describe("renderSession", () => {
  it("creates one renderer per distinct resolved mode", () => {
    document.body.innerHTML = `<button data-testid="a">a</button><button data-testid="b">b</button>`;
    const session = renderSession(
      [spec("a", "a", "tooltip"), spec("b", "b", "sidebar")],
      null,
      document,
    );
    expect(session.stats.rendered).toBe(2);
    expect(new Set(session.renderers.map((r) => r.mode))).toEqual(new Set(["tooltip", "sidebar"]));
    session.destroy();
  });

  it("forcedMode overrides per-spec modes", () => {
    document.body.innerHTML = `<button data-testid="a">a</button><button data-testid="b">b</button>`;
    const session = renderSession(
      [spec("a", "a", "tooltip"), spec("b", "b", "sidebar")],
      null,
      document,
      "sidebar",
    );
    expect(session.renderers).toHaveLength(1);
    expect(must(session.renderers[0]).mode).toBe("sidebar");
    session.destroy();
  });

  it("destroy() tears down all renderers", () => {
    document.body.innerHTML = `<button data-testid="a">a</button>`;
    const session = renderSession([spec("a", "a", "sidebar")], null, document);
    session.destroy();
    expect(document.getElementById("specpin-sidebar-host")).toBeNull();
  });
});

function tagged(id: string, testId: string, tags: string[]): Spec {
  return { ...spec(id, testId, "tooltip"), tags };
}

const EMPTY_STATE = { teamHidden: [], personal: { forceHide: [], forceShow: [] } };

describe("renderSession visibility filtering", () => {
  it("empty state renders every matched spec (regression lock)", () => {
    document.body.innerHTML = `<button data-testid="a">a</button><button data-testid="b">b</button>`;
    const session = renderSession(
      [tagged("a", "a", ["auth"]), tagged("b", "b", ["nav"])],
      null,
      document,
      null,
      undefined,
      undefined,
      EMPTY_STATE,
      "https://x.test/",
    );
    expect(session.stats.rendered).toBe(2);
    session.destroy();
  });

  it("hiding tag:auth drops the auth spec from rendering", () => {
    document.body.innerHTML = `<button data-testid="a">a</button><button data-testid="b">b</button>`;
    const session = renderSession(
      [tagged("a", "a", ["auth"]), tagged("b", "b", ["nav"])],
      null,
      document,
      null,
      undefined,
      undefined,
      { teamHidden: ["tag:auth"], personal: { forceHide: [], forceShow: [] } },
      "https://x.test/",
    );
    expect(session.stats.rendered).toBe(1);
    session.destroy();
  });

  it("a url gate hides the whole page", () => {
    document.body.innerHTML = `<button data-testid="a">a</button><button data-testid="b">b</button>`;
    const session = renderSession(
      [tagged("a", "a", ["auth"]), tagged("b", "b", ["nav"])],
      null,
      document,
      null,
      undefined,
      undefined,
      { teamHidden: ["url:/admin/**"], personal: { forceHide: [], forceShow: [] } },
      "https://x.test/admin/users",
    );
    expect(session.stats.rendered).toBe(0);
    session.destroy();
  });
});
