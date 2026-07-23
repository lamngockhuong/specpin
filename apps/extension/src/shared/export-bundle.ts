import type { SpecsResponse } from "@specpin/api-client";
import {
  type FlowsConfig,
  type GuidesConfig,
  type Manifest,
  type RequiredConfig,
  SCHEMA_V1_ID,
  type ScreensConfig,
  type Spec,
  type SpecFile,
  type ViewsConfig,
} from "@specpin/spec-schema";
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

/** manifest.json + per-group *.spec.json, plus any of the optional `.specs/` config
 *  files (guides.json / views.json / required.json / flows.json / screens.json),
 *  keyed by file name. */
export type BundleFiles = Record<
  string,
  Manifest | SpecFile | GuidesConfig | ViewsConfig | RequiredConfig | FlowsConfig | ScreensConfig
>;

/** The optional config inputs a caller can carry into an export. All optional so
 *  the paste/authoring paths (no config) and the sidecar path (no `required`) each
 *  pass only what they have; `bundleToFiles` decides per file whether to emit. */
export interface BundleConfig {
  /** `_file` -> file-level `group`, to reconstruct per-file groups (local batches). */
  fileGroups?: Record<string, string>;
  /** Team guides -> `guides.json`, emitted when it holds at least one guide. */
  guides?: GuidesConfig;
  /** Team-default hidden facets -> `views.json`, emitted when `hidden` is non-empty. */
  views?: ViewsConfig;
  /** Required-id checklist -> `required.json`, emitted when `required` is non-empty. */
  required?: RequiredConfig;
  /** Status-flow FSM config -> `flows.json`, emitted when `flows` is non-empty. */
  flows?: FlowsConfig;
  /** Screen-transition config -> `screens.json`, emitted when `screens`/`transitions`
   *  is non-empty. */
  screens?: ScreensConfig;
}

/** Reconstruct the file set for a specs payload (a local batch's `specs`, or a
 *  sidecar connection's cache). `group` per file comes from `config.fileGroups` when
 *  the caller has it (local batches) or a file-base fallback otherwise (sidecar caches
 *  flatten away the per-file group); the `_file` shadow field is stripped from each
 *  spec; every file gets `$schema = SCHEMA_V1_ID`. Output file names are sanitized
 *  and de-collided so two source files never both map to one name (and never to
 *  `manifest.json`).
 *
 *  The optional `.specs/` config files (guides.json / views.json / required.json /
 *  flows.json / screens.json) are appended when the caller supplies one AND it has
 *  real content, so a full-folder import round-trips back out losslessly. They are
 *  discovered by name on re-import, so they are NOT added to `manifest.specFiles`
 *  (which lists spec files only). */
export function bundleToFiles(payload: SpecsResponse, config: BundleConfig = {}): BundleFiles {
  const byFile = new Map<string, { group: string; specs: Spec[] }>();
  const used = new Set<string>(["manifest.json"]); // reserved: never collide
  const resolved = new Map<string, string>(); // original _file -> output name

  for (const specWithFile of payload.specs) {
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
      bucket = { group: config.fileGroups?.[origFile] ?? groupFromFileName(outName), specs: [] };
      byFile.set(outName, bucket);
    }
    // Strip the _file shadow field; the rest is a plain Spec.
    const { _file, ...spec } = specWithFile;
    bucket.specs.push(spec as Spec);
  }

  const files: BundleFiles = {};
  const manifest: Manifest = {
    ...payload.manifest,
    $schema: SCHEMA_V1_ID,
    specFiles: [...byFile.keys()],
  };
  files["manifest.json"] = manifest;
  for (const [name, { group, specs }] of byFile) {
    files[name] = { $schema: SCHEMA_V1_ID, group, specs } satisfies SpecFile;
  }

  // Append the optional `.specs/` config files, but only when they carry content -
  // an empty guides/views/required config is the same as not having the file, and
  // omitting it keeps the zip matching what is actually on disk. `$schema` is forced
  // last so a canonical id lands even if the source config omitted or differs on it.
  if (config.guides?.guides?.length) {
    files["guides.json"] = { ...config.guides, $schema: SCHEMA_V1_ID } satisfies GuidesConfig;
  }
  if (config.views?.hidden?.length) {
    files["views.json"] = { ...config.views, $schema: SCHEMA_V1_ID } satisfies ViewsConfig;
  }
  if (config.required?.required?.length) {
    files["required.json"] = { ...config.required, $schema: SCHEMA_V1_ID } satisfies RequiredConfig;
  }
  if (config.flows?.flows?.length) {
    files["flows.json"] = { ...config.flows, $schema: SCHEMA_V1_ID } satisfies FlowsConfig;
  }
  if (config.screens?.screens?.length || config.screens?.transitions?.length) {
    files["screens.json"] = { ...config.screens, $schema: SCHEMA_V1_ID } satisfies ScreensConfig;
  }
  return files;
}

/** A safe download file name for a project's export: `<slug>.specs.zip`. */
export function exportZipName(project: string): string {
  return `${slugify(project) || "specpin-export"}.specs.zip`;
}
