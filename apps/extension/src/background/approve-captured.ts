import type { Screen, ScreensConfig } from "@specpin/spec-schema";
import { mergeScreensConfig } from "../graph/graph-write-back.js";
import type { CaptureBufferEntry, CapturedScreenCandidate } from "../shared/messaging.js";
import { getBuffer, removeCaptured } from "./capture-buffer.js";

// Phase B3: approve/discard one entry in a project's Track B draft capture
// buffer. Approve is read-merge-validate-write: read the owning project's
// CURRENT ScreensConfig, merge via graph-write-back's provenance-preserving
// helper (source: "auto-captured"), and only on a valid merge write it back
// through whichever path the project actually uses -- then drop the buffer
// entry. Discard just drops the entry, no `.specs/` write. Both are called
// only from background.ts, which has already gated the message PRIVILEGED
// (extension-page origin only) before reaching here.
//
// The read/write side is injected as an `ApproveTarget` rather than reaching
// into the sidecar registry or storage.local directly, so this module -- and
// its test suite -- never needs a live sidecar or a fakeBrowser storage mock
// to exercise the merge/dedupe/no-clobber/invalid-abort behavior; only
// capture-buffer.ts's real (fakeBrowser-backed) buffer functions are needed.

export interface ApproveTarget {
  /** The project's current ScreensConfig, freshly read (RT-H3: re-read the
   *  live config before merging, never a stale cache). */
  getScreens(): Promise<ScreensConfig>;
  /** Persist the merged config through this project's own write path (sidecar
   *  PUT /screens, or the local-batch screens store). */
  writeScreens(config: ScreensConfig): Promise<void>;
}

export interface ApproveCapturedResult {
  ok: boolean;
  errors?: string[];
}

/** Build the two new-screen candidates from a buffer entry, skipping either
 *  side already present in the CURRENT config (by id) -- graph-write-back.ts
 *  applies the full id-or-urlGlob identity-clash rule itself, this is just an
 *  obvious pre-filter so an unchanged side is never even offered as "new". */
function candidateScreens(entry: CaptureBufferEntry, config: ScreensConfig): Screen[] {
  const existingIds = new Set(config.screens.map((s) => s.id));
  const seen = new Set<string>();
  const screens: Screen[] = [];
  for (const candidate of [entry.from, entry.to] as CapturedScreenCandidate[]) {
    if (existingIds.has(candidate.id) || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    screens.push({ id: candidate.id, name: { en: candidate.name }, urlGlob: candidate.urlGlob });
  }
  return screens;
}

/** Approve one buffered transition: merge it into `target`'s current
 *  ScreensConfig and, only on success, write it back and drop the buffer
 *  entry. Returns `{ ok: false, errors }` -- with NO write and the buffer
 *  entry left in place -- when the entry is missing or the merge is refused
 *  (a clobber attempt or a schema violation). */
export async function approveCapturedTransition(
  project: string,
  transitionId: string,
  target: ApproveTarget,
): Promise<ApproveCapturedResult> {
  const entries = await getBuffer(project);
  const entry = entries.find((e) => e.transition.id === transitionId);
  if (!entry) return { ok: false, errors: ["capture entry not found"] };

  const config = await target.getScreens();
  const result = mergeScreensConfig({
    config,
    screens: candidateScreens(entry, config),
    transitions: [entry.transition],
    source: "auto-captured",
  });
  if (!result.ok || !result.config) return { ok: false, errors: result.errors };

  await target.writeScreens(result.config);
  await removeCaptured(project, transitionId);
  return { ok: true };
}

/** Discard one buffered transition: drop it from the draft buffer with no
 *  `.specs/` write. Always succeeds (an already-gone entry is a no-op). */
export async function discardCapturedTransition(
  project: string,
  transitionId: string,
): Promise<{ ok: true }> {
  await removeCaptured(project, transitionId);
  return { ok: true };
}
