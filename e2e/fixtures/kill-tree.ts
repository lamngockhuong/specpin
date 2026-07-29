import { type ChildProcess, spawn } from "node:child_process";

/** Kill a spawned process *and its descendants*.
 *
 *  On Windows a shell-launched child is `cmd.exe`, whose own child is the real
 *  server. `child.kill()` reaps only the shell and orphans the server, which then
 *  keeps holding its port — and `--strictPort` turns that into a baffling failure on
 *  the *next* run. `taskkill /T` walks the tree.
 *
 *  `/F` is not optional. A graceful `taskkill` asks politely via a window message,
 *  which console programs like the Go sidecar and Node do not answer: it fails with
 *  "This process can only be terminated forcefully (with /F option)" every single
 *  time. Attempting graceful-then-forceful therefore bought nothing and cost the
 *  caller its entire exit timeout on every teardown, so the Windows path goes
 *  straight to force.
 *
 *  POSIX keeps the real two-stage signal path: SIGTERM lets the sidecar run its own
 *  shutdown, SIGKILL is the fallback. It needs no tree walk — the harness spawns
 *  those without a shell, so the child *is* the server. */
export function killTree(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== "win32" || child.pid === undefined) {
    child.kill(signal);
    return;
  }
  const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
  // A dead-on-arrival pid makes taskkill exit non-zero; that is the outcome we
  // wanted anyway, so never let it surface as an unhandled error.
  killer.on("error", () => child.kill(signal));
}
