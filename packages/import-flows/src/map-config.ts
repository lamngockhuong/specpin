// Assembles adapter output into full FlowsConfig / ScreensConfig, given a
// loaded ImportConfig and the text of every referenced file. Pure — no fs;
// the CLI reads each file's text from disk and passes the map in here. Not
// yet written to disk (the merge writer lands in a later phase).

import type { Flow, FlowsConfig, Screen, ScreensConfig, Transition } from "@specpin/spec-schema";
import { ADAPTER_REGISTRY } from "./adapters/registry.js";
import type { FlowImportEntry, ImportConfig, ScreenImportEntry } from "./config-types.js";

const CONFIG_VERSION = "1.0";

export interface MapConfigResult {
  flowsConfig: FlowsConfig;
  screensConfig: ScreensConfig;
  warnings: string[];
}

/** `fileTexts` is keyed by the exact (already path-resolved) `file` recorded
 * on each config entry — one read per unique file, done by the caller. */
export function mapConfig(
  config: ImportConfig,
  fileTexts: ReadonlyMap<string, string>,
): MapConfigResult {
  const warnings: string[] = [];
  const flows = config.flows.map((entry) => buildFlow(entry, fileTexts, warnings));
  const { screens, transitions } = buildScreens(config.screens, fileTexts, warnings);

  return {
    flowsConfig: { version: CONFIG_VERSION, flows },
    screensConfig: { version: CONFIG_VERSION, screens, transitions },
    warnings,
  };
}

function emptyFlow(entry: FlowImportEntry): Flow {
  return { id: entry.id, object: { en: entry.id }, states: [], transitions: [] };
}

function buildFlow(
  entry: FlowImportEntry,
  fileTexts: ReadonlyMap<string, string>,
  warnings: string[],
): Flow {
  const adapter = ADAPTER_REGISTRY.get(entry.adapter);
  if (adapter?.kind !== "flow") {
    warnings.push(`flows[${entry.id}]: adapter "${entry.adapter}" is not a flow adapter, skipped`);
    return emptyFlow(entry);
  }
  const sourceText = fileTexts.get(entry.file);
  if (sourceText === undefined) {
    warnings.push(`flows[${entry.id}]: no source text supplied for ${entry.file}`);
    return emptyFlow(entry);
  }
  const result = adapter.extract({ sourceText, exportName: entry.export });
  for (const w of result.warnings) warnings.push(`flows[${entry.id}] (${entry.file}): ${w}`);
  return {
    id: entry.id,
    object: { en: entry.id },
    states: result.states,
    transitions: result.transitions,
  };
}

function buildScreens(
  entries: ScreenImportEntry[],
  fileTexts: ReadonlyMap<string, string>,
  warnings: string[],
): { screens: Screen[]; transitions: Transition[] } {
  const byId = new Map<string, Screen>();

  entries.forEach((entry, index) => {
    const adapter = ADAPTER_REGISTRY.get(entry.adapter);
    if (adapter?.kind !== "screens") {
      warnings.push(
        `screens[${index}]: adapter "${entry.adapter}" is not a screens adapter, skipped`,
      );
      return;
    }
    const sourceText = fileTexts.get(entry.file);
    if (sourceText === undefined) {
      warnings.push(`screens[${index}]: no source text supplied for ${entry.file}`);
      return;
    }
    const result = adapter.extract({ sourceText, exportName: entry.export });
    for (const w of result.warnings) warnings.push(`screens[${index}] (${entry.file}): ${w}`);
    for (const screen of result.screens) mergeScreen(byId, screen, entry.file, warnings);
  });

  // Screens adapters never emit edges: navigation transitions come from
  // Track B (auto-capture) or manual authoring, not code-import.
  return { screens: [...byId.values()], transitions: [] };
}

function mergeScreen(
  byId: Map<string, Screen>,
  screen: Screen,
  file: string,
  warnings: string[],
): void {
  const existing = byId.get(screen.id);
  if (existing && existing.urlGlob !== screen.urlGlob) {
    warnings.push(
      `screen "${screen.id}": conflicting urlGlob ("${existing.urlGlob}" vs "${screen.urlGlob}" from ${file}), keeping the latter`,
    );
  }
  byId.set(screen.id, screen); // dedup by id, last write wins
}
