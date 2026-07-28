import { cpus } from "node:os";
import { defineConfig } from "@playwright/test";

const isCI = !!process.env.CI;

/** Playwright's default (half the cores) is tuned for tests that own a page. Each test
 *  here owns a whole persistent Chrome *plus* a sidecar process, and on a 12-core
 *  machine six of those in parallel oversubscribe it badly — service-worker startup and
 *  sidecar handshakes begin missing their deadlines, with a different test losing the
 *  race each run. Sizing to the real per-test weight is what makes `retries: 0`
 *  honest; raising it back would just reintroduce flake that has nothing to teach. */
const LOCAL_WORKERS = Math.max(2, Math.floor(cpus().length / 3));

export default defineConfig({
  testDir: "./specs",
  globalSetup: "./setup/global-setup.ts",

  // `retries: 0` everywhere, CI included. A retry-green suite teaches nothing: the
  // failure classes this harness exists to catch (MV3 service-worker lifecycle, the
  // real content-script boundary) are exactly the ones a retry papers over. Flake is
  // fixed in the harness, never absorbed here.
  retries: 0,

  // A real browser plus two servers per test: generous per-test time, but a hard
  // whole-run cap so a hung fixture fails the job instead of burning a CI slot. The
  // write scenarios can legitimately spend ~25s waiting out the sidecar client's own
  // request timeout, so the per-test budget has to sit well above that.
  timeout: 90_000,
  globalTimeout: isCI ? 20 * 60_000 : 0,
  expect: { timeout: 10_000 },

  // Serial on CI keeps the smoke tier's wall clock predictable against a 2-core
  // runner; locally, parallel workers are also how port isolation gets exercised.
  workers: isCI ? 1 : LOCAL_WORKERS,
  fullyParallel: true,
  forbidOnly: isCI,

  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      // The PR gate: the five load-bearing flows, nothing else. Kept deliberately
      // small — a slow or flaky required check creates pressure to delete the gate.
      name: "smoke",
      testMatch: /specs[\\/]smoke[\\/].*\.spec\.ts/,
    },
    {
      // Nightly + pre-release: every scenario, including the smoke tier.
      name: "full",
      testMatch: /specs[\\/].*\.spec\.ts/,
    },
  ],
});
