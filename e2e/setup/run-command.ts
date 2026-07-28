import { type SpawnOptions, spawn } from "node:child_process";

/** Quote one argument for a shell invocation. Only needed because the Windows path
 *  below runs through `cmd.exe`; a repo checked out under `Program Files` would
 *  otherwise split mid-path. */
function quote(arg: string): string {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

/** Spawn options for a command that must go through a shell on Windows.
 *
 *  `pnpm` and `go` resolve through `.cmd` shims there, which `spawn` cannot exec
 *  directly. The whole command is pre-joined into a single string rather than passed
 *  as an args array, because `shell: true` with separate args is deprecated
 *  (DEP0190) — the shell concatenates them unescaped anyway, so doing the quoting
 *  here is both quieter and more correct. */
export function shellSpawnArgs(
  command: string,
  args: string[],
): { command: string; args: string[]; options: Pick<SpawnOptions, "shell"> } {
  if (process.platform !== "win32") {
    return { command, args, options: { shell: false } };
  }
  return { command: [command, ...args.map(quote)].join(" "), args: [], options: { shell: true } };
}

/** Run a command to completion, capturing all output. On a non-zero exit it throws
 *  with that output attached — a build failure inside `globalSetup` is otherwise
 *  reported as an opaque "setup failed". */
export async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<void> {
  const spawned = shellSpawnArgs(command, args);
  const child = spawn(spawned.command, spawned.args, {
    ...spawned.options,
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    output += chunk;
  });

  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${output.trim()}`));
    });
  });
}
