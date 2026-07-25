// cli-run-modes.ts — the three ways a run can end once the merged
// flows/screens are validated: `--dry-run` (print a diff, write nothing),
// `--check` (CI gate: non-zero exit if stale, write nothing), and the normal
// write (write only the files that changed, then record the new owned set).
// Split out of cli.ts to keep that file to orchestration + wiring.

import { diffText } from "./diff.js";
import { writeOwnedIds } from "./owned.js";
import { writeCanonical } from "./write-canonical.js";

export interface RunModeInput {
  specsDir: string;
  flowsPath: string;
  screensPath: string;
  flowsConfig: unknown;
  screensConfig: unknown;
  existingFlowsRaw: string;
  existingScreensRaw: string;
  flowsCanonical: string;
  screensCanonical: string;
  flowsChanged: boolean;
  screensChanged: boolean;
  flowIds: string[];
  screenIds: string[];
}

/** Prints a diff of what would change and writes nothing. Always exits 0. */
export function runDryRun(input: RunModeInput): number {
  const flowsDiff = diffText("flows.json", input.existingFlowsRaw, input.flowsCanonical);
  const screensDiff = diffText("screens.json", input.existingScreensRaw, input.screensCanonical);
  if (!flowsDiff.changed && !screensDiff.changed) {
    console.log("(--dry-run: flows.json and screens.json already in sync — nothing would change)");
    return 0;
  }
  if (flowsDiff.changed) console.log(flowsDiff.text);
  if (screensDiff.changed) console.log(screensDiff.text);
  console.log("(--dry-run: no files written)");
  return 0;
}

/** CI gate: exits 2 if any file would change, 0 when in sync. Writes nothing
 * either way. */
export function runCheck(input: RunModeInput): number {
  const stale: string[] = [];
  if (input.flowsChanged) stale.push("flows.json");
  if (input.screensChanged) stale.push("screens.json");
  if (stale.length > 0) {
    console.error(
      `specpin-import-flows: stale, run without --check to update: ${stale.join(", ")}`,
    );
    return 2;
  }
  console.log("specpin-import-flows: flows.json and screens.json are in sync");
  return 0;
}

/** Records the new owned set, then writes only the files that changed. The
 * owned set (the flow ids the config declared + the screen ids the adapters
 * produced this run) is written FIRST on purpose: the three writes are not one
 * cross-file transaction, so if a crash interrupts the sequence the owned set
 * must already claim the ids import manages. That way the next run re-upserts
 * its own output rather than mistaking a half-written flows/screens.json for
 * hand-authored content and self-locking on the collision guard. Writing owned
 * first fails safe toward "import owns it". Returns 1 on a write error. */
export async function runWrite(input: RunModeInput): Promise<number> {
  const ownedWrite = await writeOwnedIds(input.specsDir, input.flowIds, input.screenIds);
  if (!ownedWrite.ok) {
    console.error(`specpin-import-flows: ${ownedWrite.error}`);
    return 1;
  }

  if (input.flowsChanged) {
    const written = await writeCanonical(input.specsDir, "flows.json", input.flowsConfig);
    if (!written.ok) {
      console.error(`specpin-import-flows: ${written.error}`);
      return 1;
    }
    console.log(`wrote ${input.flowsPath}`);
  }
  if (input.screensChanged) {
    const written = await writeCanonical(input.specsDir, "screens.json", input.screensConfig);
    if (!written.ok) {
      console.error(`specpin-import-flows: ${written.error}`);
      return 1;
    }
    console.log(`wrote ${input.screensPath}`);
  }

  return 0;
}
