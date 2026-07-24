/**
 * Export orchestration: build the ShotConfig from the current MarkDoc +
 * itemNo->specId map (specshot-core's `buildShot`), then render + download
 * the spec sheet HTML/MD/JSON. Pure glue over specshot-core builders — no
 * new domain logic. Every function here works with zero network access, so
 * the offline success metric ("export without a sidecar running") holds by
 * construction: nothing in this module touches @specpin/api-client.
 */

import type { Screen, ShotConfig, Spec } from "@specpin/spec-schema";
import {
  type BuildShotResult,
  buildShot,
  buildSpecSheetHtml,
  buildSpecSheetMd,
  downloadText,
  type ImageSource,
} from "@specpin/specshot-core";
import type { MarkDoc } from "../state/editor-store.js";

/** btoa expects a binary string; chunk the conversion so a large screenshot
 *  doesn't blow the call stack via `String.fromCharCode(...bytes)`. */
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Read an ImageSource's bitmap into a portable `data:` URL for the shot
 * artifact. `ImageSource.bitmapUrl` is a `blob:`/object URL scoped to the
 * current page session — a shot/export must not persist that ephemeral
 * reference (it would 404 the moment the tab closes), so this reads the
 * bytes back and re-encodes them as base64. Uses `fetch`+`arrayBuffer`+`btoa`
 * (not `FileReader`, which some test/runtime environments omit) — all
 * standard, portable Web APIs. Works fully offline: `fetch` on a `blob:` URL
 * never touches the network.
 */
export async function toDataUrl(source: ImageSource): Promise<string> {
  const res = await fetch(source.bitmapUrl);
  const blob = await res.blob();
  const buffer = await blob.arrayBuffer();
  const mime = blob.type || (source.kind === "svg" ? "image/svg+xml" : "image/png");
  return `data:${mime};base64,${bytesToBase64(new Uint8Array(buffer))}`;
}

export interface BuildShotForExportParams {
  doc: MarkDoc;
  screenId: string;
  /** The screenshot: a data: URL (embedded) or a relative path. */
  image: string;
  /** itemNo -> specId, from `itemNoSpecIdMap(editorState)`. */
  specIds: Map<string, string>;
}

/** Build + validate the ShotConfig for the current authoring session. */
export function buildShotForExport(params: BuildShotForExportParams): BuildShotResult {
  return buildShot(params.doc, {
    screenId: params.screenId,
    image: params.image,
    specIds: params.specIds,
  });
}

/** Build a minimal, valid, in-memory Screen for offline export (no screens.json write). */
export function buildAdHocScreen(screenId: string, screenName: string, locale: string): Screen {
  return {
    id: screenId,
    name: { [locale]: screenName || screenId },
    urlGlob: "*",
  };
}

export function downloadShotJson(shot: ShotConfig): void {
  downloadText(JSON.stringify(shot, null, 2), `${shot.screenId}.shot.json`, "application/json");
}

export interface DownloadSpecSheetParams {
  screen: Screen;
  specs: Spec[];
  shot: ShotConfig;
  locale: string;
  defaultLocale?: string;
}

export function downloadSpecSheetHtml(params: DownloadSpecSheetParams): void {
  const html = buildSpecSheetHtml(params.screen, params.specs, params.shot, {
    locale: params.locale,
    defaultLocale: params.defaultLocale,
  });
  downloadText(html, `${params.screen.id}.spec-sheet.html`, "text/html");
}

export function downloadSpecSheetMd(params: DownloadSpecSheetParams): void {
  const md = buildSpecSheetMd(params.screen, params.specs, params.shot, {
    locale: params.locale,
    defaultLocale: params.defaultLocale,
  });
  downloadText(md, `${params.screen.id}.spec-sheet.md`, "text/markdown");
}
