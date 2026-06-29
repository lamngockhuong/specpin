// Resolves the platform-matched specpin binary and downloads it from the GitHub
// Release that matches this package's version (tag `cli-v<version>`), verifying
// the published SHA-256 checksum before it is trusted. Shared by the postinstall
// step and the bin launcher's lazy fallback (so `--ignore-scripts` installs still
// self-heal on first run).

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "lamngockhuong/specpin";
const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");

// process.platform / process.arch -> Go release naming used by release-cli.yml.
const GOOS = { linux: "linux", darwin: "darwin", win32: "windows" };
const GOARCH = { x64: "amd64", arm64: "arm64" };

// Combos actually published by the release matrix.
const SUPPORTED = new Set([
  "linux-amd64",
  "linux-arm64",
  "darwin-amd64",
  "darwin-arm64",
  "windows-amd64",
]);

export function getTarget() {
  const goos = GOOS[process.platform];
  const goarch = GOARCH[process.arch];
  if (!goos || !goarch || !SUPPORTED.has(`${goos}-${goarch}`)) {
    throw new Error(
      `specpin: unsupported platform ${process.platform}/${process.arch}. ` +
        "Prebuilt binaries cover linux/darwin (amd64, arm64) and windows (amd64). " +
        `Build from source instead: https://github.com/${REPO}/tree/main/apps/cli`,
    );
  }
  const ext = goos === "windows" ? ".exe" : "";
  return { goos, goarch, asset: `specpin-${goos}-${goarch}${ext}`, ext };
}

export function binaryPath() {
  const { ext } = getTarget();
  return join(pkgRoot, "binary", `specpin${ext}`);
}

function version() {
  return JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")).version;
}

async function fetchBuffer(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`specpin: download failed (${res.status} ${res.statusText}) for ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// Parse a `sha256␠␠filename` line out of checksums.txt for the wanted asset.
function expectedSha(checksums, asset) {
  for (const line of checksums.split("\n")) {
    const [sha, name] = line.trim().split(/\s+/);
    if (name === asset) return sha;
  }
  throw new Error(`specpin: ${asset} not listed in checksums.txt`);
}

// Download the matched binary into binary/ and verify its checksum. No-op if a
// verified binary is already present (unless force).
export async function ensureBinary({ force = false } = {}) {
  const out = binaryPath();
  if (!force && existsSync(out)) return out;

  const { asset } = getTarget();
  const v = version();
  const base = `https://github.com/${REPO}/releases/download/cli-v${v}`;

  const [bin, checksums] = await Promise.all([
    fetchBuffer(`${base}/${asset}`),
    fetchBuffer(`${base}/checksums.txt`).then((b) => b.toString("utf8")),
  ]);

  const want = expectedSha(checksums, asset);
  const got = createHash("sha256").update(bin).digest("hex");
  if (got !== want) {
    throw new Error(`specpin: checksum mismatch for ${asset}\n  expected ${want}\n  got      ${got}`);
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bin);
  chmodSync(out, 0o755);
  return out;
}
