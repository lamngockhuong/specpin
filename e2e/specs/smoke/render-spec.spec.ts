import { resolveLocalized } from "@specpin/spec-schema";
import { expect, test } from "../../fixtures/extension.js";
import { KEYS, seedSetting } from "../../fixtures/seed-config.js";
import { BADGE, TOOLTIP_TITLE } from "../../fixtures/selectors.js";
import { readSpecFile } from "../../fixtures/specs-fs.js";

/** run-guide §7 — specs render on the page they are pinned to.
 *
 *  `/login` is the target because all four of its specs anchor to `data-spec-id`
 *  attributes, which match exactly — so this scenario tests *rendering*, not the
 *  fuzzy scorer. */
test.describe("§7 render specs", () => {
  test("draws one badge per matched spec and shows its title on hover", async ({
    page,
    demoApp,
    sidecar,
    serviceWorker,
    connectToSidecar,
  }) => {
    // Seeded explicitly rather than relying on the manifest default: if
    // `defaultDisplayMode` ever changes, this scenario should keep testing the
    // tooltip renderer instead of silently retargeting to another one.
    await seedSetting(serviceWorker, KEYS.displayMode, "tooltip");
    await connectToSidecar();

    const expected = await readSpecFile(sidecar.specsDir, "login.spec.json");
    const expectedTitles = expected.specs.map((spec) => resolveLocalized(spec.title, "en"));

    await page.goto(`${demoApp.baseUrl}/login`);

    // Every login spec anchors to a `data-spec-id`, so all of them must match; a
    // count short of that means matching regressed, not that the page is slow.
    // `toHaveCount` polls to a bounded deadline — never a fixed sleep.
    const badges = page.locator(BADGE);
    await expect(badges).toHaveCount(expected.specs.length);

    // Hover each badge and collect the titles the tooltip reveals, rather than
    // assuming which badge is which: badges are positioned, not ordered, and the
    // set is the real contract.
    const seen: string[] = [];
    for (let i = 0; i < expected.specs.length; i += 1) {
      await badges.nth(i).hover();
      const title = page.locator(TOOLTIP_TITLE).first();
      await expect(title).toBeVisible();
      seen.push((await title.textContent()) ?? "");
      // Move off the badge so the next hover opens a fresh tip.
      await page.locator("h1").first().hover();
    }

    // Titles come from the corpus on disk, so a copy change in the fixture cannot
    // silently invalidate the assertion (nor can it pass for the wrong reason).
    expect(seen.sort()).toEqual([...expectedTitles].sort());
  });

  test("renders nothing on a page whose specs do not scope to it", async ({
    page,
    demoApp,
    serviceWorker,
    connectToSidecar,
  }) => {
    await seedSetting(serviceWorker, KEYS.displayMode, "tooltip");
    await connectToSidecar();

    // The login specs pin `pageUrl: "/login"`. On another route they must not
    // render even though the corpus is loaded and the project serves this origin —
    // this is the page-scope gate, and without a negative case a matcher that
    // ignored `pageUrl` would still look green.
    await page.goto(`${demoApp.baseUrl}/settings`);
    await expect(page.locator("#root")).toBeAttached();

    const loginTitles = ["Log in button", "Email field", "Password field"];
    for (const title of loginTitles) {
      await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    }
  });
});
