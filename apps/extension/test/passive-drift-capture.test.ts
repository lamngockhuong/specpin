import type { ElementFingerprint, Spec } from "@specpin/spec-schema";
import { afterEach, describe, expect, it } from "vitest";
import { renderSession } from "../src/content/orchestrator.js";

afterEach(() => {
  document.body.innerHTML = "";
  document.getElementById("specpin-tooltip-host")?.remove();
});

function fp(over: Partial<ElementFingerprint>): ElementFingerprint {
  return {
    testId: null,
    ariaLabel: null,
    id: null,
    cssSelector: "button.gone",
    xpath: "",
    domPath: [],
    tagName: "button",
    textContent: null,
    attributes: {},
    nearbyLabels: [],
    positionHint: { index: 0, siblingCount: 1 },
    ...over,
  };
}

function spec(id: string, over: Partial<ElementFingerprint>): Spec {
  return { id, title: { en: id }, description: { en: "d" }, fingerprint: fp(over) };
}

/** renderSession with everything defaulted except specs and the drift opt-in. */
function render(specs: Spec[], captureDrift: boolean) {
  return renderSession(
    specs,
    null,
    document,
    "tooltip",
    "en",
    ["en"],
    undefined,
    "https://x.test/settings",
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { captureDrift },
  );
}

describe("renderSession passive drift capture", () => {
  it("captures a snapshot for an orphaned spec (opt-in ON)", () => {
    document.body.innerHTML = `<button type="button">Home</button>`;
    const s = render([spec("orphan", { textContent: "Delete my account permanently" })], true);
    expect(s.drift.length).toBe(1);
    const [entry] = s.drift;
    expect(entry?.kind).toBe("passive");
    expect(entry?.old.textContent).toBe("Delete my account permanently");
    expect(entry?.chosenByScorer).toBeUndefined(); // orphan: scorer abstained
    expect(JSON.stringify(entry)).not.toContain("outerHTML");
  });

  it("captures a MID-scored spec with a tentative chosenByScorer label", () => {
    document.body.innerHTML = `<main><button type="submit">alpha</button></main>`;
    const s = render(
      [
        spec("mid", {
          textContent: "alpha beta",
          attributes: { type: "submit" },
          domPath: ["main", "button"],
        }),
      ],
      true,
    );
    expect(s.drift.length).toBe(1);
    const [entry] = s.drift;
    expect(entry?.kind).toBe("passive");
    expect(entry?.chosenByScorer).toBe(0);
    expect(entry?.candidates.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("records nothing for a healthy exact match", () => {
    document.body.innerHTML = `<button data-testid="save">Save</button>`;
    const s = render([spec("healthy", { testId: "save" })], true);
    expect(s.drift).toEqual([]);
  });

  it("records nothing when the drift opt-in is off (default)", () => {
    document.body.innerHTML = `<button type="button">Home</button>`;
    const s = render([spec("orphan", { textContent: "Delete my account permanently" })], false);
    expect(s.drift).toEqual([]);
  });
});
