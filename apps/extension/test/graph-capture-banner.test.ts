import { describe, expect, it } from "vitest";
import { captureBannerState } from "../src/graph/graph-capture-banner.js";

describe("captureBannerState", () => {
  it("is hidden whenever recording is off, regardless of buffer count", () => {
    expect(captureBannerState(false, 0, 10)).toEqual({ kind: "hidden" });
    expect(captureBannerState(false, 5, 10)).toEqual({ kind: "hidden" });
    expect(captureBannerState(false, 10, 10)).toEqual({ kind: "hidden" });
  });

  it("is empty when recording is on but nothing has been captured yet", () => {
    expect(captureBannerState(true, 0, 10)).toEqual({ kind: "empty" });
  });

  it("is active with the current count when recording and below the cap", () => {
    expect(captureBannerState(true, 3, 10)).toEqual({ kind: "active", count: 3 });
  });

  it("is full once the count reaches the cap", () => {
    expect(captureBannerState(true, 10, 10)).toEqual({ kind: "full", cap: 10 });
  });

  it("defaults the cap to MAX_CAPTURE_ENTRIES_PER_PROJECT when omitted", () => {
    expect(captureBannerState(true, 200)).toEqual({ kind: "full", cap: 200 });
    expect(captureBannerState(true, 199)).toEqual({ kind: "active", count: 199 });
  });
});
