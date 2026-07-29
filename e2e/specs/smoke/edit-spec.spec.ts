import { resolveLocalized, type Spec } from "@specpin/spec-schema";
import { expect, test } from "../../fixtures/extension.js";
import { expectSingleTouchedFile, waitForSaveToDisk } from "../../fixtures/save-outcome.js";
import { KEYS, seedSetting } from "../../fixtures/seed-config.js";
import { BADGE, CAPTURE_FORM, TOOLTIP, TOOLTIP_EDIT } from "../../fixtures/selectors.js";
import { assertTempPath } from "../../fixtures/specs-corpus.js";
import { readSpecFile, snapshotCorpus } from "../../fixtures/specs-fs.js";

/** The `en` reading of a localized field, which is how the demo corpus is authored. */
const english = (value: Spec["title"] | undefined): string => resolveLocalized(value, "en");

/** run-guide §11 — edit an existing spec through the tooltip.
 *
 *  The tooltip's action row only exists once the tip is *pinned* (clicked), and the
 *  Edit affordance appears only when the background marked the spec `writable` — so
 *  this scenario also proves that gate resolves correctly for a sidecar that serves
 *  the page. */
test.describe("§11 edit a spec", () => {
  test("changes exactly the edited field on disk and leaves the rest alone", async ({
    page,
    demoApp,
    sidecar,
    serviceWorker,
    connectToSidecar,
  }) => {
    assertTempPath(sidecar.specsDir);

    await seedSetting(serviceWorker, KEYS.displayMode, "tooltip");
    await connectToSidecar();
    await page.goto(`${demoApp.baseUrl}/login`);

    // Readiness gate, derived from the corpus rather than a literal: a fixture that
    // gained a spec should not fail the edit test with "expected 4, got 5".
    const loginSpecs = (await readSpecFile(sidecar.specsDir, "login.spec.json")).specs.length;
    const badges = page.locator(BADGE);
    await expect(badges).toHaveCount(loginSpecs);

    // Pin the tip (hover only peeks; the actions render in the pinned wrapper), then
    // read its title to learn which spec this badge belongs to. Badges are
    // positioned rather than ordered, so identifying by title beats assuming index.
    await badges.first().click();
    const tooltip = page.locator(TOOLTIP).first();
    await expect(tooltip).toBeVisible();
    const editedTitle = (await tooltip.locator("h4").first().textContent())?.trim() ?? "";
    expect(editedTitle).not.toBe("");

    const before = await snapshotCorpus(sidecar.specsDir);

    await page.locator(TOOLTIP_EDIT).first().click();
    const form = page.locator(CAPTURE_FORM);
    await expect(form.locator("#sp-desc")).toBeVisible();

    // The form must arrive pre-filled — an "edit" that opened blank would silently
    // erase every field the user did not retype.
    await expect(form.locator("#sp-title")).toHaveValue(editedTitle);

    const newDescription = "Edited by the Playwright smoke tier.";
    await form.locator("#sp-desc").fill(newDescription);
    await form.locator("#sp-save").click();

    const diff = await waitForSaveToDisk(page, sidecar.specsDir, before, {
      subject: "the edited spec to reach disk",
    });

    // An edit must change exactly one file, and add none — a new file would mean it
    // wrote a duplicate rather than updating in place.
    const touched = expectSingleTouchedFile(diff);
    expect(diff.added, "an edit should create no new file").toEqual([]);
    expect(diff.changed).toEqual([touched]);

    const file = await readSpecFile(sidecar.specsDir, touched);
    const edited = file.specs.find((spec) => english(spec.title) === editedTitle);
    expect(edited, `edited spec should still be in ${diff.changed[0]}`).toBeDefined();

    // The edited field changed...
    expect(english(edited?.description)).toBe(newDescription);

    // ...and nothing else did. Compared against the file's PRE-EDIT content, because
    // an edit that dropped the fingerprint (leaving the spec unrenderable) or lost the
    // authored tags and business rules would sail past an assertion that only checked
    // the description.
    const priorFile = JSON.parse(before.get(diff.changed[0] as string) as string) as {
      specs: Spec[];
    };
    const prior = priorFile.specs.find((spec) => english(spec.title) === editedTitle);
    expect(prior, "the edited spec should have existed before the edit").toBeDefined();

    // Same spec count: the edit replaced a spec rather than appending a duplicate.
    expect(file.specs).toHaveLength(priorFile.specs.length);
    expect(edited?.id).toBe(prior?.id);
    expect(edited?.fingerprint).toEqual(prior?.fingerprint);
    expect(edited?.tags).toEqual(prior?.tags);
    expect(edited?.businessRules).toEqual(prior?.businessRules);
    // The description really was different beforehand, so the assertion above proves
    // a change rather than passing on a value that was already there.
    expect(english(prior?.description)).not.toBe(newDescription);
  });
});
