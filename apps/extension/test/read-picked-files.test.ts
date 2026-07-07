import { describe, expect, it } from "vitest";
import { zipStore } from "../src/shared/zip-store.js";
import { parseLocalFiles } from "../src/sources/local-bundle.js";
import { readPickedFiles } from "../src/sources/read-picked-files.js";
import { zipDeflate } from "./support/zip-deflate.js";

const enc = new TextEncoder();
const file = (name: string, bytes: Uint8Array | string) => new File([bytes as BlobPart], name);

const manifest = {
  version: "1.0",
  project: "Test",
  domains: ["localhost:3000"],
  specFiles: ["a.spec.json"],
};
const specFile = {
  group: "G",
  specs: [
    {
      id: "s1",
      title: { en: "T" },
      description: { en: "D" },
      fingerprint: {
        cssSelector: "button",
        xpath: "/button",
        domPath: ["button"],
        tagName: "button",
        attributes: {},
        positionHint: { index: 0, siblingCount: 1 },
      },
    },
  ],
};

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

  it("expands a DEFLATE .specs/ folder zip so its configs reach the parsed bundle", async () => {
    const zip = zipDeflate([
      { name: "manifest.json", bytes: enc.encode(JSON.stringify(manifest)) },
      { name: "a.spec.json", bytes: enc.encode(JSON.stringify(specFile)) },
      {
        name: "guides.json",
        bytes: enc.encode(JSON.stringify({ version: "1.0", guides: [] })),
      },
      {
        name: "views.json",
        bytes: enc.encode(JSON.stringify({ version: "1.0", hidden: ["tag:legacy"] })),
      },
      {
        name: "required.json",
        bytes: enc.encode(JSON.stringify({ version: "1.0", required: ["s1"] })),
      },
    ]);

    const files = await readPickedFiles([file("proj.specs.zip", zip)]);
    const result = parseLocalFiles(files);
    expect(result.errors).toEqual([]);
    expect(result.specs?.specs).toHaveLength(1);
    expect(result.views).toEqual({ version: "1.0", hidden: ["tag:legacy"] });
    expect(result.required).toEqual({ version: "1.0", required: ["s1"] });
    // An empty guides.json validates but carries no guides.
    expect(result.guides).toEqual({ version: "1.0", guides: [] });
  });
});
