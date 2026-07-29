import { resolveLocalized } from "@specpin/spec-schema";
import { expect, test } from "../../fixtures/extension.js";
import { expectSingleTouchedFile, waitForSaveToDisk } from "../../fixtures/save-outcome.js";
import { KEYS, seedSetting } from "../../fixtures/seed-config.js";
import { BADGE, CAPTURE_FORM } from "../../fixtures/selectors.js";
import { assertTempPath } from "../../fixtures/specs-corpus.js";
import { readSpecFile, snapshotCorpus } from "../../fixtures/specs-fs.js";

/** run-guide §10 — capture a spec onto a live element.
 *
 *  Drives the real interaction (the `Alt+Shift+C` chord from `content/chords.ts`,
 *  then a click on the element) rather than posting a `SAVE_SPEC` message. The point
 *  is to prove the whole path: picker -> form -> background -> sidecar -> file.
 *
 *  The on-disk assertion is the load-bearing one. A form that closes cheerfully over
 *  a spec that never reached the file is exactly the defect worth catching, and no
 *  UI-only assertion sees it. */
test.describe("§10 capture a spec", () => {
  test("writes the captured spec to disk, schema-valid, with the entered values", async ({
    page,
    demoApp,
    sidecar,
    serviceWorker,
    connectToSidecar,
  }) => {
    // Never write outside the OS temp dir: a fixture bug must not be able to reach
    // the committed corpus.
    assertTempPath(sidecar.specsDir);

    await seedSetting(serviceWorker, KEYS.displayMode, "tooltip");
    await connectToSidecar();
    await page.goto(`${demoApp.baseUrl}/login`);

    // Wait for the content script to have rendered before driving it: badges on the
    // page are the proof it is live and holding this origin's specs. The count comes
    // from the corpus rather than a literal — this is a readiness gate, and a fixture
    // that grew a spec should not fail the capture test with "expected 4, got 5".
    const loginSpecs = (await readSpecFile(sidecar.specsDir, "login.spec.json")).specs.length;
    await expect(page.locator(BADGE)).toHaveCount(loginSpecs);

    const before = await snapshotCorpus(sidecar.specsDir);

    await page.keyboard.press("Alt+Shift+C");
    // `<h1>` carries no spec, so this is a genuine new capture rather than a
    // re-pin of something the corpus already documents.
    await page.locator("h1").first().click();

    const form = page.locator(CAPTURE_FORM);
    await expect(form.locator("#sp-title")).toBeVisible();

    const title = "E2E captured heading";
    const description = "Captured by the Playwright smoke tier.";
    await form.locator("#sp-title").fill(title);
    await form.locator("#sp-desc").fill(description);
    await form.locator("#sp-tags").fill("e2e, smoke");
    await form.locator("#sp-save").click();

    // Poll the filesystem to a bounded deadline: the save round-trips through the
    // background and the sidecar, so the file appears slightly after the click. A
    // rejected write reports itself as a toast and fails immediately with the reason.
    const diff = await waitForSaveToDisk(page, sidecar.specsDir, before, {
      subject: "the captured spec to reach disk",
    });
    const touched = expectSingleTouchedFile(diff);

    // readSpecFile validates against schema v1 and throws with formatted errors, so
    // a spec that renders but fails the schema fails here.
    const file = await readSpecFile(sidecar.specsDir, touched);
    const captured = file.specs.find((spec) => resolveLocalized(spec.title, "en") === title);

    expect(captured, `captured spec should be in ${touched}`).toBeDefined();
    expect(resolveLocalized(captured?.description, "en")).toBe(description);
    expect(captured?.tags).toEqual(["e2e", "smoke"]);

    // A captured spec must be pinned to the element it was captured on, or it would
    // never render again.
    expect(captured?.fingerprint).toBeTruthy();
    expect(captured?.fingerprint?.tagName).toBe("h1");
  });
});
