import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { initI18n, plural, t } from "../src/i18n/index.js";
import { resolveUiLocale, SUPPORTED } from "../src/i18n/locales.js";
import en from "../src/i18n/messages/en.js";
import vi from "../src/i18n/messages/vi.js";
import { getUiLocale, setUiLocale } from "../src/shared/config.js";

beforeEach(() => {
  fakeBrowser.reset();
  initI18n("en");
});
afterEach(() => {
  initI18n("en");
});

describe("t()", () => {
  it("returns the Vietnamese string when locale is vi", () => {
    initI18n("vi");
    expect(t("common.captureSpec")).toBe(vi["common.captureSpec"]);
  });

  it("returns English when locale is en", () => {
    initI18n("en");
    expect(t("common.captureSpec")).toBe(en["common.captureSpec"]);
  });

  it("substitutes {name} placeholders", () => {
    expect(t("common.specsCountPill", { count: 3 })).toBe("3 specs");
    expect(t("options.added", { project: "Acme" })).toBe('Added "Acme".');
  });

  it("falls back to the raw key when absent from both catalogs", () => {
    // Cast: a deliberately-missing key exercises the final fallback branch.
    expect(t("nope.missing" as never)).toBe("nope.missing");
  });

  it("falls back to English when a key is missing from VI", () => {
    // Simulate a VI gap by removing a key, then asserting English is used.
    const saved = vi["common.noSpecsForPage"];
    delete (vi as Record<string, string>)["common.noSpecsForPage"];
    initI18n("vi");
    expect(t("common.noSpecsForPage")).toBe(en["common.noSpecsForPage"]);
    (vi as Record<string, string>)["common.noSpecsForPage"] = saved;
  });
});

describe("plural()", () => {
  it("picks the one vs other key by count and supplies {count}", () => {
    expect(plural(1, "common.specsFoundOne", "common.specsFoundOther")).toBe("1 spec found");
    expect(plural(5, "common.specsFoundOne", "common.specsFoundOther")).toBe("5 specs found");
  });
});

describe("resolveUiLocale", () => {
  it("uses the stored choice when supported", () => {
    expect(resolveUiLocale("vi")).toBe("vi");
    expect(resolveUiLocale("en")).toBe("en");
  });

  it("defaults to en when nothing is stored and the browser is unsupported", () => {
    // fakeBrowser has no i18n.getUILanguage; navigator.language in jsdom is en-US.
    expect(resolveUiLocale(null)).toBe("en");
  });

  it("only knows the supported locales", () => {
    expect([...SUPPORTED]).toEqual(["en", "vi"]);
  });
});

describe("uiLocale storage", () => {
  it("defaults to null (follow system)", async () => {
    expect(await getUiLocale()).toBeNull();
  });

  it("round-trips a chosen locale", async () => {
    await setUiLocale("vi");
    expect(await getUiLocale()).toBe("vi");
  });

  it("clears the key when set back to null", async () => {
    await setUiLocale("vi");
    await setUiLocale(null);
    expect(await getUiLocale()).toBeNull();
  });
});

describe("catalog parity", () => {
  it("vi covers exactly the en key set", () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
  });
});
