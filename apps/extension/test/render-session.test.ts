import type { Spec } from "@specpin/spec-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderSession } from "../src/content/orchestrator.js";
import { must } from "./test-utils.js";

afterEach(() => {
  document.body.innerHTML = "";
  document.getElementById("specpin-tooltip-host")?.remove();
  document.getElementById("specpin-sidebar-host")?.remove();
  document.getElementById("specpin-modal-host")?.remove();
  document.getElementById("specpin-launcher-host-sidebar")?.remove();
  document.getElementById("specpin-launcher-host-modal")?.remove();
});

function spec(id: string, testId: string, mode?: "tooltip" | "sidebar" | "modal"): Spec {
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

  it("maps matched elements by spec id and threads onHighlight to renderers", () => {
    document.body.innerHTML = `<button data-testid="a">a</button>`;
    const onHighlight = vi.fn();
    const session = renderSession(
      [spec("a", "a", "sidebar")],
      null,
      document,
      null,
      undefined,
      undefined,
      undefined,
      "",
      undefined,
      onHighlight,
    );
    const target = document.querySelector('[data-testid="a"]');
    expect(session.matches.get("a")).toBe(target);

    // Clicking the rendered sidebar card hands the matched element to onHighlight.
    const card = document
      .getElementById("specpin-sidebar-host")
      ?.shadowRoot?.querySelector<HTMLElement>(".card");
    card?.click();
    expect(onHighlight).toHaveBeenCalledWith(target);
    session.destroy();
  });

  it("a dismissed mode renders the relaunch pill instead of its panel", () => {
    document.body.innerHTML = `<button data-testid="a">a</button>`;
    const onToggle = vi.fn();
    const session = renderSession(
      [spec("a", "a", "sidebar")],
      null,
      document,
      "sidebar",
      undefined,
      undefined,
      undefined,
      "",
      undefined,
      undefined,
      undefined,
      undefined,
      { modes: new Set(["sidebar"]), onToggle },
    );
    // Sidebar panel is suppressed; the launcher pill stands in for it.
    expect(document.getElementById("specpin-sidebar-host")).toBeNull();
    const pill = document
      .getElementById("specpin-launcher-host-sidebar")
      ?.shadowRoot?.querySelector<HTMLButtonElement>(".pill");
    expect(pill).toBeTruthy();
    pill?.click();
    expect(onToggle).toHaveBeenCalledWith("sidebar", false);
    session.destroy();
    expect(document.getElementById("specpin-launcher-host-sidebar")).toBeNull();
  });

  it("sidebar + modal dismissed at once get distinct, non-colliding pills", () => {
    document.body.innerHTML = `<button data-testid="a">a</button><button data-testid="b">b</button>`;
    const onToggle = vi.fn();
    const session = renderSession(
      [spec("a", "a", "sidebar"), spec("b", "b", "modal")],
      null,
      document,
      null,
      undefined,
      undefined,
      undefined,
      "",
      undefined,
      undefined,
      undefined,
      undefined,
      { modes: new Set(["sidebar", "modal"]), onToggle },
    );
    // Two separate hosts (no duplicate id), one per dismissed mode.
    expect(document.getElementById("specpin-launcher-host-sidebar")).toBeTruthy();
    expect(document.getElementById("specpin-launcher-host-modal")).toBeTruthy();
    session.destroy();
    expect(document.getElementById("specpin-launcher-host-sidebar")).toBeNull();
    expect(document.getElementById("specpin-launcher-host-modal")).toBeNull();
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
