import type { Screen, ShotConfig, Spec } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { buildSpecSheetHtml } from "../../src/export/spec-sheet-html.js";

const screen: Screen = { id: "login", name: { en: "Login" }, urlGlob: "/login" };

const pinnedSpec: Spec = {
  id: "login-submit-btn",
  title: { en: "Submit button" },
  description: { en: "Submits the login form" },
  businessRules: [{ en: "Disabled until the form is valid" }],
  fingerprint: {
    cssSelector: "#submit",
    xpath: "//*[@id='submit']",
    domPath: "html>body>button",
    tagName: "button",
    attributes: {},
    positionHint: { index: 0, siblingCount: 1 },
  },
};

const pendingSpec: Spec = {
  id: "login-forgot-link",
  title: { en: "<script>alert(1)</script>" },
  description: { en: 'Click "here" & reset <b>now</b>' },
};

const shot: ShotConfig = {
  version: "1.0.0",
  screenId: "login",
  image: "data:image/png;base64,AAAA",
  items: [
    { itemNo: "1", bbox: { startX: 0, startY: 0, endX: 10, endY: 10 }, specId: pinnedSpec.id },
    { itemNo: "2", bbox: { startX: 20, startY: 20, endX: 30, endY: 30 }, specId: pendingSpec.id },
    { itemNo: "3", bbox: { startX: 40, startY: 40, endX: 50, endY: 50 } },
  ],
};

describe("buildSpecSheetHtml", () => {
  const html = buildSpecSheetHtml(screen, [pinnedSpec, pendingSpec], shot, { locale: "en" });

  it("renders the screen name and the embedded image", () => {
    expect(html).toContain("Login");
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });

  it("renders every numbered callout with its status badge", () => {
    expect(html).toContain('id="item-1"');
    expect(html).toContain("badge-pinned");
    expect(html).toContain('id="item-2"');
    expect(html).toContain("badge-pending");
    expect(html).toContain('id="item-3"');
    expect(html).toContain("badge-unresolved");
  });

  it("renders the full business rules for a pinned spec", () => {
    expect(html).toContain("Disabled until the form is valid");
  });

  it("escapes HTML in author-provided content — no live <script> or unescaped markup", () => {
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;b&gt;now&lt;/b&gt;");
  });

  it("throws when the shot image is a non-image data URL", () => {
    const badShot: ShotConfig = { ...shot, image: "data:text/html,<script>alert(1)</script>" };
    expect(() => buildSpecSheetHtml(screen, [pinnedSpec], badShot, { locale: "en" })).toThrow();
  });
});
