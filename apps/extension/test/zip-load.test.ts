import { describe, expect, it } from "vitest";
import { unzipStore } from "../src/shared/zip-load.js";
import { zipStore } from "../src/shared/zip-store.js";
import { zipDeflate } from "./support/zip-deflate.js";

const enc = new TextEncoder();

describe("unzipStore", () => {
  it("round-trips a zipStore archive: names and UTF-8 text", async () => {
    const zip = zipStore([
      { name: "manifest.json", bytes: enc.encode('{"specFiles":["a.spec.json"]}') },
      { name: "a.spec.json", bytes: enc.encode('{"group":"Á",\n  "specs": []}') },
    ]);

    const entries = await unzipStore(zip);
    expect(entries).toEqual([
      { name: "manifest.json", text: '{"specFiles":["a.spec.json"]}' },
      { name: "a.spec.json", text: '{"group":"Á",\n  "specs": []}' },
    ]);
  });

  it("decodes a DEFLATE (method 8) entry byte-identically", async () => {
    // A body long/repetitive enough that DEFLATE actually shrinks it, so the
    // compressed size differs from the uncompressed size (exercises the two-size path).
    const body = `{"specs":[${'{"id":"x"},'.repeat(50)}{"id":"y"}]}`;
    const zip = zipDeflate([
      { name: "manifest.json", bytes: enc.encode('{"project":"P"}') },
      { name: "a.spec.json", bytes: enc.encode(body) },
    ]);

    const entries = await unzipStore(zip);
    expect(entries).toEqual([
      { name: "manifest.json", text: '{"project":"P"}' },
      { name: "a.spec.json", text: body },
    ]);
  });

  it("aborts a DEFLATE entry that inflates past the size cap (zip-bomb guard)", async () => {
    // ~12 MB of a single repeated byte deflates tiny but exceeds MAX_ZIP_BYTES (8 MB)
    // when inflated: the streaming budget must abort rather than buffer it all.
    const bomb = new Uint8Array(12_000_000); // all zeros, highly compressible
    const zip = zipDeflate([{ name: "big.spec.json", bytes: bomb }]);
    expect(zip.length).toBeLessThan(1_000_000); // compressed archive stays small
    await expect(unzipStore(zip)).rejects.toThrow(/too large/i);
  });

  it("throws on a corrupt DEFLATE stream", async () => {
    const zip = zipDeflate([{ name: "a.spec.json", bytes: enc.encode("{}") }]);
    // Corrupt the compressed payload: the local file header is 30 bytes + name, so
    // the deflate data starts right after. A leading 0xFF sets a reserved block type
    // (BTYPE=11), which is invalid DEFLATE and must surface as an error.
    const nameLen = new DataView(zip.buffer, zip.byteOffset).getUint16(26, true);
    zip[30 + nameLen] = 0xff;
    await expect(unzipStore(zip)).rejects.toThrow();
  });

  it("skips directory entries", async () => {
    const zip = zipStore([
      { name: "specs/", bytes: new Uint8Array(0) },
      { name: "specs/a.spec.json", bytes: enc.encode("{}") },
    ]);
    const entries = await unzipStore(zip);
    expect(entries.map((e) => e.name)).toEqual(["specs/a.spec.json"]);
  });

  it("rejects an unsupported compression method (not STORE or DEFLATE)", async () => {
    const zip = zipStore([{ name: "a.spec.json", bytes: enc.encode("{}") }]);
    const view = new DataView(zip.buffer, zip.byteOffset);
    // Flip the STORE method (0) to an unsupported one (99) in both the local header
    // (offset 8) and the central directory header, so the decoder must refuse it.
    view.setUint16(8, 99, true);
    const cdOffset = view.getUint32(zip.length - 22 + 16, true);
    view.setUint16(cdOffset + 10, 99, true);

    await expect(unzipStore(zip)).rejects.toThrow(/unsupported compression method/i);
  });

  it("throws on a non-zip / corrupt buffer", async () => {
    await expect(unzipStore(enc.encode("this is not a zip file at all"))).rejects.toThrow(
      /valid zip/i,
    );
  });

  it("throws on a too-small buffer", async () => {
    await expect(unzipStore(new Uint8Array(4))).rejects.toThrow(/too small/i);
  });

  it("rejects an archive with too many entries", async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({
      name: `s${i}.spec.json`,
      bytes: enc.encode("{}"),
    }));
    await expect(unzipStore(zipStore(many))).rejects.toThrow(/too many entries/i);
  });
});
