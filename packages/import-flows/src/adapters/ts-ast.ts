// Shared TS-compiler-API helpers for adapters: parse source text and read
// simple literal shapes (string/array/object) without ever executing any of
// it. `typescript` is a peerDependency, loaded lazily via a synchronous
// `createRequire` so extractors stay plain sync functions — no `eval`, no
// dynamic `import()` of consumer modules, no async plumbing in the adapters.

import { createRequire } from "node:module";
import type * as TS from "typescript";

const nodeRequire = createRequire(import.meta.url);

/** Bounds pathological input so a single malicious/huge source file can't
 * exhaust memory or CPU during parsing. */
export const MAX_SOURCE_BYTES = 2_000_000;

/** Pure extractor input shared by every adapter: source text plus an
 * optional named export to target. No `fs` in here — the caller
 * (map-config/CLI) reads files from disk and passes the text in. */
export interface ExtractInput {
  sourceText: string;
  exportName?: string;
}

let cachedTs: typeof TS | undefined;

/** Loads the `typescript` peerDependency on first use. Throws a clear,
 * actionable error if it isn't installed rather than falling back to any
 * unsafe parse path. */
export function loadTypeScript(): typeof TS {
  if (cachedTs) return cachedTs;
  try {
    cachedTs = nodeRequire("typescript") as typeof TS;
    return cachedTs;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(
      `@specpin/import-flows: adapters require the "typescript" peerDependency. ` +
        `Install it in your project (e.g. "npm i -D typescript"). ${reason}`,
    );
  }
}

/** Parses source text into an AST. Never executes it — a pure syntax read. */
export function parseSource(ts: typeof TS, sourceText: string, jsx: boolean): TS.SourceFile {
  return ts.createSourceFile(
    jsx ? "module.tsx" : "module.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function hasExportModifier(ts: typeof TS, node: TS.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return (mods ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/** Finds `export const <name> = <initializer>;` (or `let`/`var`) at the top
 * level of the file. */
export function findNamedExportInitializer(
  ts: typeof TS,
  sourceFile: TS.SourceFile,
  exportName: string,
): TS.Expression | undefined {
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt) || !hasExportModifier(ts, stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === exportName && decl.initializer) {
        return decl.initializer;
      }
    }
  }
  return undefined;
}

/** Finds `export default <initializer>;` at the top level of the file. */
export function findDefaultExportInitializer(
  ts: typeof TS,
  sourceFile: TS.SourceFile,
): TS.Expression | undefined {
  for (const stmt of sourceFile.statements) {
    if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) return stmt.expression;
  }
  return undefined;
}

/** Reads a string literal (or no-substitution template) node's text. */
export function readStringLiteral(ts: typeof TS, node: TS.Node): string | undefined {
  return ts.isStringLiteralLike(node) ? node.text : undefined;
}

/** Reads an array-literal node's elements as object literals. Any element
 * that isn't a plain object literal is counted in `skipped` rather than
 * causing a throw. */
export function readArrayOfObjectLiterals(
  ts: typeof TS,
  node: TS.Node,
): { objects: TS.ObjectLiteralExpression[]; skipped: number } {
  const objects: TS.ObjectLiteralExpression[] = [];
  let skipped = 0;
  if (!ts.isArrayLiteralExpression(node)) return { objects, skipped };
  for (const el of node.elements) {
    if (ts.isObjectLiteralExpression(el)) objects.push(el);
    else skipped += 1;
  }
  return { objects, skipped };
}

/** Reads the string-literal-valued properties of an object literal into a
 * plain map. Non-string-literal values (identifiers, spreads, computed keys,
 * nested objects/expressions — anything that would require execution to
 * resolve) are simply absent from the result. */
export function readStringProps(
  ts: typeof TS,
  node: TS.ObjectLiteralExpression,
): Record<string, string> {
  const props: Record<string, string> = {};
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = propName(ts, prop.name);
    if (!key) continue;
    const value = readStringLiteral(ts, prop.initializer);
    if (value !== undefined) props[key] = value;
  }
  return props;
}

function propName(ts: typeof TS, name: TS.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}
