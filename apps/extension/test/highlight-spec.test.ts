import type { ElementFingerprint, Spec } from "@specpin/spec-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { highlightSpecOnTab, resolveSpecElement } from "../src/content/highlight-spec.js";
import type { TaggedSpec } from "../src/shared/connection-types.js";

function buttonFingerprint(cssSelector: string): ElementFingerprint {
  return {
    testId: null,
    ariaLabel: null,
    id: null,
    cssSelector,
    xpath: `//${cssSelector}`,
    domPath: [cssSelector],
    tagName: "button",
    textContent: null,
    attributes: {},
    nearbyLabels: [],
    positionHint: { index: 0, siblingCount: 1 },
    pageUrl: null,
  };
}

function taggedSpec(id: string, connectionId: string, cssSelector: string): TaggedSpec {
  const spec: Spec = {
    id,
    title: { en: id },
    description: { en: "x" },
    businessRules: [],
    tags: [],
    fingerprint: buttonFingerprint(cssSelector),
    meta: {
      createdBy: "t",
      createdAt: "2026-06-25T08:00:00Z",
      updatedAt: "2026-06-25T08:00:00Z",
      source: "manual",
    },
  };
  return { ...spec, connectionId, project: connectionId, _file: "x.spec.json" };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("resolveSpecElement", () => {
  it("prefers the already-rendered match over a fresh matchElement pass", () => {
    document.body.innerHTML = `<button class="a">a</button>`;
    const el = document.querySelector<HTMLElement>(".a");
    if (!el) throw new Error("fixture missing");
    const specs = [taggedSpec("s1", "conn-1", ".a")];
    const rendered = document.createElement("div"); // deliberately NOT the matched el
    const matches = new Map([["s1", rendered]]);
    expect(resolveSpecElement("s1", "conn-1", specs, matches, document)).toBe(rendered);
  });

  it("falls back to a fresh matchElement pass when not in the render session's matches", () => {
    document.body.innerHTML = `<button class="a">a</button>`;
    const el = document.querySelector<HTMLElement>(".a");
    if (!el) throw new Error("fixture missing");
    const specs = [taggedSpec("s1", "conn-1", ".a")];
    expect(resolveSpecElement("s1", "conn-1", specs, undefined, document)).toBe(el);
  });

  it("disambiguates a specId that collides across two connections by connectionId", () => {
    document.body.innerHTML = `<button class="a">a</button><button class="b">b</button>`;
    const b = document.querySelector<HTMLElement>(".b");
    if (!b) throw new Error("fixture missing");
    const specs = [taggedSpec("dup", "conn-1", ".a"), taggedSpec("dup", "conn-2", ".b")];
    expect(resolveSpecElement("dup", "conn-2", specs, undefined, document)).toBe(b);
  });

  it("falls back to matching by id alone when no spec matches the given connectionId", () => {
    document.body.innerHTML = `<button class="a">a</button>`;
    const el = document.querySelector<HTMLElement>(".a");
    if (!el) throw new Error("fixture missing");
    const specs = [taggedSpec("s1", "conn-1", ".a")];
    expect(resolveSpecElement("s1", "conn-unknown", specs, undefined, document)).toBe(el);
  });

  it("returns null when no spec matches the id", () => {
    const specs = [taggedSpec("s1", "conn-1", ".a")];
    expect(resolveSpecElement("missing", "conn-1", specs, undefined, document)).toBeNull();
  });

  it("returns null when the spec's fingerprint matches nothing on this page", () => {
    document.body.innerHTML = `<div></div>`;
    const specs = [taggedSpec("s1", "conn-1", ".a")];
    expect(resolveSpecElement("s1", "conn-1", specs, undefined, document)).toBeNull();
  });
});

describe("highlightSpecOnTab", () => {
  it("found: highlights the resolved element and reports true", () => {
    document.body.innerHTML = `<button class="a">a</button>`;
    const el = document.querySelector<HTMLElement>(".a");
    if (!el) throw new Error("fixture missing");
    const specs = [taggedSpec("s1", "conn-1", ".a")];
    const highlight = vi.fn();
    const found = highlightSpecOnTab("s1", "conn-1", specs, undefined, document, highlight);
    expect(found).toBe(true);
    expect(highlight).toHaveBeenCalledWith(el);
  });

  it("absent spec: graceful no-op, reports false, never calls highlight", () => {
    document.body.innerHTML = `<button class="a">a</button>`;
    const specs = [taggedSpec("s1", "conn-1", ".a")];
    const highlight = vi.fn();
    const found = highlightSpecOnTab(
      "not-a-real-spec",
      "conn-1",
      specs,
      undefined,
      document,
      highlight,
    );
    expect(found).toBe(false);
    expect(highlight).not.toHaveBeenCalled();
  });

  it("spec present but unmatched on this page: graceful no-op, reports false", () => {
    document.body.innerHTML = `<div></div>`;
    const specs = [taggedSpec("s1", "conn-1", ".a")];
    const highlight = vi.fn();
    const found = highlightSpecOnTab("s1", "conn-1", specs, undefined, document, highlight);
    expect(found).toBe(false);
    expect(highlight).not.toHaveBeenCalled();
  });
});
