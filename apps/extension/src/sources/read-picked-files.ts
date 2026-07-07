import { MAX_ZIP_BYTES, unzipStore } from "../shared/zip-load.js";
import type { NamedFile } from "./local-bundle.js";

// The read-side counterpart to parseLocalFiles: turn the Options page's picked
// File objects into the NamedFile[] that parseLocalFiles validates. A `.zip` (an
// exported <project>.specs.zip) is expanded into its manifest.json + *.spec.json
// members; any other file is read as text. Kept out of local-bundle.ts so that
// module stays DOM/File-free and purely testable.

/**
 * Read picked files into NamedFile entries, expanding any exported `.specs.zip`
 * into its members. Reads run concurrently; the result preserves pick order (and
 * a zip's members keep their in-archive order). Rejects an oversized zip before it
 * is read into the page heap. Throws a descriptive Error on an oversized or
 * malformed zip so the caller can surface it (loose-file reads never throw here;
 * their content is validated later by parseLocalFiles).
 */
export async function readPickedFiles(files: File[]): Promise<NamedFile[]> {
  const perFile = await Promise.all(
    files.map(async (f): Promise<NamedFile[]> => {
      if (!/\.zip$/i.test(f.name)) return [{ name: f.name, text: await f.text() }];
      // A STORE archive is never smaller than its contents, so an oversized file
      // can only overrun: reject on size before reading it into memory.
      if (f.size > MAX_ZIP_BYTES) throw new Error(`zip too large (over ${MAX_ZIP_BYTES} bytes)`);
      return unzipStore(new Uint8Array(await f.arrayBuffer()));
    }),
  );
  return perFile.flat();
}
