// cli-report.ts — pure console-output helpers for the CLI: the run plan
// (what import.config.json says it will do), the source-file reader
// (the CLI's one disk-read boundary for adapter inputs), and the
// post-extraction summary. Split out of cli.ts to keep that file focused on
// orchestration (load -> merge -> validate -> write/diff/check).

import { readFile } from "node:fs/promises";
import type { ImportConfig } from "./config-types.js";
import type { MapConfigResult } from "./map-config.js";

export function printRunPlan(config: ImportConfig): void {
  const total = config.flows.length + config.screens.length;
  if (total === 0) {
    console.log("Run plan: nothing to import (flows[] and screens[] are both empty).");
    return;
  }
  console.log("Run plan:");
  for (const flow of config.flows) {
    console.log(`  flow    ${flow.adapter}\t${flow.file}\t-> id: ${flow.id}`);
  }
  for (const screen of config.screens) {
    console.log(`  screen  ${screen.adapter}\t${screen.file}`);
  }
}

/** Reads every unique file referenced by the config once. Never throws —
 * an unreadable file comes back as an error string, same convention as the
 * rest of the CLI's IO boundary. */
export async function loadFileTexts(
  config: ImportConfig,
): Promise<{ ok: true; texts: Map<string, string> } | { ok: false; errors: string[] }> {
  const files = new Set<string>([
    ...config.flows.map((f) => f.file),
    ...config.screens.map((s) => s.file),
  ]);
  const texts = new Map<string, string>();
  const errors: string[] = [];

  for (const file of files) {
    try {
      texts.set(file, await readFile(file, "utf8"));
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      errors.push(`could not read ${file}: ${reason}`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, texts };
}

export function printExtractionSummary(mapped: MapConfigResult): void {
  console.log("Extracted:");
  for (const flow of mapped.flowsConfig.flows) {
    console.log(
      `  flow    ${flow.id}\t${flow.states.length} states, ${flow.transitions.length} transitions`,
    );
  }
  console.log(`  screens ${mapped.screensConfig.screens.length} node(s)`);
  if (mapped.warnings.length > 0) {
    console.log("Warnings:");
    for (const w of mapped.warnings) console.log(`  - ${w}`);
  }
}
