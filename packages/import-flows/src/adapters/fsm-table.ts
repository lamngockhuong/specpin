// fsm-table adapter: extracts an exported transition-table const into
// FlowState[] + Transition[]. Supports the array-of-edges literal form
// (`[{ from, to, trigger, role?, guard? }, ...]`) and, as a cheap
// nice-to-have, the record form (`{ draft: { submit: "pending" } }`). Pure:
// no fs, no execution of consumer code — static AST read only.

import type { FlowState, Transition } from "@specpin/spec-schema";
import type * as TS from "typescript";
import { dedupeSlug, slugify } from "../slug.js";
import {
  type ExtractInput,
  findNamedExportInitializer,
  loadTypeScript,
  MAX_SOURCE_BYTES,
  parseSource,
  readArrayOfObjectLiterals,
  readStringProps,
} from "./ts-ast.js";

export interface FlowExtractResult {
  states: FlowState[];
  transitions: Transition[];
  warnings: string[];
}

interface RawEdge {
  from: string;
  to: string;
  trigger: string;
  role?: string;
  guard?: string;
}

/** Extracts an exported transition table into FSM states + transitions.
 * States are derived from the from/to union in first-appearance order;
 * `kind` is inferred heuristically (never a `to` -> initial; never a `from`
 * -> terminal; else normal) — a starting point the user hand-edits. Never
 * throws on malformed input; reports warnings instead. */
export function extractFsmTable(input: ExtractInput): FlowExtractResult {
  if (input.sourceText.length > MAX_SOURCE_BYTES) {
    return {
      states: [],
      transitions: [],
      warnings: [`source exceeds ${MAX_SOURCE_BYTES} bytes, skipped`],
    };
  }
  if (!input.exportName) {
    return { states: [], transitions: [], warnings: ["fsm-table requires an export name"] };
  }

  const ts = loadTypeScript();
  const sourceFile = parseSource(ts, input.sourceText, false);
  const initializer = findNamedExportInitializer(ts, sourceFile, input.exportName);
  if (!initializer) {
    return {
      states: [],
      transitions: [],
      warnings: [`export "${input.exportName}" not found (expected an exported const)`],
    };
  }

  const warnings: string[] = [];
  const edges = readEdges(ts, initializer, warnings);
  if (edges.length === 0) {
    warnings.push(`export "${input.exportName}" contained no usable edges`);
    return { states: [], transitions: [], warnings };
  }

  return { states: buildStates(edges), transitions: buildTransitions(edges), warnings };
}

function readEdges(ts: typeof TS, initializer: TS.Expression, warnings: string[]): RawEdge[] {
  if (ts.isArrayLiteralExpression(initializer))
    return readEdgesFromArray(ts, initializer, warnings);
  if (ts.isObjectLiteralExpression(initializer))
    return readEdgesFromRecord(ts, initializer, warnings);
  warnings.push("export is neither an array-of-edges nor a record transition table");
  return [];
}

function readEdgesFromArray(
  ts: typeof TS,
  initializer: TS.Expression,
  warnings: string[],
): RawEdge[] {
  const { objects, skipped } = readArrayOfObjectLiterals(ts, initializer);
  if (skipped > 0) {
    warnings.push(
      `skipped ${skipped} non-object entr${skipped === 1 ? "y" : "ies"} in the edge array`,
    );
  }
  const edges: RawEdge[] = [];
  objects.forEach((obj, i) => {
    const props = readStringProps(ts, obj);
    if (!props.from || !props.to || !props.trigger) {
      warnings.push(`edge[${i}]: missing required "from"/"to"/"trigger" string field, skipped`);
      return;
    }
    edges.push({
      from: props.from,
      to: props.to,
      trigger: props.trigger,
      role: props.role,
      guard: props.guard,
    });
  });
  return edges;
}

/** Record form: `{ <fromState>: { <trigger>: <toState>, ... }, ... }`. No
 * role/guard support in this shorthand — use the array form for that. */
function readEdgesFromRecord(
  ts: typeof TS,
  initializer: TS.ObjectLiteralExpression,
  warnings: string[],
): RawEdge[] {
  const edges: RawEdge[] = [];
  for (const prop of initializer.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const from =
      ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined;
    if (!from || !ts.isObjectLiteralExpression(prop.initializer)) {
      warnings.push(
        `record entry for state "${from ?? "?"}" is not an object of trigger -> state, skipped`,
      );
      continue;
    }
    const triggers = readStringProps(ts, prop.initializer);
    for (const [trigger, to] of Object.entries(triggers)) {
      edges.push({ from, to, trigger });
    }
  }
  return edges;
}

function buildStates(edges: RawEdge[]): FlowState[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const asFrom = new Set<string>();
  const asTo = new Set<string>();
  for (const e of edges) {
    if (!seen.has(e.from)) {
      seen.add(e.from);
      order.push(e.from);
    }
    if (!seen.has(e.to)) {
      seen.add(e.to);
      order.push(e.to);
    }
    asFrom.add(e.from);
    asTo.add(e.to);
  }
  return order.map((id) => {
    const kind = !asTo.has(id) ? "initial" : !asFrom.has(id) ? "terminal" : "normal";
    const state: FlowState = { id, label: { en: id }, kind };
    return state;
  });
}

function buildTransitions(edges: RawEdge[]): Transition[] {
  const usedIds = new Set<string>();
  return edges.map((e) => {
    const id = dedupeSlug(slugify(`${e.from}-${e.trigger}-${e.to}`), usedIds);
    usedIds.add(id);
    const transition: Transition = {
      id,
      from: e.from,
      to: e.to,
      trigger: { en: e.trigger },
      source: "imported",
    };
    if (e.guard !== undefined) transition.guard = e.guard;
    if (e.role !== undefined) transition.role = e.role;
    return transition;
  });
}
