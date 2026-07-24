import type { Screen, ShotConfig, Spec } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { buildSpecSheetMd } from "../../src/export/spec-sheet-md.js";

const screen: Screen = { id: "login", name: { en: "Login" }, urlGlob: "/login" };

const pendingSpec: Spec = {
  id: "login-forgot-link",
  title: { en: "Forgot password link" },
  description: { en: "Navigates to the password reset flow" },
  businessRules: [{ en: "Only visible when the account has an email on file" }],
};

const shot: ShotConfig = {
  version: "1.0.0",
  screenId: "login",
  image: "screenshot.png",
  items: [
    { itemNo: "1", bbox: { startX: 0, startY: 0, endX: 10, endY: 10 }, specId: pendingSpec.id },
    { itemNo: "2", bbox: { startX: 20, startY: 20, endX: 30, endY: 30 } },
  ],
};

describe("buildSpecSheetMd", () => {
  const md = buildSpecSheetMd(screen, [pendingSpec], shot, { locale: "en" });

  it("starts with the screen name heading and embeds the image", () => {
    expect(md.startsWith("# Login")).toBe(true);
    expect(md).toContain("![Login](screenshot.png)");
  });

  it("renders a section per numbered callout with its status", () => {
    expect(md).toContain("### 1. Forgot password link `[pending]`");
    expect(md).toContain("### 2. (untitled) `[unresolved]`");
  });

  it("renders business rules as a bullet list", () => {
    expect(md).toContain("- Only visible when the account has an email on file");
  });

  it("orders rows by itemNo and ends with a trailing newline", () => {
    const idx1 = md.indexOf("### 1.");
    const idx2 = md.indexOf("### 2.");
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThan(idx1);
    expect(md.endsWith("\n")).toBe(true);
  });
});
