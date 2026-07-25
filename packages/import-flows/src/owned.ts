// owned.ts — read/write the `.specs/.import-owned.json` companion file: the
// tiny, git-committed record of which Flow ids + Screen ids the LAST import
// run managed. It exists to give Track A node-level ownership without a
// schema change (Transition already carries `source`; Flow/Screen do not).
// See phase-A3 "Provenance-preserving merge (design)" for the full
// rationale, and merge.ts for how the sets it returns are used.
//
// Missing or corrupt -> treated as the empty owned set (conservative: prunes
// nothing, preserves everything). A stale/deleted companion file can only
// make import MORE conservative, never cause data loss.

import { readFile } from "node:fs/promises";
import { resolveWithinRoot } from "./resolve-config-paths.js";
import { type WriteCanonicalResult, writeCanonical } from "./write-canonical.js";

export const OWNED_FILE_NAME = ".import-owned.json";

export interface OwnedIds {
  flows: ReadonlySet<string>;
  screens: ReadonlySet<string>;
}

interface OwnedFileShape {
  version: string;
  flows: string[];
  screens: string[];
}

function emptyOwnedIds(): OwnedIds {
  return { flows: new Set(), screens: new Set() };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Reads `.specs/.import-owned.json`. A missing file, an unreadable file,
 * invalid JSON, or a value that isn't shaped like
 * `{ flows: string[], screens: string[] }` all come back as the empty owned
 * set — this function never throws. */
export async function readOwnedIds(specsDir: string): Promise<OwnedIds> {
  const resolved = resolveWithinRoot(specsDir, OWNED_FILE_NAME);
  if (!resolved.ok) return emptyOwnedIds();

  let raw: string;
  try {
    raw = await readFile(resolved.absPath, "utf8");
  } catch {
    return emptyOwnedIds();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyOwnedIds();
  }

  if (parsed === null || typeof parsed !== "object") return emptyOwnedIds();
  const shape = parsed as Record<string, unknown>;
  if (!isStringArray(shape.flows) || !isStringArray(shape.screens)) return emptyOwnedIds();

  return { flows: new Set(shape.flows), screens: new Set(shape.screens) };
}

/** Writes the new owned set after a successful import run: the flow ids the
 * config declared this run + the screen ids the adapters produced this run
 * (each sorted, for a stable diff). Goes through `writeCanonical` — the same
 * atomic, traversal-guarded write as flows.json/screens.json. */
export async function writeOwnedIds(
  specsDir: string,
  flowIds: Iterable<string>,
  screenIds: Iterable<string>,
): Promise<WriteCanonicalResult> {
  const body: OwnedFileShape = {
    version: "1.0",
    flows: [...new Set(flowIds)].sort(),
    screens: [...new Set(screenIds)].sort(),
  };
  return writeCanonical(specsDir, OWNED_FILE_NAME, body);
}
