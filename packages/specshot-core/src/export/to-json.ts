/** Export a MarkDoc as the shared-contract JSON (round-trips with import). */
import { type MarkDoc, serializeMarkDoc } from "../model/mark-doc.js";
import { downloadText, withExtension } from "./download.js";

export function markDocToJson(doc: MarkDoc): string {
  return serializeMarkDoc(doc);
}

export function exportJson(doc: MarkDoc, imageName: string): void {
  downloadText(markDocToJson(doc), withExtension(imageName, "json"), "application/json");
}
