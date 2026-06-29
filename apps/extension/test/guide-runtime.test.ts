import { afterEach, describe, expect, it, vi } from "vitest";
import { GuideController } from "../src/content/guide.js";
import { defaultGuideOrder, resolveGuideSteps } from "../src/content/resolve-guide.js";
import type { TaggedSpec } from "../src/shared/connection-types.js";
import { localConnId } from "../src/shared/local-id.js";

/** A TaggedSpec whose fingerprint matches an element by `data-testid`. */
function taggedSpec(
  id: string,
  opts: { file?: string; connectionId?: string; title?: string } = {},
): TaggedSpec {
  return {
    id,
    title: { en: opts.title ?? id },
    description: { en: `desc for ${id}` },
    businessRules: [],
    fingerprint: {
      testId: id,
      cssSelector: `[data-testid="${id}"]`,
      xpath: "",
      domPath: [],
      tagName: "button",
      attributes: {},
      positionHint: { index: 0, siblingCount: 1 },
    },
    _file: opts.file ?? "a.spec.json",
    connectionId: opts.connectionId ?? "conn-1",
    project: "P",
    writable: true,
  } as unknown as TaggedSpec;
}

function mountEl(testId: string): HTMLElement {
  const el = document.createElement("button");
  el.setAttribute("data-testid", testId);
  el.scrollIntoView = vi.fn();
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.getElementById("specpin-guide-host")?.remove();
  document.body.innerHTML = "";
});

describe("defaultGuideOrder (RT-H4)", () => {
  it("orders by _file alphabetical, then array (in-file) order, sidecar before local", () => {
    const specs = [
      taggedSpec("z1", { file: "z.spec.json", connectionId: "c" }),
      taggedSpec("a2", { file: "a.spec.json", connectionId: "c" }),
      taggedSpec("a1", { file: "a.spec.json", connectionId: "c" }),
      taggedSpec("loc", { file: "a.spec.json", connectionId: localConnId("b1") }),
    ];
    // a.spec.json sidecar specs first (in array order a2 before a1), then z.spec.json,
    // then the local/manual batch spec last regardless of its file name.
    expect(defaultGuideOrder(specs).map((s) => s.id)).toEqual(["a2", "a1", "z1", "loc"]);
  });
});

describe("resolveGuideSteps", () => {
  it("resolves curated ids in order, dropping unknown + unmatched, keeping survivors", () => {
    mountEl("one");
    mountEl("three");
    const specs = [taggedSpec("one"), taggedSpec("two"), taggedSpec("three")];
    // "two" has a spec but no element on the page; "ghost" has no spec at all.
    const { steps, dropped } = resolveGuideSteps(["one", "ghost", "two", "three"], specs, document);
    expect(steps.map((s) => s.spec.id)).toEqual(["one", "three"]);
    expect(dropped).toEqual(["ghost", "two"]);
  });

  it("falls back to all specs in default order when no ids are given (uncurated default)", () => {
    mountEl("a1");
    mountEl("b1");
    const specs = [
      taggedSpec("b1", { file: "b.spec.json" }),
      taggedSpec("a1", { file: "a.spec.json" }),
    ];
    const { steps } = resolveGuideSteps(undefined, specs, document);
    expect(steps.map((s) => s.spec.id)).toEqual(["a1", "b1"]);
  });
});

describe("GuideController", () => {
  function host(): HTMLElement | null {
    return document.getElementById("specpin-guide-host");
  }
  function pop(): HTMLElement | null | undefined {
    return host()?.shadowRoot?.querySelector<HTMLElement>(".pop");
  }

  it("starts: spotlights the first element and shows its localized content + counter", () => {
    const el = mountEl("one");
    const onExit = vi.fn();
    const g = new GuideController();
    g.start([{ spec: taggedSpec("one", { title: "First step" }), el }], {
      guideName: "Tour",
      locale: "en",
      theme: "system",
      onExit,
    });
    expect(el.scrollIntoView).toHaveBeenCalled();
    expect(host()).not.toBeNull();
    expect(pop()?.querySelector(".title")?.textContent).toBe("First step");
    // Single step -> counter "1 / 1", no Skip, primary button is "Done".
    expect(pop()?.querySelector(".count")?.textContent).toBe("1 / 1");
    expect(pop()?.querySelector(".skip")).toBeNull();
    expect(pop()?.querySelector(".next")?.textContent).toBe("Done");
  });

  it("escapes the guide name before innerHTML (RT-C2)", () => {
    const el = mountEl("one");
    const g = new GuideController();
    g.start([{ spec: taggedSpec("one"), el }], {
      guideName: "<img src=x onerror=alert(1)>",
      locale: "en",
      theme: "system",
      onExit: () => {},
    });
    const eyebrow = pop()?.querySelector(".eyebrow span");
    // The raw markup is escaped to text, not parsed into a live element.
    expect(eyebrow?.querySelector("img")).toBeNull();
    expect(eyebrow?.textContent).toContain("<img");
  });

  it("advances Next/Prev and finishes on Done (last step), tearing down + calling onExit once", () => {
    const a = mountEl("a");
    const b = mountEl("b");
    const onExit = vi.fn();
    const g = new GuideController();
    g.start(
      [
        { spec: taggedSpec("a"), el: a },
        { spec: taggedSpec("b"), el: b },
      ],
      {
        guideName: "Tour",
        locale: "en",
        theme: "system",
        onExit,
      },
    );
    expect(pop()?.querySelector(".count")?.textContent).toBe("1 / 2");
    g.next();
    expect(pop()?.querySelector(".count")?.textContent).toBe("2 / 2");
    expect(pop()?.querySelector(".next")?.textContent).toBe("Done");
    // Done (next on the last step) ends the tour.
    g.next();
    expect(host()).toBeNull();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("stop() tears down and fires onExit exactly once (idempotent)", () => {
    const el = mountEl("one");
    const onExit = vi.fn();
    const g = new GuideController();
    g.start([{ spec: taggedSpec("one"), el }], {
      guideName: "Tour",
      locale: "en",
      theme: "system",
      onExit,
    });
    g.stop();
    g.stop();
    expect(host()).toBeNull();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("a zero-step start exits immediately and restores the session", () => {
    const onExit = vi.fn();
    new GuideController().start([], {
      guideName: "Tour",
      locale: "en",
      theme: "system",
      onExit,
    });
    expect(host()).toBeNull();
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
