import { expect, test } from "../../fixtures/extension.js";
import { countSpecs } from "../../fixtures/specs-fs.js";
import { openExtensionPage, wakeAndWaitFor } from "../../fixtures/wake.js";
import { E2E_TOKEN } from "../../setup/paths.js";

/** One connection's slice of a `GET_STATUS` reply (`shared/messaging.ts` StatusResult
 *  -> ConnectionStatus). Narrowed to what this scenario asserts. Note the absence of
 *  a token field: `ConnectionStatus` deliberately never carries the bearer secret. */
interface ConnectionStatus {
  id: string;
  baseUrl: string;
  project: string | null;
  connected: boolean;
  specCount: number;
  domains: string[];
  enabled: boolean;
  error?: string;
}

interface StatusResult {
  configured: boolean;
  enabled: boolean;
  connections?: ConnectionStatus[];
}

/** run-guide §6 — a seeded connection actually reaches the sidecar.
 *
 *  Storage is seeded rather than typed into the Options form; the background still has
 *  to do the real work of reading it, fetching `/specs`, and reporting health. */
test.describe("§6 connect to sidecar", () => {
  test("reports connected, with the project and spec count from the corpus", async ({
    context,
    extensionId,
    sidecar,
    connectToSidecar,
  }) => {
    await connectToSidecar();

    // Opening an extension page is the explicit wake; the poll then bounds how long
    // the background gets to finish its first load. Never a bare timeout (#209).
    const options = await openExtensionPage(context, extensionId, "options");
    const status = await wakeAndWaitFor<StatusResult>(
      options,
      { type: "GET_STATUS" },
      (reply) => reply.connections?.[0]?.connected === true,
      { subject: "sidecar connection to report connected" },
    );

    const connection = status.connections?.[0];
    expect(connection).toBeDefined();
    expect(connection?.baseUrl).toBe(sidecar.baseUrl);
    expect(connection?.project).toBe(sidecar.project);
    expect(connection?.enabled).toBe(true);
    expect(connection?.error).toBeUndefined();

    // Counted from the temp corpus on disk rather than hardcoded, so growing the demo
    // fixture does not silently invalidate this assertion.
    expect(connection?.specCount).toBe(await countSpecs(sidecar.specsDir));

    // The manifest's rewritten domains are what route specs to the demo app's port.
    expect(connection?.domains).toEqual(sidecar.domains);
  });

  test("never exposes the bearer token over GET_STATUS", async ({
    context,
    extensionId,
    connectToSidecar,
  }) => {
    await connectToSidecar();
    const options = await openExtensionPage(context, extensionId, "options");
    const status = await wakeAndWaitFor<StatusResult>(
      options,
      { type: "GET_STATUS" },
      (reply) => reply.connections?.[0]?.connected === true,
      { subject: "sidecar connection to report connected" },
    );

    // RT-SA6: an unprivileged status read must not be able to lift secrets. Asserted
    // on the serialized reply so a token smuggled under any key name is caught, not
    // just a field literally called `token`.
    expect(JSON.stringify(status)).not.toContain(E2E_TOKEN);
  });
});
