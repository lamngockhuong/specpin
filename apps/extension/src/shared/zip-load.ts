// Minimal ZIP decoder: the read counterpart to zip-store.ts. It exists so the
// Options page can re-import a `<project>.specs.zip` produced by the export feature,
// or a folder zipped with any normal tool, without any dependency (only
// webextension-polyfill today) and while staying CSP-clean (pure Uint8Array/DataView
// math for the container, native DecompressionStream for inflate - no eval). Decodes
// method 0 (STORE, what zipStore emits) and method 8 (DEFLATE, what OS/CLI zip tools
// emit by default); any other method is rejected with a clear error rather than
// silently mishandled. Central-directory driven (authoritative sizes), so entries
// written with a streaming data descriptor still read correctly.

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

// Untrusted input bounds (red-team: a crafted zip must not exhaust the page heap
// before parseLocalFiles' own caps run). Generous vs the 2 MB bundle cap downstream.
const MAX_ENTRIES = 500;
/** Cap on both the raw archive and the decoded total. Callers should reject a
 *  picked file over this size BEFORE reading it into memory (a STORE archive is
 *  never smaller than its contents, so an oversized file can only overrun). */
export const MAX_ZIP_BYTES = 8_000_000;

/** One decoded entry: its archive name and UTF-8 text content. */
export interface UnzipEntry {
  name: string;
  text: string;
}

/** Scan backward from the end for the End Of Central Directory signature. The EOCD
 *  is 22 bytes plus an optional trailing comment (<= 65535), so bound the scan. */
function findEocd(view: DataView, len: number): number {
  const min = Math.max(0, len - (22 + 0xffff));
  for (let i = len - 22; i >= min; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  throw new Error("not a valid zip (no end-of-central-directory record)");
}

/** Inflate a raw DEFLATE byte range via the native `DecompressionStream`
 *  ("deflate-raw" = the bare method-8 stream a zip stores, no zlib header). CSP-safe
 *  and dependency-free. Throws a clear error where the API is absent (older browsers)
 *  or the data is not valid DEFLATE, so a bad entry surfaces rather than corrupts.
 *
 *  Reads the inflate stream CHUNK BY CHUNK against `budget` (bytes still allowed
 *  before `MAX_ZIP_BYTES`), aborting the moment the running total exceeds it. This is
 *  the zip-bomb guard: DEFLATE expands up to ~1000x, so buffering a whole entry before
 *  checking its size would let one crafted entry exhaust the heap. Do not replace this
 *  with `new Response(stream).arrayBuffer()` (which allocates the full entry first). */
async function inflateRaw(bytes: Uint8Array, budget: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("this browser cannot read compressed (DEFLATE) zips");
  }
  // Cast: the DOM lib narrows BlobPart to ArrayBuffer-backed views, but a zip
  // subarray is always ArrayBuffer-backed (never SharedArrayBuffer) at runtime.
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value as Uint8Array;
    total += chunk.byteLength;
    if (total > budget) {
      await reader.cancel();
      throw new Error(`zip contents too large (over ${MAX_ZIP_BYTES} bytes)`);
    }
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.byteLength;
  }
  return out;
}

/**
 * Decode a zip (STORE + DEFLATE) into its entries. Throws a descriptive Error on any
 * malformed input or an unsupported compression method (never returns partial
 * garbage). Directory entries (names ending in "/") are skipped. No DOM/storage;
 * async only because DEFLATE inflates through a stream - safe to run in the Options
 * page and directly testable.
 */
export async function unzipStore(data: Uint8Array): Promise<UnzipEntry[]> {
  const len = data.length;
  if (len < 22) throw new Error("not a valid zip (too small)");

  const view = new DataView(data.buffer, data.byteOffset, len);
  const eocd = findEocd(view, len);
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true); // central directory offset

  if (count > MAX_ENTRIES)
    throw new Error(`zip has too many entries (${count}, max ${MAX_ENTRIES})`);

  const decoder = new TextDecoder("utf-8", { fatal: false });
  const entries: UnzipEntry[] = [];
  let totalBytes = 0;

  for (let i = 0; i < count; i++) {
    if (ptr + 46 > len || view.getUint32(ptr, true) !== CENTRAL_SIG) {
      throw new Error("not a valid zip (bad central directory)");
    }
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true); // on-disk bytes (== uncompressed for STORE)
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);

    if (ptr + 46 + nameLen > len) throw new Error("not a valid zip (bad central directory)");
    const name = decoder.decode(data.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    // Skip directory entries (no data to import).
    if (name.endsWith("/")) continue;

    if (method !== 0 && method !== 8) {
      throw new Error(`entry "${name}" uses unsupported compression method ${method}`);
    }

    // Locate the data via the local file header (its name/extra lengths can differ
    // from the central record's, so read them fresh).
    if (localOffset + 30 > len || view.getUint32(localOffset, true) !== LOCAL_SIG) {
      throw new Error(`not a valid zip (bad local header for "${name}")`);
    }
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compSize > len) {
      throw new Error(`not a valid zip (truncated data for "${name}")`);
    }

    const raw = data.subarray(dataStart, dataStart + compSize);
    // DEFLATE can expand well past the archive size, so inflate is bounded by the
    // remaining decoded budget (aborts mid-stream on a zip bomb); STORE data is
    // already bounded by the archive size but still counts toward the total.
    const bytes = method === 0 ? raw : await inflateRaw(raw, MAX_ZIP_BYTES - totalBytes);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_ZIP_BYTES) {
      throw new Error(`zip contents too large (over ${MAX_ZIP_BYTES} bytes)`);
    }

    entries.push({ name, text: decoder.decode(bytes) });
  }

  return entries;
}
