/**
 * String builder: render a Screen's shot (image + numbered callouts) plus the
 * FULL per-number spec (title/description/businessRules) as markdown. Extends
 * the `to-legend.ts` idea (one line per mark) with the complete spec body per
 * number, grouped under the Screen's localized name.
 */
import type { Screen, ShotConfig, Spec } from "@specpin/spec-schema";
import { buildSpecSheetData, type SpecSheetRow } from "./spec-sheet-data.js";

export interface SpecSheetMdOptions {
  locale: string;
  defaultLocale?: string;
}

function rowToMd(row: SpecSheetRow): string {
  const lines = [
    `### ${row.itemNo}. ${row.title || "(untitled)"} \`[${row.status}]\``,
    "",
    row.description || "(no description)",
  ];
  if (row.businessRules.length) {
    lines.push("", ...row.businessRules.map((r) => `- ${r}`));
  }
  return lines.join("\n");
}

/** Render a Screen's spec sheet (image + numbered callouts + full specs) as markdown. */
export function buildSpecSheetMd(
  screen: Screen,
  specs: Spec[],
  shot: ShotConfig,
  options: SpecSheetMdOptions,
): string {
  const data = buildSpecSheetData(screen, specs, shot, options.locale, options.defaultLocale);
  const header = `# ${data.screenName}\n\n![${data.screenName}](${data.image})`;
  const body = data.rows.map(rowToMd).join("\n\n");
  return `${header}\n\n${body}\n`;
}
