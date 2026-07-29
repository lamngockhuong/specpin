import { DEMO_APP_DIR } from "../setup/paths.js";
import { shellSpawnArgs } from "../setup/run-command.js";
import { spawnManaged, waitUntilReady } from "./managed-process.js";

/** A running `vite preview` serving the demo app's built `dist/`. */
export interface DemoApp {
  /** Origin form (`http://127.0.0.1:<port>`), which is also what the seeded
   *  manifest `domains` are derived from. */
  baseUrl: string;
  port: number;
  stop(): Promise<void>;
}

/** Serve the built demo app on a pinned per-worker port.
 *
 *  `preview` (not `dev`) because it serves the same static bundle a user would load,
 *  with no HMR socket to add nondeterminism. `--strictPort` matters: Vite otherwise
 *  silently walks to the next free port, and the harness would then seed `domains`
 *  for a port nothing is listening on. */
export async function startDemoApp(port: number): Promise<DemoApp> {
  const baseUrl = `http://127.0.0.1:${port}`;
  const spawned = shellSpawnArgs("pnpm", [
    "exec",
    "vite",
    "preview",
    "--port",
    String(port),
    "--strictPort",
    "--host",
    "127.0.0.1",
  ]);
  const managed = spawnManaged(spawned.command, spawned.args, {
    ...spawned.options,
    cwd: DEMO_APP_DIR,
  });

  const stop = () => managed.stop(`demo app on port ${port}`);

  try {
    await waitUntilReady(managed, async () => (await fetch(baseUrl)).status === 200, {
      subject: `demo app on ${baseUrl}`,
    });
  } catch (error) {
    await stop();
    throw error;
  }

  return { baseUrl, port, stop };
}
