import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readOwnedIds, writeOwnedIds } from "../src/owned.js";

describe("readOwnedIds / writeOwnedIds", () => {
  let specsDir: string;

  beforeEach(async () => {
    specsDir = await mkdtemp(path.join(tmpdir(), "import-flows-owned-"));
  });

  afterEach(async () => {
    await rm(specsDir, { recursive: true, force: true });
  });

  it("returns the empty owned set when .import-owned.json does not exist", async () => {
    const owned = await readOwnedIds(specsDir);
    expect(owned.flows.size).toBe(0);
    expect(owned.screens.size).toBe(0);
  });

  it("returns the empty owned set on corrupt JSON (conservative: never throws)", async () => {
    await writeFile(path.join(specsDir, ".import-owned.json"), "{ not json");
    const owned = await readOwnedIds(specsDir);
    expect(owned.flows.size).toBe(0);
    expect(owned.screens.size).toBe(0);
  });

  it("returns the empty owned set when the shape doesn't match (conservative)", async () => {
    await writeFile(
      path.join(specsDir, ".import-owned.json"),
      JSON.stringify({ version: "1.0", flows: "not-an-array", screens: [] }),
    );
    const owned = await readOwnedIds(specsDir);
    expect(owned.flows.size).toBe(0);
  });

  it("round-trips a written owned set, sorted", async () => {
    const result = await writeOwnedIds(specsDir, ["z-flow", "a-flow"], ["z-screen", "a-screen"]);
    expect(result.ok).toBe(true);

    const owned = await readOwnedIds(specsDir);
    expect([...owned.flows]).toEqual(["a-flow", "z-flow"]);
    expect([...owned.screens]).toEqual(["a-screen", "z-screen"]);
  });

  it("writes canonical (2-space, trailing newline) content", async () => {
    await writeOwnedIds(specsDir, ["a"], ["b"]);
    const raw = await readFile(path.join(specsDir, ".import-owned.json"), "utf8");
    expect(raw).toBe(
      '{\n  "version": "1.0",\n  "flows": [\n    "a"\n  ],\n  "screens": [\n    "b"\n  ]\n}\n',
    );
  });

  it("dedupes ids passed with repeats", async () => {
    await writeOwnedIds(specsDir, ["a", "a", "b"], []);
    const owned = await readOwnedIds(specsDir);
    expect([...owned.flows]).toEqual(["a", "b"]);
  });
});
