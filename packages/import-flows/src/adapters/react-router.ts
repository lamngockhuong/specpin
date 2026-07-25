// react-router adapter: extracts Screen[] from either JSX `<Route path="...">`
// elements (walked at any nesting depth — nested-children path-joining is a
// documented limitation, out of scope for now; see react-router-jsx.ts) or a
// flat route-object-array literal. Pure: no fs, no execution of consumer
// code — static AST read only.

import type { Screen } from "@specpin/spec-schema";
import type * as TS from "typescript";
import { dedupeSlug, slugify } from "../slug.js";
import { CATCH_ALL_PATH, collectJsxRoutePaths } from "./react-router-jsx.js";
import {
  type ExtractInput,
  findDefaultExportInitializer,
  findNamedExportInitializer,
  loadTypeScript,
  MAX_SOURCE_BYTES,
  parseSource,
  readArrayOfObjectLiterals,
  readStringProps,
} from "./ts-ast.js";

export interface ScreensExtractResult {
  screens: Screen[];
  warnings: string[];
}

/** Extracts route paths from JSX `<Route>` elements and/or an object-array
 * export, then builds `Screen[]` (`:param` segments generalized to `**`,
 * consistent with `matchPathGlob`). No `transitions` are emitted — route
 * tables encode structure, not navigation edges. */
export function extractReactRouter(input: ExtractInput): ScreensExtractResult {
  if (input.sourceText.length > MAX_SOURCE_BYTES) {
    return { screens: [], warnings: [`source exceeds ${MAX_SOURCE_BYTES} bytes, skipped`] };
  }

  const ts = loadTypeScript();
  const sourceFile = parseSource(ts, input.sourceText, true);
  const warnings: string[] = [];

  const paths: string[] = [];
  collectJsxRoutePaths(ts, sourceFile, paths, warnings);
  collectArrayRoutePaths(ts, sourceFile, input.exportName, paths, warnings);

  if (paths.length === 0) {
    warnings.push("no route paths found (checked JSX <Route> elements and an object-array export)");
    return { screens: [], warnings };
  }

  return { screens: buildScreens(paths), warnings };
}

function collectArrayRoutePaths(
  ts: typeof TS,
  sourceFile: TS.SourceFile,
  exportName: string | undefined,
  paths: string[],
  warnings: string[],
): void {
  const initializer = exportName
    ? findNamedExportInitializer(ts, sourceFile, exportName)
    : findDefaultExportInitializer(ts, sourceFile);
  if (!initializer) return;

  const { objects, skipped } = readArrayOfObjectLiterals(ts, initializer);
  if (skipped > 0) {
    warnings.push(`skipped ${skipped} non-object route entr${skipped === 1 ? "y" : "ies"}`);
  }

  objects.forEach((obj, i) => {
    const props = readStringProps(ts, obj);
    if (!props.path) {
      warnings.push(`route[${i}]: missing "path" string field, skipped`);
      return;
    }
    if (props.path === CATCH_ALL_PATH) {
      warnings.push(`route[${i}] path="*" skipped (catch-all)`);
      return;
    }
    paths.push(props.path);
  });
}

function buildScreens(paths: string[]): Screen[] {
  const used = new Set<string>();
  return paths.map((path) => {
    const id = dedupeSlug(slugify(path), used);
    used.add(id);
    const screen: Screen = { id, name: { en: deriveTitle(path) }, urlGlob: generalizeGlob(path) };
    return screen;
  });
}

/** `:param` segments become `**`, matching `matchPathGlob` semantics
 * (`apps/extension/src/shared/visibility.ts`); static segments are kept
 * as-is. */
function generalizeGlob(path: string): string {
  return path
    .split("/")
    .map((seg) => (seg.startsWith(":") ? "**" : seg))
    .join("/");
}

/** Raw, deterministic title derived from the path segments — a starting
 * point the user localizes/renames later (same convention as fsm-table's
 * raw-id state labels). */
function deriveTitle(path: string): string {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return "Home";
  return segments.map((seg) => (seg.startsWith(":") ? "Detail" : titleCaseSegment(seg))).join(" ");
}

function titleCaseSegment(seg: string): string {
  return seg
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
