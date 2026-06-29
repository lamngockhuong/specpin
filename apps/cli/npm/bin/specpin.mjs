#!/usr/bin/env node
// Launcher for the `specpin` command. Execs the platform-matched Go binary,
// forwarding args, stdio, and exit code. If the binary is missing (e.g. install
// ran with --ignore-scripts, or postinstall hit a network error), it is fetched
// and verified on first use.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { binaryPath, ensureBinary } from "../scripts/download.mjs";

async function resolveBinary() {
  const path = binaryPath();
  if (existsSync(path)) return path;
  console.error("specpin: downloading binary (first run)...");
  return ensureBinary();
}

let bin;
try {
  bin = await resolveBinary();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const child = spawn(bin, process.argv.slice(2), { stdio: "inherit" });
child.on("error", (err) => {
  console.error(`specpin: failed to launch binary (${err.message})`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
