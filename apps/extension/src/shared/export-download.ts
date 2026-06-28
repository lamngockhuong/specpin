import { downloadZip } from "./download.js";
import { exportZipName } from "./export-bundle.js";
import type { ExportBundle } from "./messaging.js";
import { zipStore } from "./zip-store.js";

// Surface glue: turn the background's reconstructed export bundles into one
// downloaded `<project>.specs.zip` each. Files are pretty-printed (2-space, with a
// trailing newline) so the archive's contents land as clean Git diffs when
// committed into a repo's .specs/. Used by the popup, side panel, and Options.

/** Zip and download each export bundle. Returns the number of zips triggered. */
export function downloadExportBundles(bundles: ExportBundle[]): number {
  const enc = new TextEncoder();
  for (const bundle of bundles) {
    const entries = Object.entries(bundle.files).map(([name, content]) => ({
      name,
      bytes: enc.encode(`${JSON.stringify(content, null, 2)}\n`),
    }));
    downloadZip(exportZipName(bundle.project), zipStore(entries));
  }
  return bundles.length;
}
