import { describe, expect, it } from "vitest";
import { normalizeSidecarUrl } from "../src/shared/local-url.js";

describe("normalizeSidecarUrl (sidecar URL guard)", () => {
  it("accepts localhost / 127.0.0.1 with http or https and an optional port", () => {
    expect(normalizeSidecarUrl("http://127.0.0.1:7591")).toEqual({
      url: "http://127.0.0.1:7591",
      valid: true,
      isRemote: false,
    });
    expect(normalizeSidecarUrl("http://localhost:3000")).toEqual({
      url: "http://localhost:3000",
      valid: true,
      isRemote: false,
    });
    expect(normalizeSidecarUrl("https://localhost")).toEqual({
      url: "https://localhost",
      valid: true,
      isRemote: false,
    });
  });

  it("accepts a remote host only over https, flagged isRemote", () => {
    // Previously rejected (localhost-only); now a valid remote endpoint.
    expect(normalizeSidecarUrl("https://specs.example.com")).toEqual({
      url: "https://specs.example.com",
      valid: true,
      isRemote: true,
    });
    expect(normalizeSidecarUrl("https://specs.example.com:8443").valid).toBe(true);
    // Documented residual SSRF posture: remote https may resolve to a private /
    // metadata address. It is accepted (user-pasted + permission-gated), not
    // silently blocked. Codify the verdict so a future "block it" is a choice.
    expect(normalizeSidecarUrl("https://192.168.1.50")).toEqual({
      url: "https://192.168.1.50",
      valid: true,
      isRemote: true,
    });
  });

  it("rejects a remote host over plaintext http (mixed content)", () => {
    const r = normalizeSidecarUrl("http://specs.example.com");
    expect(r.valid).toBe(false);
    // isRemote still reflects intent so the UI can show the "remote needs https" hint.
    expect(r.isRemote).toBe(true);
  });

  it("trims whitespace and drops trailing slashes before checking", () => {
    expect(normalizeSidecarUrl("  http://127.0.0.1:7591//  ")).toEqual({
      url: "http://127.0.0.1:7591",
      valid: true,
      isRemote: false,
    });
  });

  it("rejects localhost look-alike hosts (SSRF/phishing guard)", () => {
    // A host that merely looks like localhost is NOT localhost: rejected over
    // plaintext (and would only ever be a remote https endpoint otherwise).
    expect(normalizeSidecarUrl("http://127.0.0.1.evil.com").valid).toBe(false);
    expect(normalizeSidecarUrl("http://localhost.evil.com").valid).toBe(false);
  });

  it("rejects userinfo that could mask the real host", () => {
    // http://127.0.0.1@evil.com actually targets evil.com.
    expect(normalizeSidecarUrl("http://127.0.0.1@evil.com").valid).toBe(false);
    expect(normalizeSidecarUrl("https://user:pass@specs.example.com").valid).toBe(false);
  });

  it("rejects a path/query/fragment (could smuggle a different target)", () => {
    expect(normalizeSidecarUrl("http://localhost:3000/admin").valid).toBe(false);
    expect(normalizeSidecarUrl("https://specs.example.com/a?b=1").valid).toBe(false);
    expect(normalizeSidecarUrl("https://specs.example.com/#x").valid).toBe(false);
  });

  it("rejects non-http(s) schemes", () => {
    expect(normalizeSidecarUrl("file:///etc/passwd").valid).toBe(false);
    expect(normalizeSidecarUrl("ftp://localhost").valid).toBe(false);
  });

  it("treats an empty string as not valid (callers handle required-field)", () => {
    expect(normalizeSidecarUrl("")).toEqual({ url: "", valid: false, isRemote: false });
    expect(normalizeSidecarUrl("   ").valid).toBe(false);
  });
});
