import { describe, expect, it } from "vitest";
import { generalizeUrl, isDynamicSegment } from "../src/content/url-generalize.js";
import { matchPathGlob } from "../src/shared/visibility.js";

describe("generalizeUrl", () => {
  it("strips query and hash before anything else -- no token/PII survives", () => {
    const result = generalizeUrl("https://app.example.com/orders/12345?token=abc123#secret");
    expect(result.urlGlob).toBe("/orders/**");
    expect(result.urlGlob).not.toContain("token");
    expect(result.urlGlob).not.toContain("secret");
    expect(result.urlGlob).not.toContain("abc123");
  });

  it("generalizes a single numeric id segment", () => {
    expect(generalizeUrl("https://app/orders/12345").urlGlob).toBe("/orders/**");
  });

  it("generalizes a UUID path segment", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(generalizeUrl(`https://app/users/${uuid}`).urlGlob).toBe("/users/**");
  });

  it("generalizes nested ids independently, keeping literal segments between them", () => {
    expect(generalizeUrl("https://app/a/1/b/2").urlGlob).toBe("/a/**/b/**");
  });

  it("collapses adjacent dynamic segments into a single **", () => {
    expect(generalizeUrl("https://app/12345/67890").urlGlob).toBe("/**");
  });

  it("keeps static, word-like segments literal", () => {
    expect(generalizeUrl("https://app/checkout/confirm").urlGlob).toBe("/checkout/confirm");
  });

  it("handles the root path", () => {
    const result = generalizeUrl("https://app/");
    expect(result.urlGlob).toBe("/");
    expect(result.screenId).toBe("root");
  });

  it("handles an empty path (bare origin, no trailing slash)", () => {
    const result = generalizeUrl("https://app");
    expect(result.urlGlob).toBe("/");
    expect(result.screenId).toBe("root");
  });

  it("normalizes a trailing slash on a non-root path", () => {
    expect(generalizeUrl("https://app/orders/").urlGlob).toBe("/orders");
  });

  it("never throws on malformed input and returns a safe root default", () => {
    expect(() => generalizeUrl("")).not.toThrow();
    expect(() => generalizeUrl(":::not a url:::")).not.toThrow();
    // biome-ignore lint/suspicious/noExplicitAny: exercising defensive non-string input
    expect(() => generalizeUrl(null as any)).not.toThrow();
    // biome-ignore lint/suspicious/noExplicitAny: exercising defensive non-string input
    expect(() => generalizeUrl(undefined as any)).not.toThrow();
    expect(generalizeUrl("").urlGlob).toBe("/");
  });

  it("bounds pathological input length instead of degrading unbounded", () => {
    const huge = `https://app/${"a".repeat(10_000)}`;
    expect(() => generalizeUrl(huge)).not.toThrow();
  });

  it("resolves a bare path (no scheme/host) rather than throwing", () => {
    expect(generalizeUrl("/orders/12345?token=x").urlGlob).toBe("/orders/**");
  });

  it("derives a stable screenId: same glob -> same id, always", () => {
    const a = generalizeUrl("https://app/orders/1");
    const b = generalizeUrl("https://app/orders/999999");
    expect(a.screenId).toBe(b.screenId);
    expect(a.urlGlob).toBe(b.urlGlob);
  });

  it("derives distinct screenIds for distinct glob shapes", () => {
    const orders = generalizeUrl("https://app/orders/1");
    const deals = generalizeUrl("https://app/deals/1");
    expect(orders.screenId).not.toBe(deals.screenId);
  });

  it("does not collide a literal path with its generalized child path", () => {
    // Regression: slugify alone strips both "/" and "**" the same way, which
    // would otherwise make "/orders" and "/orders/**" slug to the same
    // "orders" -- merging a list screen and its detail screen into one node.
    const list = generalizeUrl("https://app/orders");
    const detail = generalizeUrl("https://app/orders/12345");
    expect(list.urlGlob).toBe("/orders");
    expect(detail.urlGlob).toBe("/orders/**");
    expect(list.screenId).not.toBe(detail.screenId);
  });

  describe("round-trips through the real matchPathGlob", () => {
    const cases = [
      "https://app/",
      "https://app/orders/12345",
      "https://app/orders/12345?token=abc#x",
      "https://app/users/550e8400-e29b-41d4-a716-446655440000",
      "https://app/a/1/b/2",
      "https://app/checkout/confirm",
      "https://app/orders/",
      "https://app/blog/page-2",
      "https://app/deals/new",
    ];

    for (const rawUrl of cases) {
      it(`matches its originating path: ${rawUrl}`, () => {
        const path = new URL(rawUrl).pathname;
        const { urlGlob } = generalizeUrl(rawUrl);
        expect(matchPathGlob(urlGlob, path)).toBe(true);
      });
    }
  });

  it("generalizes a short mixed-alnum ticket code (id, not a static word)", () => {
    expect(generalizeUrl("https://app/tickets/ab12").urlGlob).toBe("/tickets/**");
  });

  it("generalizes a short mixed-alnum code in a single-letter segment path", () => {
    expect(generalizeUrl("https://app/i/x7k9").urlGlob).toBe("/i/**");
  });
});

describe("isDynamicSegment", () => {
  it("treats all-digit segments as dynamic", () => {
    expect(isDynamicSegment("12345")).toBe(true);
    expect(isDynamicSegment("0")).toBe(true);
  });

  it("treats a UUID as dynamic", () => {
    expect(isDynamicSegment("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("treats a long hex token as dynamic (e.g. a Mongo ObjectId)", () => {
    expect(isDynamicSegment("507f1f77bcf86cd799439011")).toBe(true);
  });

  it("treats a long base62-ish token containing a digit as dynamic", () => {
    expect(isDynamicSegment("aZ9k2Lp8mQ3vX7t1")).toBe(true);
  });

  it("treats a shorter mixed alnum+digit segment as dynamic (conservative bias)", () => {
    expect(isDynamicSegment("invoice2024")).toBe(true);
    expect(isDynamicSegment("page-2")).toBe(true);
  });

  it("treats a short (4-5 char) mixed alnum+digit id-like code as dynamic", () => {
    expect(isDynamicSegment("ab12")).toBe(true);
    expect(isDynamicSegment("x7k9")).toBe(true);
  });

  it("keeps short pure-letter segments literal (static route words)", () => {
    expect(isDynamicSegment("checkout")).toBe(false);
    expect(isDynamicSegment("orders")).toBe(false);
    expect(isDynamicSegment("confirm")).toBe(false);
    expect(isDynamicSegment("v2")).toBe(false);
  });

  it("keeps a short static hyphenated word literal", () => {
    expect(isDynamicSegment("user-profile")).toBe(false);
  });

  it("returns false for an empty segment", () => {
    expect(isDynamicSegment("")).toBe(false);
  });
});
