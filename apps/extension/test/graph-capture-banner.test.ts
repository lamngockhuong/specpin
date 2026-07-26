import { describe, expect, it } from "vitest";
import { captureBannerState } from "../src/graph/graph-capture-banner.js";

describe("captureBannerState", () => {
  it("is hidden whenever no project is selected, regardless of recording/count", () => {
    expect(captureBannerState(false, 0, false, 10)).toEqual({ kind: "hidden" });
    expect(captureBannerState(true, 5, false, 10)).toEqual({ kind: "hidden" });
    expect(captureBannerState(true, 10, false, 10)).toEqual({ kind: "hidden" });
  });

  it("is off when a project is selected but its recording is off (opt-in)", () => {
    expect(captureBannerState(false, 0, true, 10)).toEqual({ kind: "off" });
    // Stale buffer contents do not change the off state -- it is about the LIVE
    // per-project record flag, not whether ghost entries still exist.
    expect(captureBannerState(false, 5, true, 10)).toEqual({ kind: "off" });
  });

  it("is empty when recording is on but nothing has been captured yet", () => {
    expect(captureBannerState(true, 0, true, 10)).toEqual({ kind: "empty" });
  });

  it("is active with the current count when recording and below the cap", () => {
    expect(captureBannerState(true, 3, true, 10)).toEqual({ kind: "active", count: 3 });
  });

  it("is full once the count reaches the cap", () => {
    expect(captureBannerState(true, 10, true, 10)).toEqual({ kind: "full", cap: 10 });
  });

  it("defaults the cap to MAX_CAPTURE_ENTRIES_PER_PROJECT when omitted", () => {
    expect(captureBannerState(true, 200, true)).toEqual({ kind: "full", cap: 200 });
    expect(captureBannerState(true, 199, true)).toEqual({ kind: "active", count: 199 });
  });
});
