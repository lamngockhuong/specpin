import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Screen, ShotConfig, Spec } from "@specpin/spec-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

const buildShotMock = vi.fn();
const buildSpecSheetHtmlMock = vi.fn(() => "<html>sheet</html>");
const buildSpecSheetMdMock = vi.fn(() => "# sheet");
const downloadTextMock = vi.fn();

vi.mock("@specpin/specshot-core", async () => {
  const actual =
    await vi.importActual<typeof import("@specpin/specshot-core")>("@specpin/specshot-core");
  return {
    ...actual,
    buildShot: buildShotMock,
    buildSpecSheetHtml: buildSpecSheetHtmlMock,
    buildSpecSheetMd: buildSpecSheetMdMock,
    downloadText: downloadTextMock,
  };
});

const {
  buildAdHocScreen,
  buildShotForExport,
  downloadShotJson,
  downloadSpecSheetHtml,
  downloadSpecSheetMd,
  toDataUrl,
} = await import("../../src/export/export-actions.js");

const doc = [{ itemNo: "1", position: { startX: 0, startY: 0, endX: 10, endY: 10 }, _key: "k1" }];
const specIds = new Map([["1", "login-submit-btn"]]);

const shot: ShotConfig = {
  version: "1.0.0",
  screenId: "login",
  image: "data:image/png;base64,AAAA",
  items: [],
};

const screen: Screen = { id: "login", name: { en: "Login" }, urlGlob: "*" };
const specs: Spec[] = [
  { id: "login-submit-btn", title: { en: "Submit" }, description: { en: "d" } },
];

beforeEach(() => {
  buildShotMock.mockReset();
  buildSpecSheetHtmlMock.mockClear();
  buildSpecSheetMdMock.mockClear();
  downloadTextMock.mockClear();
  buildShotMock.mockReturnValue({ valid: true, shot, errors: [] });
});

describe("buildShotForExport", () => {
  it("delegates to specshot-core's buildShot with the right args", () => {
    const result = buildShotForExport({ doc, screenId: "login", image: shot.image, specIds });
    expect(buildShotMock).toHaveBeenCalledWith(doc, {
      screenId: "login",
      image: shot.image,
      specIds,
    });
    expect(result.shot).toBe(shot);
  });
});

describe("buildAdHocScreen", () => {
  it("builds a minimal valid Screen for offline export (no sidecar needed)", () => {
    const built = buildAdHocScreen("login", "Login screen", "en");
    expect(built).toEqual({ id: "login", name: { en: "Login screen" }, urlGlob: "*" });
  });

  it("falls back to the screenId when no display name was entered", () => {
    const built = buildAdHocScreen("login", "", "en");
    expect(built.name).toEqual({ en: "login" });
  });
});

describe("download actions", () => {
  it("downloadShotJson downloads the shot as pretty JSON, named by screenId", () => {
    downloadShotJson(shot);
    expect(downloadTextMock).toHaveBeenCalledWith(
      JSON.stringify(shot, null, 2),
      "login.shot.json",
      "application/json",
    );
  });

  it("downloadSpecSheetHtml calls buildSpecSheetHtml with the right args and downloads it", () => {
    downloadSpecSheetHtml({ screen, specs, shot, locale: "en" });
    expect(buildSpecSheetHtmlMock).toHaveBeenCalledWith(screen, specs, shot, {
      locale: "en",
      defaultLocale: undefined,
    });
    expect(downloadTextMock).toHaveBeenCalledWith(
      "<html>sheet</html>",
      "login.spec-sheet.html",
      "text/html",
    );
  });

  it("downloadSpecSheetMd calls buildSpecSheetMd with the right args and downloads it", () => {
    downloadSpecSheetMd({ screen, specs, shot, locale: "en", defaultLocale: "en" });
    expect(buildSpecSheetMdMock).toHaveBeenCalledWith(screen, specs, shot, {
      locale: "en",
      defaultLocale: "en",
    });
    expect(downloadTextMock).toHaveBeenCalledWith(
      "# sheet",
      "login.spec-sheet.md",
      "text/markdown",
    );
  });

  it("never imports @specpin/api-client (offline export needs no sidecar)", () => {
    const path = resolve(process.cwd(), "src/export/export-actions.ts");
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(/from ["']@specpin\/api-client["']/);
  });
});

describe("toDataUrl", () => {
  it("reads an ImageSource's blob URL back into a data: URL", async () => {
    const blob = new Blob(["hello"], { type: "image/png" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(blob)),
    );

    const url = await toDataUrl({
      bitmapUrl: "blob:fake",
      width: 10,
      height: 10,
      kind: "raster",
      name: "shot.png",
    });

    expect(url.startsWith("data:")).toBe(true);
    vi.unstubAllGlobals();
  });
});
