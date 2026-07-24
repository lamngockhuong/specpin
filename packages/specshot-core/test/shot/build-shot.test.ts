import { validateShot } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import type { MarkDoc } from "../../src/model/mark-doc.js";
import { buildShot, DEFAULT_SHOT_VERSION } from "../../src/shot/build-shot.js";

const doc: MarkDoc = [
  { itemNo: "1", position: { startX: 0, startY: 0, endX: 100, endY: 50 } },
  { itemNo: "1.1", position: { startX: 10, startY: 10, endX: 40, endY: 30 } },
];

describe("buildShot", () => {
  it("builds a ShotConfig that passes validateShot", () => {
    const result = buildShot(doc, { screenId: "login", image: "data:image/png;base64,AAAA" });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.shot).not.toBeNull();
    expect(validateShot(result.shot).valid).toBe(true);
  });

  it("stamps the default version when none is given", () => {
    const result = buildShot(doc, { screenId: "login", image: "shot.png" });
    expect(result.shot?.version).toBe(DEFAULT_SHOT_VERSION);
  });

  it("honors a custom version", () => {
    const result = buildShot(doc, { screenId: "login", image: "shot.png", version: "2.0.0" });
    expect(result.shot?.version).toBe("2.0.0");
  });

  it("maps each MarkItem.position onto a ShotItem.bbox 1:1", () => {
    const result = buildShot(doc, { screenId: "login", image: "shot.png" });
    expect(result.shot?.items).toEqual([
      { itemNo: "1", bbox: { startX: 0, startY: 0, endX: 100, endY: 50 } },
      { itemNo: "1.1", bbox: { startX: 10, startY: 10, endX: 40, endY: 30 } },
    ]);
  });

  it("attaches specId only for itemNos present in the mapping", () => {
    const specIds = new Map([["1", "login-submit-btn"]]);
    const result = buildShot(doc, { screenId: "login", image: "shot.png", specIds });
    expect(result.shot?.items[0]).toMatchObject({ specId: "login-submit-btn" });
    expect(result.shot?.items[1]?.specId).toBeUndefined();
  });

  it("returns invalid with errors for a negative bbox coordinate", () => {
    const negative: MarkDoc = [
      { itemNo: "1", position: { startX: -5, startY: 0, endX: 10, endY: 10 } },
    ];
    const result = buildShot(negative, { screenId: "login", image: "shot.png" });
    expect(result.valid).toBe(false);
    expect(result.shot).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns invalid for an empty screenId", () => {
    const result = buildShot(doc, { screenId: "", image: "shot.png" });
    expect(result.valid).toBe(false);
    expect(result.shot).toBeNull();
  });
});
