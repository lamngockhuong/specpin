import { afterEach, describe, expect, it } from "vitest";
import { matchElement } from "../src/match.js";

afterEach(() => {
  document.body.innerHTML = "";
});

// A pending (unpinned) spec has no fingerprint yet: it was authored before the
// UI existed. matchElement must tolerate an absent fingerprint (undefined/null)
// and return a clean no-match rather than throwing on property access.
describe("matchElement with an absent fingerprint (pending spec)", () => {
  it("returns a no-match for undefined without throwing", () => {
    document.body.innerHTML = `<button data-testid="anything">x</button>`;
    const r = matchElement(undefined, document);
    expect(r.el).toBeNull();
    expect(r.strategy).toBe("none");
    expect(r.needsReview).toBe(true);
    expect(r.confidence).toBe(0);
  });

  it("returns a no-match for null without throwing", () => {
    const r = matchElement(null, document);
    expect(r.el).toBeNull();
    expect(r.anchor).toBeNull();
  });
});
