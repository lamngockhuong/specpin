import { expect, type Page } from "@playwright/test";
import { CAPTURE_FORM_ERRORS } from "./selectors.js";
import { type CorpusDiff, type CorpusSnapshot, diffCorpus } from "./specs-fs.js";
import { waitFor } from "./wait-for.js";

/** How long to wait for a save to land on disk.
 *
 *  Deliberately longer than the api-client's own `REQUEST_TIMEOUT_MS` (10s, see
 *  `packages/api-client/src/client.ts`). A deadline equal to the operation's own
 *  timeout is mis-specified: it can expire while the request is still legitimately in
 *  flight, and the resulting failure looks like a lost write rather than an impatient
 *  test. This waits out the product's bound and then some. */
const SAVE_DEADLINE_MS = 25_000;

/** Wait for a spec save to reach the temp corpus, and explain it when it does not.
 *
 *  The capture form reports a rejected save inline (`showErrors()` → `.errors.show`),
 *  so that box is checked on every poll: a save the sidecar refused then fails in about
 *  a second quoting the extension's own message, instead of timing out with the far
 *  less useful "the file never appeared". */
export async function waitForSaveToDisk(
  page: Page,
  specsDir: string,
  before: CorpusSnapshot,
  options: { subject?: string } = {},
): Promise<CorpusDiff> {
  // The probe RETURNS the outcome rather than throwing on a rejection: `waitFor` treats
  // a throwing probe as "not ready yet", so throwing here would loop out the whole
  // deadline instead of reporting the rejection immediately.
  const outcome = await waitFor<{ diff: CorpusDiff } | { rejected: string }>(
    async () => {
      const errors = page.locator(CAPTURE_FORM_ERRORS);
      if ((await errors.count()) > 0) {
        const message = ((await errors.first().textContent()) ?? "").trim();
        if (message) return { rejected: message };
      }
      const diff = await diffCorpus(specsDir, before);
      return diff.added.length + diff.changed.length > 0 ? { diff } : null;
    },
    {
      subject: options.subject ?? "the saved spec to reach disk",
      timeout: SAVE_DEADLINE_MS,
    },
  );

  if ("rejected" in outcome) {
    throw new Error(
      `the save was rejected, so it never reached disk. The form reported:\n` +
        `  ${outcome.rejected}\n` +
        "(that is the extension's own message — read it before suspecting the test)",
    );
  }
  return outcome.diff;
}

/** Assert a save touched exactly one file, and return it.
 *
 *  A write that also rewrote a neighbouring file is a real bug that a single-target
 *  assertion would never see. */
export function expectSingleTouchedFile(diff: CorpusDiff): string {
  const touched = [...diff.added, ...diff.changed];
  expect(touched, "a save should touch exactly one spec file").toHaveLength(1);
  expect(diff.removed, "a save should remove no files").toEqual([]);
  return touched[0] as string;
}
