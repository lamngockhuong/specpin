import { describe, expect, it } from "vitest";
import {
  isLocalConnectionId,
  LOCAL_CONN_PREFIX,
  localBatchId,
  localConnId,
} from "../src/shared/local-id.js";

describe("local connection id predicate", () => {
  it("treats only a manual:<id> tag as local (prefix-only)", () => {
    expect(isLocalConnectionId("manual:abc")).toBe(true);
    expect(isLocalConnectionId(`${LOCAL_CONN_PREFIX}123e4567`)).toBe(true);
    // The bare legacy "manual" is NOT local: it is a valid arbitrary sidecar id,
    // and treating it as local would misroute writes.
    expect(isLocalConnectionId("manual")).toBe(false);
    // A real sidecar id (uuid / "default") is never local.
    expect(isLocalConnectionId("123e4567-e89b-12d3-a456-426614174000")).toBe(false);
    expect(isLocalConnectionId("default")).toBe(false);
    expect(isLocalConnectionId("")).toBe(false);
  });

  it("round-trips a batch id through localConnId / localBatchId", () => {
    expect(localConnId("abc")).toBe("manual:abc");
    expect(localBatchId("manual:abc")).toBe("abc");
    // A non-local id yields null so callers must null-check before lookup.
    expect(localBatchId("manual")).toBeNull();
    expect(localBatchId("some-uuid")).toBeNull();
  });
});
