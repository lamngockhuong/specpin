import { describe, expect, it } from "vitest";
import { deriveTransition } from "../src/content/derive-transition.js";

describe("deriveTransition", () => {
  it("derives a transition between a literal list screen and its generalized detail screen", () => {
    // "/orders" (literal) and "/orders/12345" (generalized to "/orders/**")
    // must NOT collide onto the same screenId even though slugify alone
    // would strip both "/" and "**" the same way -- this is the fix for
    // that collision, pinned here as a regression test.
    const t = deriveTransition("https://app/orders", "https://app/orders/12345");
    expect(t).not.toBeNull();
    expect(t?.from).not.toBe(t?.to);
  });

  it("derives a transition between two clearly distinct screens", () => {
    const t = deriveTransition("https://app/orders/12345", "https://app/deals/new");
    expect(t).not.toBeNull();
    expect(t?.from).toBe("orders-star");
    expect(t?.to).toBe("deals-new");
    expect(t?.id).toBe("orders-star__deals-new");
    expect(t?.source).toBe("auto-captured");
    expect(t?.trigger).toEqual({ en: "navigation" });
  });

  it("returns null for a self-navigation (query-only change on the same screen)", () => {
    const t = deriveTransition(
      "https://app/orders/12345?tab=details",
      "https://app/orders/12345?tab=history",
    );
    expect(t).toBeNull();
  });

  it("returns null for a self-navigation across two different dynamic ids on the same route shape", () => {
    const t = deriveTransition("https://app/orders/111", "https://app/orders/222");
    expect(t).toBeNull();
  });

  it("emits a self-transition when opts.allowSelf is set", () => {
    const t = deriveTransition("https://app/orders/111", "https://app/orders/222", {
      allowSelf: true,
    });
    expect(t).not.toBeNull();
    expect(t?.from).toBe(t?.to);
    expect(t?.id).toBe(`${t?.from}__${t?.to}`);
  });

  it("never throws on malformed URLs", () => {
    expect(() => deriveTransition("", "")).not.toThrow();
    expect(() => deriveTransition(":::bad:::", "https://app/orders/1")).not.toThrow();
  });

  it("is deterministic: identical navigation sequences derive identical (deduped) ids", () => {
    const first = deriveTransition("https://app/orders/1", "https://app/deals/2");
    const second = deriveTransition("https://app/orders/999", "https://app/deals/888");
    expect(first?.id).toBe(second?.id);
    expect(first?.from).toBe(second?.from);
    expect(first?.to).toBe(second?.to);
  });

  it("keeps distinct navigation shapes distinct", () => {
    const ordersToCheckout = deriveTransition("https://app/orders/1", "https://app/checkout");
    const dealsToCheckout = deriveTransition("https://app/deals/1", "https://app/checkout");
    expect(ordersToCheckout?.id).not.toBe(dealsToCheckout?.id);
  });
});
