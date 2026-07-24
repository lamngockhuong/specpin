// Adapter registry: maps an `ImportAdapter` name (the value authored in
// import.config.json) to its pure extractor + the config section it's valid
// for. More adapters slot in here later without touching map-config.ts.

import type { ImportAdapter } from "../config-types.js";
import { extractFsmTable, type FlowExtractResult } from "./fsm-table.js";
import { extractReactRouter, type ScreensExtractResult } from "./react-router.js";
import type { ExtractInput } from "./ts-ast.js";

export type { ExtractInput, FlowExtractResult, ScreensExtractResult };

export type Adapter =
  | { kind: "flow"; extract: (input: ExtractInput) => FlowExtractResult }
  | { kind: "screens"; extract: (input: ExtractInput) => ScreensExtractResult };

export const ADAPTER_REGISTRY: ReadonlyMap<ImportAdapter, Adapter> = new Map([
  ["fsm-table", { kind: "flow", extract: extractFsmTable }],
  ["react-router", { kind: "screens", extract: extractReactRouter }],
]);
