import {
  type BrowserContext,
  test as base,
  chromium,
  type Page,
  type Worker,
} from "@playwright/test";
import { E2E_TOKEN, EXTENSION_OUTPUT } from "../setup/paths.js";
import { type DemoApp, startDemoApp } from "./demo-app.js";
import { portFor } from "./ports.js";
import { type Sidecar, startSidecar } from "./sidecar.js";
import { waitFor } from "./wait-for.js";
import { openExtensionPage, sendMessage } from "./wake.js";

/** How long to keep re-driving the connection before calling it unreachable.
 *
 *  Comfortably above `SidecarClient`'s own 10s `REQUEST_TIMEOUT_MS`
 *  (`packages/api-client/src/client.ts`), so a single slow fetch cannot exhaust the
 *  budget on its own and several real attempts get a turn. */
const CONNECT_DEADLINE_MS = 40_000;

/** Minimum gap between RECONNECT messages. Slightly above the client's 10s request
 *  timeout so at most one re-drive is ever in flight, keeping the background's
 *  single-writer mutation chain from backing up. */
const RECONNECT_EVERY_MS = 12_000;

export interface WorkerFixtures {
  /** One `vite preview` per worker. Read-only and stateless, so sharing it across a
   *  worker's tests costs nothing and saves a server start per test. */
  demoApp: DemoApp;
}

export interface TestFixtures {
  /** A sidecar over a private temp corpus, fresh per test — the write-path tests
   *  mutate it, so sharing one would couple them. */
  sidecar: Sidecar;
  /** A persistent context with the built MV3 extension loaded. */
  context: BrowserContext;
  /** Resolved from the service-worker URL, never hardcoded: the ID is derived from
   *  the unpacked path and is not stable across machines. */
  extensionId: string;
  /** The extension's background service worker. The harness's handle on extension
   *  state: storage seeding and message probes both go through it. */
  serviceWorker: Worker;
  /** Seed the connection to `sidecar` and wait until the background has it. The
   *  one-line preamble most scenarios need. */
  connectToSidecar: () => Promise<void>;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Playwright reads a fixture's destructured parameter to resolve its dependencies,
  // so `{}` is how a fixture declares that it has none.
  demoApp: [
    // biome-ignore lint/correctness/noEmptyPattern: required by Playwright, see above.
    async ({}, use, workerInfo) => {
      const app = await startDemoApp(portFor(workerInfo.workerIndex, "demoApp"));
      await use(app);
      await app.stop();
    },
    { scope: "worker" },
  ],

  // biome-ignore lint/correctness/noEmptyPattern: required by Playwright, see above.
  sidecar: async ({}, use, testInfo) => {
    // Deliberately NOT dependent on the `demoApp` fixture. All it needs is that
    // server's port *number*, which is a pure function of the worker index — not a
    // value produced by starting it. Declaring the dependency would make Playwright
    // serialize this spawn behind the demo app's whole startup for no reason.
    const sidecar = await startSidecar({
      port: portFor(testInfo.workerIndex, "sidecar"),
      demoPort: portFor(testInfo.workerIndex, "demoApp"),
    });
    await use(sidecar);
    await sidecar.stop();
  },

  // biome-ignore lint/correctness/noEmptyPattern: see the note on `demoApp` above.
  context: async ({}, use) => {
    // Persistent context is mandatory for extensions, and `channel: "chromium"`
    // selects the build whose headless mode actually loads them.
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${EXTENSION_OUTPUT}`,
        `--load-extension=${EXTENSION_OUTPUT}`,
      ],
    });
    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    // The worker may already exist by the time the fixture runs, so check first and
    // fall back to the event — waiting unconditionally would hang on a fast start.
    const [existing] = context.serviceWorkers();
    const serviceWorker = existing ?? (await context.waitForEvent("serviceworker"));
    await use(serviceWorker);
  },

  // The built-in `page` fixture belongs to the default `browser`, which has no
  // extension loaded — a scenario using it would silently test a bare Chrome. Point
  // it at the persistent context instead, reusing the tab it opens with.
  page: async ({ context }, use) => {
    const page: Page = context.pages()[0] ?? (await context.newPage());
    await use(page);
  },

  extensionId: async ({ serviceWorker }, use) => {
    const id = new URL(serviceWorker.url()).host;
    if (!id) throw new Error(`could not derive extension id from ${serviceWorker.url()}`);
    await use(id);
  },

  connectToSidecar: async ({ context, extensionId, sidecar }, use) => {
    await use(async () => {
      // ADD_CONNECTION, not a storage seed.
      //
      // Writing `specpin:connections` directly looks like the cheap setup, and it is
      // a trap: the background's `storage.onChanged` listener handles the surface,
      // ui-locale and local-specs keys but deliberately NOT the connection list, so a
      // seeded connection is noticed only on a worker wake or the 1-minute keepalive
      // alarm. That makes it a coin flip — which is precisely the kind of flake this
      // suite exists to expose rather than tolerate.
      //
      // ADD_CONNECTION is the message the Options page itself sends. One serialized
      // mutation persists the connection, updates the registry, fetches `/specs`, and
      // starts the watch — so when it returns, the precondition is genuinely met and
      // no polling is needed. It still avoids driving the Options *form*, which was
      // the point of seeding in the first place.
      const probe = await openExtensionPage(context, extensionId, "options");
      try {
        const added = await sendMessage<{ ok: boolean; error?: string }>(probe, {
          type: "ADD_CONNECTION",
          baseUrl: sidecar.baseUrl,
          token: E2E_TOKEN,
          label: "e2e",
        });

        // ADD_CONNECTION reports the honest result of exactly ONE connection attempt:
        // `handleAddConnection` fully awaits `registry.reload(id)` before reading the
        // status, and neither `SidecarClient.request` nor `SidecarConnection.reload`
        // retries. So a single transient failure — a fetch that loses its 10s race
        // while the machine is busy launching other browsers — yields a hard
        // "connection failed" for a sidecar that is demonstrably healthy a moment
        // later (observed: node-side /health and /specs both 200 at that instant).
        //
        // Recovering by re-sending RECONNECT is exactly what the product offers a user
        // in that spot (press Reconnect), so this loop is a faithful stand-in for it,
        // not a way of pretending the first failure did not happen. A sidecar that is
        // genuinely unreachable still fails loudly at the deadline.
        //
        // The underlying gap — connect handlers making one attempt with no backoff —
        // is a product robustness issue worth fixing in `sidecar-connection.ts`; it is
        // not something the harness should paper over silently, hence this note.
        // Two distinct recoveries, because there are two distinct failure states.
        //
        // An EMPTY connection list means the background lost the connection entirely: on
        // a cold service worker, `initWorker()` fires `reestablish()` fire-and-forget,
        // OUTSIDE the `mutate()` chain that serializes ADD_CONNECTION. Its
        // `await getConnections()` can read storage *before* our write and then finish
        // *after* it, so `registry.setConnections([])` overwrites the connection we just
        // added. Storage still holds it; the registry does not; `GET_STATUS` reports []
        // and RECONNECT is a no-op because there is nothing to reconnect. Nothing
        // re-reads storage until the 1-minute keepalive alarm — which is why widening
        // deadlines never helped. `GET_FLOWS_SCREENS` (a default, non-refresh read) calls
        // `hydrateFromStorage()`, so it is the lever that repopulates the registry.
        //
        // A PRESENT-but-disconnected connection is the ordinary case: re-drive the
        // network with RECONNECT, sparingly — it runs inside `mutate()` and can spend the
        // client's full 10s request timeout, so a tight retry cadence just queues
        // mutations that never drain.
        let reconnects = 0;
        let rehydrates = 0;
        let polls = 0;
        let lastReconnect = Date.now();
        let lastStatus: unknown;
        try {
          await waitFor(
            async () => {
              polls += 1;
              const status = await sendMessage<{
                connections?: Array<{ connected: boolean; error?: string; errorDetail?: string }>;
              }>(probe, { type: "GET_STATUS" });
              lastStatus = status.connections;

              if (status.connections?.some((c) => c.connected)) return true;

              if (!status.connections?.length) {
                rehydrates += 1;
                await sendMessage(probe, { type: "GET_FLOWS_SCREENS" });
              } else if (Date.now() - lastReconnect >= RECONNECT_EVERY_MS) {
                lastReconnect = Date.now();
                reconnects += 1;
                await sendMessage(probe, { type: "RECONNECT" });
              }
              return null;
            },
            {
              subject: `extension to connect to the sidecar at ${sidecar.baseUrl}`,
              // Must outlast the client's own 10s per-request timeout by enough to fit a
              // couple of real attempts: a deadline equal to that timeout lets one slow
              // fetch consume the whole budget, which reads as "cannot connect" rather
              // than "was not given time to".
              timeout: CONNECT_DEADLINE_MS,
              interval: 500,
            },
          );
        } catch (error) {
          // Whether the sidecar answers Node right now is the one fact that separates an
          // extension-side fault from a dead sidecar. Probed here rather than in
          // `describeFailure`, which is synchronous and so cannot await a fetch.
          const probes = await Promise.all(
            ["/health", "/specs"].map(async (path) => {
              try {
                return `${path} -> ${(await sidecar.fetch(path)).status}`;
              } catch (reason) {
                return `${path} -> threw ${String(reason)}`;
              }
            }),
          );
          throw new Error(
            `${String(error)}\n` +
              `after ${polls} status poll(s), ${rehydrates} re-hydrate(s), ` +
              `${reconnects} RECONNECT(s); ` +
              `ADD_CONNECTION replied ${JSON.stringify(added)}\n` +
              `last GET_STATUS connections: ${JSON.stringify(lastStatus)}\n` +
              `sidecar probed directly from node: ${probes.join(", ")}`,
          );
        }
      } finally {
        await probe.close();
      }
    });
  },
});

export { expect } from "@playwright/test";
