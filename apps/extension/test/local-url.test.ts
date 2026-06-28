import { describe, expect, it } from "vitest";
import { normalizeLocalUrl } from "../src/shared/local-url.js";

describe("normalizeLocalUrl (localhost security guard)", () => {
  it("accepts localhost / 127.0.0.1 with an optional port", () => {
    expect(normalizeLocalUrl("http://127.0.0.1:7591")).toEqual({
      url: "http://127.0.0.1:7591",
      valid: true,
    });
    expect(normalizeLocalUrl("http://localhost:3000")).toEqual({
      url: "http://localhost:3000",
      valid: true,
    });
    expect(normalizeLocalUrl("https://localhost").valid).toBe(true);
  });

  it("trims whitespace and drops trailing slashes before checking", () => {
    expect(normalizeLocalUrl("  http://127.0.0.1:7591//  ")).toEqual({
      url: "http://127.0.0.1:7591",
      valid: true,
    });
  });

  it("rejects a non-localhost host (SSRF/phishing guard)", () => {
    expect(normalizeLocalUrl("https://evil.com").valid).toBe(false);
    expect(normalizeLocalUrl("http://127.0.0.1.evil.com").valid).toBe(false);
    expect(normalizeLocalUrl("http://localhost.evil.com").valid).toBe(false);
    // No path/query allowed (a path could smuggle a different target).
    expect(normalizeLocalUrl("http://localhost:3000/admin").valid).toBe(false);
  });

  it("treats an empty string as not valid (callers handle required-field)", () => {
    expect(normalizeLocalUrl("")).toEqual({ url: "", valid: false });
    expect(normalizeLocalUrl("   ").valid).toBe(false);
  });
});
