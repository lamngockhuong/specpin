import type { ElementFingerprint } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { isPinned } from "../src/pinned.js";

const fp: ElementFingerprint = {
  cssSelector: "button",
  xpath: "/button",
  domPath: ["button"],
  tagName: "button",
  attributes: {},
  positionHint: { index: 0, siblingCount: 1 },
};

describe("isPinned", () => {
  it("is true when a fingerprint is present", () => {
    expect(isPinned({ id: "a", fingerprint: fp })).toBe(true);
  });

  it("is false for a pending spec (fingerprint absent or null)", () => {
    expect(isPinned({ id: "a" })).toBe(false);
    expect(isPinned({ id: "a", fingerprint: null })).toBe(false);
    expect(isPinned({ id: "a", fingerprint: undefined })).toBe(false);
  });

  it("narrows the type so fingerprint is non-null in the true branch", () => {
    const spec: { id: string; fingerprint?: ElementFingerprint | null } = {
      id: "a",
      fingerprint: fp,
    };
    if (isPinned(spec)) {
      // Compiles only because isPinned narrowed fingerprint to non-null.
      expect(spec.fingerprint.tagName).toBe("button");
    }
  });
});
