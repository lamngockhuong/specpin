import { describe, expect, it } from "vitest";
import { zipStore } from "../src/shared/zip-store.js";
import { readPickedFiles } from "../src/sources/read-picked-files.js";

const enc = new TextEncoder();
const file = (name: string, bytes: Uint8Array | string) => new File([bytes as BlobPart], name);

describe("readPickedFiles", () => {
  it("reads a loose file as text", async () => {
    expect(await readPickedFiles([file("manifest.json", "{}")])).toEqual([
      { name: "manifest.json", text: "{}" },
    ]);
  });

  it("expands a zip into its members, in archive order", async () => {
    const zip = zipStore([
      { name: "manifest.json", bytes: enc.encode('{"a":1}') },
      { name: "a.spec.json", bytes: enc.encode('{"group":"A"}') },
    ]);
    expect(await readPickedFiles([file("proj.specs.zip", zip)])).toEqual([
      { name: "manifest.json", text: '{"a":1}' },
      { name: "a.spec.json", text: '{"group":"A"}' },
    ]);
  });

  it("preserves pick order across mixed loose files and a zip", async () => {
    const zip = zipStore([{ name: "a.spec.json", bytes: enc.encode("{}") }]);
    const out = await readPickedFiles([file("manifest.json", "{}"), file("proj.specs.zip", zip)]);
    expect(out.map((f) => f.name)).toEqual(["manifest.json", "a.spec.json"]);
  });

  it("rejects an oversized zip by declared size before reading it", async () => {
    const big = file("big.specs.zip", "x");
    Object.defineProperty(big, "size", { value: 8_000_001 });
    await expect(readPickedFiles([big])).rejects.toThrow(/too large/i);
  });
});
