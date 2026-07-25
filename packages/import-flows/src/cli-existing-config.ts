// cli-existing-config.ts — the CLI's "what's already on disk" read boundary:
// loads an existing .specs/flows.json / .specs/screens.json (or a typed
// default when absent), and lists the screen ids a `.specs/shots/*.shot.json`
// still references (so mergeScreens never orphans a shot). Split out of
// cli.ts to keep the disk-read/shape-guard boundary separate from
// orchestration.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { FlowsConfig, ScreensConfig } from "@specpin/spec-schema";
import { canonicalize } from "./write-canonical.js";

export type LoadExistingResult<T> =
  | { ok: true; value: T; raw: string }
  | { ok: false; error: string };

/** Reads and parses a `.specs/*.json` file, or returns `defaultValue` (as
 * both the parsed value and its canonical text) when the file does not
 * exist. Invalid JSON, or JSON that doesn't match the expected root shape
 * (`isShape`), is a hard error — the CLI refuses to merge into a file it
 * cannot trust the shape of. */
export async function loadExistingConfig<T>(
  fullPath: string,
  defaultValue: T,
  isShape: (value: unknown) => value is T,
): Promise<LoadExistingResult<T>> {
  let raw: string;
  try {
    raw = await readFile(fullPath, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return { ok: true, value: defaultValue, raw: canonicalize(defaultValue) };
    }
    return { ok: false, error: `could not read ${fullPath}: ${err.message}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `invalid JSON in ${fullPath}: ${reason}` };
  }
  if (!isShape(parsed)) {
    return { ok: false, error: `${fullPath} does not have the expected shape` };
  }
  return { ok: true, value: parsed, raw };
}

export function isFlowsConfigShape(value: unknown): value is FlowsConfig {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.version === "string" && Array.isArray(v.flows);
}

export function isScreensConfigShape(value: unknown): value is ScreensConfig {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.version === "string" && Array.isArray(v.screens) && Array.isArray(v.transitions);
}

const SHOT_SUFFIX = ".shot.json";

/** Lists the screen ids referenced by a `.specs/shots/<id>.shot.json`
 * companion file, so a screen prune never orphans a shot (specshot, PR
 * #187). A missing `shots/` directory -> empty set, never an error. */
export async function listShotScreenIds(specsDir: string): Promise<Set<string>> {
  let entries: string[];
  try {
    entries = await readdir(path.join(specsDir, "shots"));
  } catch {
    return new Set();
  }
  const ids = new Set<string>();
  for (const name of entries) {
    if (name.endsWith(SHOT_SUFFIX)) ids.add(name.slice(0, -SHOT_SUFFIX.length));
  }
  return ids;
}
