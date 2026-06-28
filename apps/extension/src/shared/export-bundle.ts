import { type Manifest, SCHEMA_V1_ID, type Spec, type SpecFile } from "@specpin/spec-schema";
import type { ManualBatch } from "./config.js";
import { slugify } from "./slug.js";

// Reconstruct a manual batch's on-disk .specs/ layout (manifest.json + one
// *.spec.json per file group) so it can be zipped and committed into a repo's
// .specs/, or re-imported through the multi-file picker. Round-trips back through
// parseLocalBundle / `specpin serve`. Pure + testable.

/** Sanitize an untrusted bundle key into a safe `*.spec.json` basename. Zip-slip
 *  guard: `_file` originates from user-imported bundle keys, so drop any directory
 *  portion, strip `..`/absolute paths, and restrict to a safe charset. */
export function sanitizeSpecFileName(raw: string): string {
  const base = (raw.split(/[/\\]/).pop() ?? "").trim();
  const stripped = base.replace(/\.spec\.json$/i, "");
  const safe = stripped.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return `${safe || "specs"}.spec.json`;
}

/** A human group name derived from a file base, used when a batch recorded no
 *  group for that file (e.g. pre-plan batches, or a brand-new local spec):
 *  "dashboard.spec.json" -> "Dashboard". Takes the basename so a path-prefixed
 *  name is handled too. Shared with the background's capture-into-local default. */
export function groupFromFileName(file: string): string {
  const name = file.split(/[/\\]/).pop() ?? file;
  return groupFromBase(name);
}

function groupFromBase(file: string): string {
  const base = file.replace(/\.spec\.json$/i, "");
  const words = base.replace(/[-_]+/g, " ").trim();
  return words ? words.replace(/\b\w/g, (c) => c.toUpperCase()) : "Specs";
}

/** manifest.json plus the per-group *.spec.json files, keyed by file name. */
export type BundleFiles = Record<string, Manifest | SpecFile>;

/** Reconstruct the file set for a batch. `group` per file comes from
 *  `batch.fileGroups` (Phase 1) or a file-base fallback; the `_file` shadow field
 *  is stripped from each spec; every file gets `$schema = SCHEMA_V1_ID`. Output
 *  file names are sanitized and de-collided so two source files never both map to
 *  one name (and never to `manifest.json`). */
export function bundleToFiles(batch: ManualBatch): BundleFiles {
  const byFile = new Map<string, { group: string; specs: Spec[] }>();
  const used = new Set<string>(["manifest.json"]); // reserved: never collide
  const resolved = new Map<string, string>(); // original _file -> output name

  for (const specWithFile of batch.specs.specs) {
    const origFile = specWithFile._file || "specs.spec.json";
    let outName = resolved.get(origFile);
    if (!outName) {
      const sanitized = sanitizeSpecFileName(origFile);
      let candidate = sanitized;
      for (let n = 2; used.has(candidate); n++) {
        candidate = sanitized.replace(/\.spec\.json$/i, `-${n}.spec.json`);
      }
      outName = candidate;
      used.add(outName);
      resolved.set(origFile, outName);
    }
    let bucket = byFile.get(outName);
    if (!bucket) {
      bucket = { group: batch.fileGroups?.[origFile] ?? groupFromFileName(outName), specs: [] };
      byFile.set(outName, bucket);
    }
    // Strip the _file shadow field; the rest is a plain Spec.
    const { _file, ...spec } = specWithFile;
    bucket.specs.push(spec as Spec);
  }

  const files: BundleFiles = {};
  const manifest: Manifest = {
    ...batch.specs.manifest,
    $schema: SCHEMA_V1_ID,
    specFiles: [...byFile.keys()],
  };
  files["manifest.json"] = manifest;
  for (const [name, { group, specs }] of byFile) {
    files[name] = { $schema: SCHEMA_V1_ID, group, specs } satisfies SpecFile;
  }
  return files;
}

/** A safe download file name for a project's export: `<slug>.specs.zip`. */
export function exportZipName(project: string): string {
  return `${slugify(project) || "specpin-export"}.specs.zip`;
}
