import { type ChildProcess, type SpawnOptions, spawn } from "node:child_process";
import { killTree } from "./kill-tree.js";
import { waitFor } from "./wait-for.js";

/** A spawned background server the harness owns for the length of a fixture.
 *
 *  The sidecar and the demo app differ only in how readiness is probed; the spawn,
 *  output capture, and teardown mechanics are identical — and correctness-sensitive
 *  (process-tree reaping on Windows), so they live here once rather than twice. */
export interface ManagedProcess {
  child: ChildProcess;
  /** Whether the process is gone. Reads Node's own exit fields rather than tracking
   *  a parallel flag, so there is one source of truth. */
  hasExited(): boolean;
  /** Captured stdout+stderr, for a startup-failure message. */
  output(): string;
  /** Terminate the process and its descendants, then wait for it to actually be
   *  gone — a server still holding its port would break the next worker. */
  stop(subject: string): Promise<void>;
}

/** How long to wait for a killed process to disappear. Short by design: on Windows
 *  the kill is already forceful, and on POSIX a server that ignores SIGTERM for two
 *  seconds gets SIGKILL rather than stalling every teardown. */
const EXIT_TIMEOUT_MS = 2_000;

export function spawnManaged(
  command: string,
  args: string[],
  options: SpawnOptions,
): ManagedProcess {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });

  let output = "";
  const capture = (chunk: unknown) => {
    output += chunk;
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);

  const hasExited = () => child.exitCode !== null || child.signalCode !== null;

  const stop = async (subject: string): Promise<void> => {
    if (hasExited()) return;
    killTree(child);
    await waitFor(() => (hasExited() ? true : null), {
      subject: `${subject} to exit`,
      timeout: EXIT_TIMEOUT_MS,
    }).catch(() => killTree(child, "SIGKILL"));
  };

  return { child, hasExited, output: () => output, stop };
}

/** Poll `probe` until the process is serving, failing fast if it dies first and
 *  quoting its output when it never comes up.
 *
 *  On success the output listeners are detached: `output()` is read only to explain a
 *  startup failure, so leaving them attached would grow a string for the whole life
 *  of a worker-scoped server with nothing ever reading it. */
export async function waitUntilReady(
  managed: ManagedProcess,
  probe: () => Promise<boolean>,
  options: { subject: string },
): Promise<void> {
  await waitFor(
    async () => {
      if (managed.hasExited()) {
        throw new Error(`${options.subject} exited early (code ${managed.child.exitCode})`);
      }
      return (await probe()) ? true : null;
    },
    {
      subject: options.subject,
      describeFailure: () => `output:\n${managed.output().trim() || "(none)"}`,
    },
  );
  managed.child.stdout?.removeAllListeners("data");
  managed.child.stderr?.removeAllListeners("data");
}
