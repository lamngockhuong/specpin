import { describe, expect, it } from "vitest";
import { crc32, zipStore } from "../src/shared/zip-store.js";

const enc = new TextEncoder();

/** Read a little-endian uint32 at `off`. */
function u32(bytes: Uint8Array, off: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(off, true);
}

describe("crc32", () => {
  it("matches the canonical PKZIP vector", () => {
    // crc32("123456789") === 0xCBF43926 pins the reflected 0xEDB88320 polynomial;
    // a wrong polynomial would pass lenient unzippers but fail this.
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
  });

  it("is 0 for empty input", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("zipStore", () => {
  it("writes a valid STORE archive: signatures, entry count, consistent offsets", () => {
    const zip = zipStore([
      { name: "manifest.json", bytes: enc.encode("{}") },
      { name: "a.spec.json", bytes: enc.encode('{"group":"A"}') },
    ]);

    // First local file header signature.
    expect(u32(zip, 0)).toBe(0x04034b50);

    // EOCD is the last 22 bytes (no comment).
    const eocd = zip.length - 22;
    expect(u32(zip, eocd)).toBe(0x06054b50);
    // Total entries (offset 10 in EOCD).
    const total = new DataView(zip.buffer, zip.byteOffset).getUint16(eocd + 10, true);
    expect(total).toBe(2);
    // Central-directory offset (offset 16) points at a central dir header.
    const cdOffset = u32(zip, eocd + 16);
    expect(u32(zip, cdOffset)).toBe(0x02014b50);
  });

  it("produces an empty-but-valid archive for no entries", () => {
    const zip = zipStore([]);
    expect(zip.length).toBe(22); // just the EOCD
    expect(u32(zip, 0)).toBe(0x06054b50);
  });
});
