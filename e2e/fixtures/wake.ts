import type { BrowserContext, Page } from "@playwright/test";
import { waitFor } from "./wait-for.js";

/** Open one of the extension's own pages.
 *
 *  This is also the harness's deliberate service-worker **wake trigger**. An MV3
 *  worker is evicted when idle, and asserting on background state after a bare
 *  timeout is precisely the mistake behind #209 — the panel looked broken because
 *  nobody had established that the worker was up and had answered. Loading an
 *  extension page opens a real message port, which is what actually revives it. */
export async function openExtensionPage(
  context: BrowserContext,
  extensionId: string,
  page: "options" | "popup" | "sidepanel" | "graph" | "welcome",
): Promise<Page> {
  const tab = await context.newPage();
  await tab.goto(`chrome-extension://${extensionId}/${page}.html`);
  return tab;
}

/** Send a message to the background and return its reply.
 *
 *  Sent from an extension page rather than from inside the worker itself: a worker
 *  does not receive its own `sendMessage`, and this is the same path every real
 *  surface (popup, options, side panel) uses — so a scenario exercises the actual
 *  message contract instead of a test-only shortcut. */
export function sendMessage<T>(page: Page, message: Record<string, unknown>): Promise<T> {
  return page.evaluate((msg) => chrome.runtime.sendMessage<T>(msg), message);
}

/** Wake the background, then poll its replies until `predicate` accepts one.
 *
 *  The whole point is that the wake is explicit and the wait is bounded: never a
 *  `waitForTimeout` followed by a hopeful assertion. Returns the accepted reply so a
 *  caller can assert further on it. */
export async function wakeAndWaitFor<T>(
  page: Page,
  message: Record<string, unknown>,
  predicate: (reply: T) => boolean,
  options: { subject: string; timeout?: number } = { subject: "background state" },
): Promise<T> {
  let last: T | undefined;
  const accepted = await waitFor(
    async () => {
      last = await sendMessage<T>(page, message);
      return last !== undefined && predicate(last) ? last : null;
    },
    {
      subject: options.subject,
      timeout: options.timeout,
      describeFailure: () => `last reply: ${JSON.stringify(last)}`,
    },
  );
  return accepted;
}
