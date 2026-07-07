import { describe, expect, it } from "vitest";
import { unzipStore } from "../src/shared/zip-load.js";
import { zipStore } from "../src/shared/zip-store.js";

const enc = new TextEncoder();

describe("unzipStore", () => {
  it("round-trips a zipStore archive: names and UTF-8 text", () => {
    const zip = zipStore([
      { name: "manifest.json", bytes: enc.encode('{"specFiles":["a.spec.json"]}') },
      { name: "a.spec.json", bytes: enc.encode('{"group":"Á",\n  "specs": []}') },
    ]);

    const entries = unzipStore(zip);
    expect(entries).toEqual([
      { name: "manifest.json", text: '{"specFiles":["a.spec.json"]}' },
      { name: "a.spec.json", text: '{"group":"Á",\n  "specs": []}' },
    ]);
  });

  it("skips directory entries", () => {
    const zip = zipStore([
      { name: "specs/", bytes: new Uint8Array(0) },
      { name: "specs/a.spec.json", bytes: enc.encode("{}") },
    ]);
    const entries = unzipStore(zip);
    expect(entries.map((e) => e.name)).toEqual(["specs/a.spec.json"]);
  });

  it("rejects a compressed (non-STORE) entry", () => {
    const zip = zipStore([{ name: "a.spec.json", bytes: enc.encode("{}") }]);
    const view = new DataView(zip.buffer, zip.byteOffset);
    // Flip the STORE method (0) to DEFLATE (8) in both the local header (offset 8)
    // and the central directory header, so the decoder must refuse it.
    view.setUint16(8, 8, true);
    const cdOffset = view.getUint32(zip.length - 22 + 16, true);
    view.setUint16(cdOffset + 10, 8, true);

    expect(() => unzipStore(zip)).toThrow(/compressed/i);
  });

  it("throws on a non-zip / corrupt buffer", () => {
    expect(() => unzipStore(enc.encode("this is not a zip file at all"))).toThrow(/valid zip/i);
  });

  it("throws on a too-small buffer", () => {
    expect(() => unzipStore(new Uint8Array(4))).toThrow(/too small/i);
  });

  it("rejects an archive with too many entries", () => {
    const many = Array.from({ length: 501 }, (_, i) => ({
      name: `s${i}.spec.json`,
      bytes: enc.encode("{}"),
    }));
    expect(() => unzipStore(zipStore(many))).toThrow(/too many entries/i);
  });
});
