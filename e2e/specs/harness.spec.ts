import { tmpdir } from "node:os";
import { expect, test } from "../fixtures/extension.js";

/** Proof of life for the three-process harness. Deliberately asserts nothing about
 *  specs, matching, or rendering — the scenarios under `specs/smoke/` own those. If
 *  this file is red, none of them can be trusted, so it stays the cheapest possible
 *  check that each moving part is actually up. */
test.describe("harness", () => {
  test("loads the built extension and resolves its id from the service worker", async ({
    extensionId,
    serviceWorker,
  }) => {
    expect(extensionId).toMatch(/^[a-p]{32}$/);
    expect(serviceWorker.url()).toContain(extensionId);

    // The worker is not merely present but executing: a registered-yet-dead worker
    // would satisfy the URL checks above and fail every later seeding call.
    const runtimeId = await serviceWorker.evaluate(() => chrome.runtime.id);
    expect(runtimeId).toBe(extensionId);
  });

  test("serves the sidecar over an authenticated health endpoint", async ({ sidecar }) => {
    const response = await sidecar.fetch("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, project: sidecar.project });
  });

  test("rejects an unauthenticated sidecar request", async ({ sidecar }) => {
    // The bearer requirement is the sidecar's whole access model; a harness that
    // silently ran against an open port would be testing something else entirely.
    const response = await fetch(`${sidecar.baseUrl}/health`);
    expect(response.status).toBe(401);
  });

  test("serves the demo app", async ({ demoApp, page }) => {
    const response = await page.goto(demoApp.baseUrl);
    expect(response?.status()).toBe(200);
    await expect(page.locator("#root")).toBeAttached();
  });

  test("points the served corpus at a temp dir whose domains match the demo app", async ({
    sidecar,
    demoApp,
  }) => {
    // The guard behind "zero repo mutation": every write-path test targets this dir.
    expect(sidecar.specsDir.startsWith(tmpdir())).toBe(true);
    // And the guard behind every render assertion: the committed corpus pins
    // 3000/3001, so an unrewritten manifest would match no page at all.
    expect(sidecar.domains).toContain(`127.0.0.1:${demoApp.port}`);
  });

  test("seeds a connection the background can read back", async ({
    connectToSidecar,
    serviceWorker,
    sidecar,
  }) => {
    await connectToSidecar();
    const stored = await serviceWorker.evaluate(async () => {
      const value = await chrome.storage.local.get("specpin:connections");
      return value["specpin:connections"] as Array<{ baseUrl: string }>;
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.baseUrl).toBe(sidecar.baseUrl);
  });
});
