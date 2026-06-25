import { describe, expect, it } from "vitest";
import { originMatchesDomains } from "../src/content/orchestrator.js";

describe("originMatchesDomains", () => {
  it("matches when domains empty (any origin)", () => {
    expect(originMatchesDomains("http://localhost:3000", [])).toBe(true);
  });
  it("matches host against configured domains", () => {
    expect(originMatchesDomains("http://localhost:3000", ["localhost:3000"])).toBe(true);
    expect(originMatchesDomains("https://app.acme.io", ["app.acme.io"])).toBe(true);
  });
  it("rejects an unrelated origin", () => {
    expect(originMatchesDomains("https://evil.com", ["app.acme.io"])).toBe(false);
  });

  it("matches true subdomains but rejects look-alikes and path/query injection", () => {
    expect(originMatchesDomains("https://app.acme.io", ["acme.io"])).toBe(true);
    expect(originMatchesDomains("https://evil-acme.io", ["acme.io"])).toBe(false);
    expect(originMatchesDomains("https://acme.io.attacker.com", ["acme.io"])).toBe(false);
    expect(originMatchesDomains("https://attacker.com/?x=acme.io", ["acme.io"])).toBe(false);
  });
});
