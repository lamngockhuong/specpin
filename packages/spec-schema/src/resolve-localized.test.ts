import { describe, expect, it } from "vitest";
import { resolveLocalized, resolveLocalizedList } from "./resolve-localized.js";

describe("resolveLocalized", () => {
  it("returns the exact locale when present", () => {
    expect(resolveLocalized({ en: "Login", vi: "Đăng nhập" }, "vi", "en")).toBe("Đăng nhập");
  });

  it("falls back to defaultLocale when the locale is missing", () => {
    expect(resolveLocalized({ en: "Login" }, "vi", "en")).toBe("Login");
  });

  it("falls back to the first present value when locale and defaultLocale are both absent", () => {
    expect(resolveLocalized({ fr: "Connexion" }, "vi", "en")).toBe("Connexion");
  });

  it("returns '' for undefined, empty, or non-object input", () => {
    expect(resolveLocalized(undefined, "en", "en")).toBe("");
    expect(resolveLocalized({}, "en", "en")).toBe("");
    expect(resolveLocalized("Login" as unknown as Record<string, string>, "en")).toBe("");
  });

  it("never returns a prototype-pollution key value", () => {
    const crafted = JSON.parse('{"__proto__":"evil"}') as Record<string, string>;
    expect(resolveLocalized(crafted, "__proto__", "__proto__")).toBe("");
    // The only key is forbidden, so the first-own-value scan yields "" too.
    const onlyForbidden = JSON.parse('{"constructor":"evil"}') as Record<string, string>;
    expect(resolveLocalized(onlyForbidden, "en", "en")).toBe("");
  });

  it("ignores non-string values", () => {
    const bad = { en: 123 } as unknown as Record<string, string>;
    expect(resolveLocalized(bad, "en", "en")).toBe("");
  });
});

describe("resolveLocalizedList", () => {
  it("resolves each item with fallback", () => {
    const items = [{ en: "Rule A", vi: "Quy tắc A" }, { en: "Rule B" }];
    expect(resolveLocalizedList(items, "vi", "en")).toEqual(["Quy tắc A", "Rule B"]);
  });

  it("drops items that resolve to '' (partly translated list)", () => {
    const items = [{ en: "Kept" }, { fr: "" } as unknown as Record<string, string>];
    expect(resolveLocalizedList(items, "en", "en")).toEqual(["Kept"]);
  });

  it("returns [] for undefined", () => {
    expect(resolveLocalizedList(undefined, "en", "en")).toEqual([]);
  });
});
