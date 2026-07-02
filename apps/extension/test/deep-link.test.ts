import { describe, expect, it } from "vitest";
import { buildSpecLink, parseSpecLink, SPEC_HASH_KEY } from "../src/shared/deep-link.js";

describe("buildSpecLink", () => {
  it("appends the specpin fragment to a bare page URL", () => {
    expect(buildSpecLink("https://app.example/orders", "login-btn")).toBe(
      "https://app.example/orders#specpin=login-btn",
    );
  });

  it("preserves the path and query, only touching the fragment", () => {
    expect(buildSpecLink("https://app.example/orders?tab=open", "s1")).toBe(
      "https://app.example/orders?tab=open#specpin=s1",
    );
  });

  it("preserves an app-owned fragment segment", () => {
    const link = buildSpecLink("https://app.example/p#view=grid", "s1");
    expect(link).toBe("https://app.example/p#view=grid&specpin=s1");
    // The app segment is still readable and the id round-trips.
    expect(link).toContain("view=grid");
    expect(parseSpecLink(link)).toBe("s1");
  });

  it("keeps a value-less hash-route segment intact", () => {
    const link = buildSpecLink("https://app.example/#/dashboard", "s2");
    expect(link).toContain("/dashboard");
    expect(parseSpecLink(link)).toBe("s2");
  });

  it("replaces an existing specpin segment instead of duplicating it", () => {
    const link = buildSpecLink("https://app.example/p#specpin=old", "new");
    expect(link).toBe("https://app.example/p#specpin=new");
    expect(link.match(new RegExp(SPEC_HASH_KEY, "g"))).toHaveLength(1);
  });

  it("percent-encodes ids with reserved characters and round-trips them", () => {
    const id = "orders/edit id";
    const link = buildSpecLink("https://app.example/p", id);
    expect(link).toContain("specpin=orders%2Fedit%20id");
    expect(parseSpecLink(link)).toBe(id);
  });

  it("returns the input unchanged when it is not a parseable URL", () => {
    expect(buildSpecLink("not a url", "s1")).toBe("not a url");
  });
});

describe("parseSpecLink", () => {
  it("extracts the id from a full URL", () => {
    expect(parseSpecLink("https://app.example/p#specpin=abc")).toBe("abc");
  });

  it("extracts the id from a bare fragment string", () => {
    expect(parseSpecLink("#specpin=abc")).toBe("abc");
    expect(parseSpecLink("specpin=abc")).toBe("abc");
  });

  it("returns null when there is no fragment", () => {
    expect(parseSpecLink("https://app.example/p")).toBeNull();
  });

  it("returns null for an unrelated fragment", () => {
    expect(parseSpecLink("https://app.example/p#/some/route")).toBeNull();
    expect(parseSpecLink("https://app.example/p#view=grid")).toBeNull();
  });

  it("finds the specpin segment among other fragment pairs", () => {
    expect(parseSpecLink("https://app.example/p#view=grid&specpin=x&t=1")).toBe("x");
  });

  it("returns an empty string when the key is present with no value", () => {
    expect(parseSpecLink("https://app.example/p#specpin")).toBe("");
  });

  it("returns null on malformed percent-encoding rather than throwing", () => {
    expect(parseSpecLink("https://app.example/p#specpin=%E0%A4%A")).toBeNull();
  });
});
