/**
 * String builder: render a Screen's shot (image + numbered callouts) plus the
 * FULL per-number spec (title/description/businessRules) as a standalone HTML
 * document. All author-provided content is escaped before being embedded —
 * no <script> or attribute breakout can be injected via a spec's title,
 * description, or business rules (security requirement, see phase-04 plan).
 */
import type { Screen, ShotConfig, Spec } from "@specpin/spec-schema";
import { escapeMarkup as escapeHtml } from "./escape.js";
import { buildSpecSheetData, type SpecSheetRow } from "./spec-sheet-data.js";

export interface SpecSheetHtmlOptions {
  locale: string;
  defaultLocale?: string;
}

/** Reject image sources that are not either a plain path or an image/* data URL. */
function assertSafeImage(image: string): void {
  if (image.startsWith("data:") && !image.startsWith("data:image/")) {
    throw new Error("Spec sheet image data URL must be image/*");
  }
}

function rowToHtml(row: SpecSheetRow): string {
  const rules = row.businessRules.length
    ? `<ul>${row.businessRules.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`
    : "";
  const title = escapeHtml(row.title || "(untitled)");
  const description = escapeHtml(row.description || "(no description)");
  return `<section class="spec-item" id="item-${escapeHtml(row.itemNo)}">
  <h3>${escapeHtml(row.itemNo)}. ${title} <span class="badge badge-${row.status}">${row.status}</span></h3>
  <p>${description}</p>
  ${rules}
</section>`;
}

const STYLE = `body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
.shot-image { max-width: 100%; border: 1px solid #ccc; }
.spec-item { border-bottom: 1px solid #eee; padding: 1rem 0; }
.badge { font-size: 0.75rem; padding: 0.1rem 0.4rem; border-radius: 4px; margin-left: 0.5rem; }
.badge-pending { background: #fff3cd; color: #7a5b00; }
.badge-pinned { background: #d1e7dd; color: #0a3622; }
.badge-unresolved { background: #f8d7da; color: #58151c; }`;

/** Render a Screen's spec sheet (image + numbered callouts + full specs) as HTML. */
export function buildSpecSheetHtml(
  screen: Screen,
  specs: Spec[],
  shot: ShotConfig,
  options: SpecSheetHtmlOptions,
): string {
  assertSafeImage(shot.image);
  const data = buildSpecSheetData(screen, specs, shot, options.locale, options.defaultLocale);
  const body = data.rows.map(rowToHtml).join("\n");
  return `<!doctype html>
<html lang="${escapeHtml(options.locale)}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(data.screenName)} — Spec Sheet</title>
<style>${STYLE}</style>
</head>
<body>
<h1>${escapeHtml(data.screenName)}</h1>
<img class="shot-image" src="${escapeHtml(data.image)}" alt="${escapeHtml(data.screenName)} screenshot">
${body}
</body>
</html>`;
}
