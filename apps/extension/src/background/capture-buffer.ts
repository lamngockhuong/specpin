// Draft capture buffer for Track B auto-capture: per-project storage.local CRUD
// for the privacy-scrubbed candidate transitions the content-script recorder
// observed (nav-recorder.ts + B1's deriveTransition/generalizeUrl). Bounded
// ring buffer (drop-oldest) per project, deduped by transition id within a
// project. `.specs/` is never touched here -- B3 owns the approve/write-back
// path; this module only owns the draft, mirroring drift-corpus.ts's
// storage.local ring-buffer style (serialized read-modify-write, capped size).

import { browser } from "#imports";
import type { CaptureBufferEntry } from "../shared/messaging.js";
import { MAX_CAPTURE_ENTRIES_PER_PROJECT } from "../shared/messaging.js";
import { transitionExcluded } from "../shared/record-exclude.js";

export const CAPTURE_BUFFER_KEY = "specpin:captureBuffer";

// Per-project cap: bounds storage.local use so a tab left recording for a long
// session cannot grow one project's buffer unbounded. Mirrors the ring-buffer
// style of drift-corpus's MAX_CORPUS_ENTRIES, scoped per project here since the
// buffer itself is per-project (see the phase's "Project association"). The
// constant itself is defined in shared/messaging.ts (B4) so extension pages can
// read the same bound without importing this background-only module; re-export
// it here so existing imports of it from this file keep working unchanged.
export { MAX_CAPTURE_ENTRIES_PER_PROJECT };

async function readAll(): Promise<CaptureBufferEntry[]> {
  const stored = await browser.storage.local.get(CAPTURE_BUFFER_KEY);
  const raw = stored[CAPTURE_BUFFER_KEY];
  return Array.isArray(raw) ? (raw as CaptureBufferEntry[]) : [];
}

async function writeAll(entries: CaptureBufferEntry[]): Promise<void> {
  // Empty overall buffer: drop the key so a default profile carries nothing.
  if (entries.length === 0) {
    await browser.storage.local.remove(CAPTURE_BUFFER_KEY);
    return;
  }
  await browser.storage.local.set({ [CAPTURE_BUFFER_KEY]: entries });
}

// Serialize read-modify-write so a burst of navigations (e.g. a redirect
// chain triggering several appends close together) cannot race and lose a
// write. Mirrors drift-corpus.ts's identical `serialize` helper.
let writeChain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Append one captured transition to `project`'s draft buffer. Deduped by
 *  `transition.id` WITHIN that project only -- two different projects may
 *  derive the same transition id without colliding, since screen ids are only
 *  meaningful within their own project's route shape. A repeat of an
 *  already-buffered edge is a no-op (not a duplicate append). Enforces the
 *  per-project ring-buffer cap by dropping the oldest entries first. */
export function appendCaptured(
  project: string,
  entry: Omit<CaptureBufferEntry, "project" | "capturedAt">,
  now: number = Date.now(),
): Promise<void> {
  return serialize(async () => {
    const all = await readAll();
    const mine = all.filter((e) => e.project === project);
    if (mine.some((e) => e.transition.id === entry.transition.id)) return;
    const others = all.filter((e) => e.project !== project);
    const nextMine = [...mine, { ...entry, project, capturedAt: now }];
    if (nextMine.length > MAX_CAPTURE_ENTRIES_PER_PROJECT) {
      nextMine.splice(0, nextMine.length - MAX_CAPTURE_ENTRIES_PER_PROJECT);
    }
    await writeAll([...others, ...nextMine]);
  });
}

/** Every draft entry for `project`, or every project's when omitted -- the
 *  graph panel (B3) aggregates across every connected project, like
 *  flowsScreensByProject. */
export async function getBuffer(project?: string): Promise<CaptureBufferEntry[]> {
  const all = await readAll();
  return project ? all.filter((e) => e.project === project) : all;
}

/** Discard every draft entry for one project; every OTHER project's entries
 *  are left untouched (a per-project operation, never a global wipe). */
export function clearBuffer(project: string): Promise<void> {
  return serialize(async () => {
    const all = await readAll();
    await writeAll(all.filter((e) => e.project !== project));
  });
}

/** Drop every draft entry for `project` whose transition now matches the
 *  project's auto-capture ignore-list (`exclude` globs) -- called right after a
 *  SET_RECORD_EXCLUDE add so the ghost edges the user just chose to ignore clear
 *  from the graph immediately, not only on the NEXT navigation. Other projects'
 *  entries are untouched. A no-op (empty `exclude`, or nothing matches) leaves
 *  the buffer as-is. */
export function pruneBufferByGlob(project: string, exclude: readonly string[]): Promise<void> {
  return serialize(async () => {
    if (exclude.length === 0) return;
    const all = await readAll();
    const kept = all.filter(
      (e) => !(e.project === project && transitionExcluded(exclude, e.from.urlGlob, e.to.urlGlob)),
    );
    if (kept.length !== all.length) await writeAll(kept);
  });
}

/** Discard ONE draft entry (by transition id) from `project`'s buffer,
 *  leaving every other entry -- in this project or any other -- untouched.
 *  The B3 per-entry discard/approve-then-drop, sibling of `clearBuffer`'s
 *  discard-ALL. A no-op (not an error) when the entry is already gone (a
 *  concurrent approve/discard on another surface, or a stale panel). */
export function removeCaptured(project: string, transitionId: string): Promise<void> {
  return serialize(async () => {
    const all = await readAll();
    await writeAll(all.filter((e) => !(e.project === project && e.transition.id === transitionId)));
  });
}
