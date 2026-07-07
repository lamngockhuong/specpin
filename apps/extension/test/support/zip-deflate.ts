import { deflateRawSync } from "node:zlib";
import { crc32 } from "../../src/shared/zip-store.js";

const enc = new TextEncoder();

/** Build a method-8 (DEFLATE) zip for tests. No production encoder emits compressed
 *  entries (zipStore is STORE-only), so this mirrors its header layout with
 *  raw-deflated data and a compressed size that differs from the uncompressed size,
 *  exercising unzipStore's inflate + two-size path. Test-only helper. */
export function zipDeflate(entries: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.bytes);
    const uncompSize = entry.bytes.length;
    const comp = new Uint8Array(deflateRawSync(entry.bytes));
    const compSize = comp.length;

    const lfh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lfh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 8, true); // method 8 = DEFLATE
    lv.setUint16(12, 0x21, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compSize, true);
    lv.setUint32(22, uncompSize, true);
    lv.setUint16(26, nameBytes.length, true);
    lfh.set(nameBytes, 30);
    parts.push(lfh, comp);

    const cdh = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdh.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 8, true); // method 8
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compSize, true);
    cv.setUint32(24, uncompSize, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cdh.set(nameBytes, 46);
    central.push(cdh);

    offset += lfh.length + compSize;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let pos = 0;
  for (const c of all) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
