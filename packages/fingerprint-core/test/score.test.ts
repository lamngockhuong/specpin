import type { ElementFingerprint } from "@specpin/spec-schema";
import { afterEach, describe, expect, it } from "vitest";
import {
  CANDIDATE_CAP,
  generateCandidates,
  pickBest,
  rankCandidates,
  scoreCandidate,
  signalScores,
  THRESHOLDS,
  WEIGHTS,
} from "../src/score.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function baseFp(overrides: Partial<ElementFingerprint>): ElementFingerprint {
  return {
    testId: null,
    ariaLabel: null,
    id: null,
    cssSelector: "",
    xpath: "",
    domPath: [],
    tagName: "button",
    textContent: null,
    attributes: {},
    nearbyLabels: [],
    positionHint: { index: 0, siblingCount: 1 },
    ...overrides,
  };
}

/** Render one element and hand it back for scoring. */
function el(html: string): Element {
  document.body.innerHTML = html;
  const node = document.body.firstElementChild;
  if (!node) throw new Error("no element rendered");
  return node;
}

/** Query one descendant, asserting it exists (avoids non-null assertions). */
function q(root: Element, sel: string): Element {
  const node = root.querySelector(sel);
  if (!node) throw new Error(`no ${sel}`);
  return node;
}

/** Assert a nullable value is present, returning it narrowed. */
function must<T>(v: T | null | undefined): T {
  if (v == null) throw new Error("expected a value");
  return v;
}

describe("signalScores — textContent token Jaccard", () => {
  it("scores 1 when tokens match exactly (order-independent)", () => {
    const fp = baseFp({ textContent: "Save changes" });
    expect(signalScores(fp, el(`<button>changes Save</button>`)).textContent).toBe(1);
  });

  it("scores partial overlap by Jaccard", () => {
    const fp = baseFp({ textContent: "save all changes" });
    // candidate "save changes": intersection {save,changes}=2, union {save,all,changes}=3
    expect(signalScores(fp, el(`<button>save changes</button>`)).textContent).toBeCloseTo(2 / 3);
  });

  it("scores 0 when candidate text is empty but fingerprint has text", () => {
    const fp = baseFp({ textContent: "Save" });
    expect(signalScores(fp, el(`<button></button>`)).textContent).toBe(0);
  });
});

describe("signalScores — nearbyLabels Jaccard", () => {
  it("matches a wrapping <label> against stored labels", () => {
    const fp = baseFp({ nearbyLabels: ["Email address"] });
    const node = q(el(`<label>Email address<input type="email" /></label>`), "input");
    expect(signalScores(fp, node).nearbyLabels).toBe(1);
  });

  it("scores 0 when there are no nearby labels on the candidate", () => {
    const fp = baseFp({ nearbyLabels: ["Email"] });
    expect(signalScores(fp, el(`<input type="email" />`)).nearbyLabels).toBe(0);
  });
});

describe("signalScores — attribute fraction", () => {
  it("scores the fraction of whitelisted attrs that match", () => {
    const fp = baseFp({ attributes: { type: "submit", name: "go" } });
    // candidate matches type but not name → 1/2
    expect(signalScores(fp, el(`<button type="submit" name="nope"></button>`)).attributes).toBe(
      0.5,
    );
  });

  it("scores 0 when the fingerprint carries no attributes", () => {
    const fp = baseFp({ attributes: {} });
    expect(signalScores(fp, el(`<button type="submit"></button>`)).attributes).toBe(0);
  });
});

describe("signalScores — tagName", () => {
  it("is 1 on tag match, 0 otherwise", () => {
    const fp = baseFp({ tagName: "button" });
    expect(signalScores(fp, el(`<button></button>`)).tagName).toBe(1);
    expect(signalScores(fp, el(`<a></a>`)).tagName).toBe(0);
  });
});

describe("signalScores — domPath longest-common-suffix ratio", () => {
  it("scores the shared tail over the longer path", () => {
    // stored path form>fieldset>button ; live path form>button (shared tail: button)
    const fp = baseFp({ domPath: ["form", "fieldset", "button"] });
    const node = q(el(`<form><button></button></form>`), "button");
    // live domPath = ["form","button"]; shared suffix = ["button"]=1 over max(3,2)=3
    expect(signalScores(fp, node).domPath).toBeCloseTo(1 / 3);
  });
});

describe("signalScores — positionHint proximity", () => {
  it("is 1 at the same index", () => {
    const fp = baseFp({ positionHint: { index: 1, siblingCount: 3 } });
    const node = q(el(`<div><a></a><button></button><a></a></div>`), "button");
    expect(signalScores(fp, node).positionHint).toBe(1);
  });

  it("decays with index distance", () => {
    const fp = baseFp({ positionHint: { index: 0, siblingCount: 3 } });
    const node = q(el(`<div><a></a><a></a><button></button></div>`), "button");
    // index 2 vs 0, maxSiblings 3 → 1 - 2/3
    expect(signalScores(fp, node).positionHint).toBeCloseTo(1 - 2 / 3);
  });
});

describe("scoreCandidate — applicability normalization", () => {
  it("ignores signals absent from the fingerprint (text-only fp scores on text/tag/pos)", () => {
    // fp carries only text (+ always-on tag/position). A perfect text+tag+pos match → 1.
    const fp = baseFp({
      textContent: "Delete",
      tagName: "button",
      positionHint: { index: 0, siblingCount: 1 },
    });
    const score = scoreCandidate(fp, el(`<button>Delete</button>`));
    expect(score).toBeCloseTo(1);
  });

  it("a wrong-text candidate scores below HIGH", () => {
    const fp = baseFp({ textContent: "Delete account" });
    const score = scoreCandidate(fp, el(`<button>Save profile</button>`));
    expect(score).toBeLessThan(THRESHOLDS.HIGH);
  });

  it("weights table is exported and covers all six signals", () => {
    expect(Object.keys(WEIGHTS).sort()).toEqual(
      ["attributes", "domPath", "nearbyLabels", "positionHint", "tagName", "textContent"].sort(),
    );
  });
});

describe("rankCandidates", () => {
  it("returns candidates best-first with score + signals, no margin/abstain gating", () => {
    document.body.innerHTML = `<button class="row">Archive</button><button class="row">Delete account</button>`;
    const els = Array.from(document.querySelectorAll("button.row"));
    const ranked = rankCandidates(
      baseFp({ textContent: "Delete account", tagName: "button" }),
      els,
    );
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.el.textContent).toBe("Delete account");
    expect(ranked[0]?.score).toBeGreaterThan(must(ranked[1]).score);
    expect(ranked[0]?.signals.textContent).toBe(1);
  });
});

describe("pickBest — margin guard", () => {
  it("returns the clear winner when it beats the runner-up by delta", () => {
    document.body.innerHTML = `
      <ul>
        <li><button class="row">Archive</button></li>
        <li><button class="row">Delete account permanently</button></li>
      </ul>`;
    const els = Array.from(document.querySelectorAll("button.row"));
    const fp = baseFp({ textContent: "Delete account permanently", tagName: "button" });
    const best = pickBest(fp, els);
    expect(best).not.toBeNull();
    expect(must(best).el.textContent).toBe("Delete account permanently");
    expect(must(best).signals.textContent).toBe(1);
  });

  it("returns null when the top two are within delta (never guess a tie)", () => {
    document.body.innerHTML = `<button class="row">Save</button><button class="row">Save</button>`;
    const els = Array.from(document.querySelectorAll("button.row"));
    const fp = baseFp({ textContent: "Save", tagName: "button" });
    expect(pickBest(fp, els)).toBeNull();
  });

  it("a lone candidate wins by default (no runner-up)", () => {
    const node = el(`<button>Only</button>`);
    const best = pickBest(baseFp({ textContent: "Only" }), [node]);
    expect(best?.el).toBe(node);
  });

  it("returns null for an empty candidate set", () => {
    expect(pickBest(baseFp({ textContent: "x" }), [])).toBeNull();
  });

  it("abstains when the fingerprint has no identifying content signal (structure only)", () => {
    document.body.innerHTML = `<button class="row">a</button><button class="row">b</button>`;
    const els = Array.from(document.querySelectorAll("button.row"));
    // tagName + positionHint only — no text/labels/attrs to identify by.
    expect(
      pickBest(baseFp({ tagName: "button", positionHint: { index: 0, siblingCount: 1 } }), els),
    ).toBeNull();
  });

  it("resolves on attributes alone (attributes count as an identifying signal)", () => {
    document.body.innerHTML = `<button type="button">a</button><button type="submit">b</button>`;
    const els = Array.from(document.querySelectorAll("button"));
    const best = pickBest(baseFp({ tagName: "button", attributes: { type: "submit" } }), els);
    expect(best?.el.getAttribute("type")).toBe("submit");
  });
});

describe("generateCandidates", () => {
  it("collects same-tag elements", () => {
    document.body.innerHTML = `<button>a</button><a href="/x">link</a><button>b</button>`;
    const { candidates } = generateCandidates(baseFp({ tagName: "button" }), document);
    expect(candidates.every((el) => el.tagName === "BUTTON")).toBe(true);
    expect(candidates.length).toBe(2);
  });

  it("prioritizes attribute-sharing candidates ahead of the bare-tag scan", () => {
    document.body.innerHTML = `
      <button type="button">first in DOM</button>
      <button type="submit">the target</button>`;
    const fp = baseFp({ tagName: "button", attributes: { type: "submit" } });
    const { candidates } = generateCandidates(fp, document);
    // The submit button is later in the DOM but must rank first (shared attr).
    expect(candidates[0]?.getAttribute("type")).toBe("submit");
  });

  it("enforces the cap and reports how many were considered (no silent truncation)", () => {
    document.body.innerHTML = Array.from({ length: 250 }, () => "<button>x</button>").join("");
    const { candidates, considered } = generateCandidates(
      baseFp({ tagName: "button" }),
      document,
      200,
    );
    expect(candidates.length).toBe(200);
    expect(considered).toBe(250);
    expect(considered).toBeGreaterThan(candidates.length);
  });

  it("exposes a default cap constant", () => {
    expect(CANDIDATE_CAP).toBe(200);
  });
});
