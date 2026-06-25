import type { SpecSource } from "./source.js";

// Source selection: try each source in fallback order, return the first that is
// available. In the MVP only SidecarSource is passed; the deferred FileSystem
// and ManualImport adapters slot into this list without other changes.
export async function selectSource(sources: SpecSource[]): Promise<SpecSource | null> {
  for (const source of sources) {
    if (await source.isAvailable()) return source;
  }
  return null;
}
