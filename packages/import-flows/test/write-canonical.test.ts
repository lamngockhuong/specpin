import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canonicalize, writeCanonical } from "../src/write-canonical.js";

describe("canonicalize", () => {
  it("pretty-prints at 2-space indent with exactly one trailing newline", () => {
    const text = canonicalize({ version: "1.0", flows: [] });
    expect(text).toBe('{\n  "version": "1.0",\n  "flows": []\n}\n');
    expect(text.endsWith("\n\n")).toBe(false);
  });

  it("is idempotent: canonicalizing an already-canonical value round-trips unchanged", () => {
    const value = { b: 2, a: 1, nested: { z: [1, 2, 3] } };
    const once = canonicalize(value);
    const twice = canonicalize(JSON.parse(once));
    expect(twice).toBe(once);
  });
});

describe("writeCanonical", () => {
  let specsDir: string;

  beforeEach(async () => {
    specsDir = await mkdtemp(path.join(tmpdir(), "import-flows-write-canonical-"));
  });

  afterEach(async () => {
    await rm(specsDir, { recursive: true, force: true });
  });

  it("writes a canonical, trailing-newline-terminated file atomically", async () => {
    const result = await writeCanonical(specsDir, "flows.json", { version: "1.0", flows: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const written = await readFile(result.path, "utf8");
    expect(written).toBe('{\n  "version": "1.0",\n  "flows": []\n}\n');

    // No leftover temp file.
    const entries = await readdir(specsDir);
    expect(entries).toEqual(["flows.json"]);
  });

  it("creates the target directory if missing", async () => {
    const nested = path.join(specsDir, "nested");
    const result = await writeCanonical(nested, "screens.json", { version: "1.0", screens: [] });
    expect(result.ok).toBe(true);
  });

  it("rejects a path that escapes specsDir", async () => {
    const result = await writeCanonical(specsDir, "../outside.json", { version: "1.0" });
    expect(result.ok).toBe(false);
  });

  it("rejects writing through an existing symlink", async () => {
    await mkdir(path.join(specsDir, "real"), { recursive: true });
    const target = path.join(specsDir, "real", "target.json");
    await writeFile(target, "{}");
    const linkPath = path.join(specsDir, "flows.json");
    try {
      await symlink(target, linkPath);
    } catch {
      // Symlink creation can require elevated privileges on Windows; skip
      // this assertion in that environment rather than fail the run.
      return;
    }
    const result = await writeCanonical(specsDir, "flows.json", { version: "1.0", flows: [] });
    expect(result.ok).toBe(false);
  });

  it("is idempotent on re-write: identical input produces byte-identical file content", async () => {
    const config = { version: "1.0", flows: [{ id: "a" }] };
    const first = await writeCanonical(specsDir, "flows.json", config);
    const firstBytes = first.ok ? await readFile(first.path, "utf8") : "";
    const second = await writeCanonical(specsDir, "flows.json", config);
    const secondBytes = second.ok ? await readFile(second.path, "utf8") : "";
    expect(secondBytes).toBe(firstBytes);
  });
});
