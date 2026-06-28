import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { getTheme, setTheme } from "../src/shared/config.js";
import { applyTheme } from "../src/shared/theme.js";

beforeEach(() => {
  fakeBrowser.reset();
});

describe("theme storage", () => {
  it("defaults to system", async () => {
    expect(await getTheme()).toBe("system");
  });

  it("round-trips a forced theme", async () => {
    await setTheme("dark");
    expect(await getTheme()).toBe("dark");
    await setTheme("light");
    expect(await getTheme()).toBe("light");
  });

  it("clears the key when set back to system", async () => {
    await setTheme("dark");
    await setTheme("system");
    expect(await getTheme()).toBe("system");
  });
});

describe("applyTheme", () => {
  it("sets data-theme for a forced theme", () => {
    const el = document.createElement("div");
    applyTheme(el, "dark");
    expect(el.getAttribute("data-theme")).toBe("dark");
    applyTheme(el, "light");
    expect(el.getAttribute("data-theme")).toBe("light");
  });

  it("clears data-theme for system (so the media query governs)", () => {
    const el = document.createElement("div");
    el.dataset.theme = "dark";
    applyTheme(el, "system");
    expect(el.hasAttribute("data-theme")).toBe(false);
  });
});
