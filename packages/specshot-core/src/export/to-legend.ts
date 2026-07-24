/**
 * Export a MarkDoc as a markdown legend for handoff:
 *   - {itemNo}. {label}
 * Empty labels fall back to a Vietnamese placeholder (matches the app's
 * đánh-số workflow). Rows are ordered by itemNo so the legend reads naturally.
 */
import type { MarkDoc } from "../model/mark-doc.js";
import { compareItemNo } from "../model/numbering.js";
import { downloadText, withExtension } from "./download.js";

export const NO_LABEL = "(chưa mô tả)";

export function markDocToLegend(doc: MarkDoc): string {
  return [...doc]
    .sort((a, b) => compareItemNo(a.itemNo, b.itemNo))
    .map((item) => {
      const label = item.label?.trim();
      return `- ${item.itemNo}. ${label || NO_LABEL}`;
    })
    .join("\n");
}

export function exportLegend(doc: MarkDoc, imageName: string): void {
  downloadText(`${markDocToLegend(doc)}\n`, withExtension(imageName, "legend.md"), "text/markdown");
}
