import type { SpecsResponse, SpecWithFile } from "@specpin/api-client";
import type { Manifest } from "@specpin/spec-schema";
import { formatErrors, validateManifest, validateSpecFile } from "@specpin/spec-schema";

// A Manual-import bundle: the manifest plus the named *.spec.json files, mirroring
// the on-disk .specs/ layout. Pasted/uploaded in the Options page.
//
//   { "manifest": { ... }, "files": { "login.spec.json": { group, specs[] }, ... } }

// Bounds so a single paste cannot exhaust the background service-worker heap
// (red-team: validate + size-cap before caching, never trust local input).
const MAX_BYTES = 2_000_000; // 2 MB of pasted JSON
const MAX_FILES = 100;
const MAX_SPECS = 5000;

// Keys that signify a prototype-pollution attempt. JSON.parse keeps these as own
// properties, so reject any bundle containing them rather than spreading them.
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export interface BundleResult {
  specs?: SpecsResponse;
  /** Map of `<name>.spec.json` -> its file-level `group`, captured here because
   *  the flatten into `specs[]` keeps only `_file` and drops the group. Carried
   *  onto the stored batch so a later export reconstructs per-file groups. */
  fileGroups?: Record<string, string>;
  errors: string[];
}

function hasDangerousKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasDangerousKey);
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (DANGEROUS_KEYS.has(key)) return true;
      if (hasDangerousKey((value as Record<string, unknown>)[key])) return true;
    }
  }
  return false;
}

/**
 * Parse and validate a Manual-import bundle. Pure (no DOM, no storage) so it is
 * directly testable and safe to run in the Options page (the spec-schema
 * validators are precompiled and CSP-safe). Returns the merged SpecsResponse on
 * success, or a list of human-readable errors. Never throws on bad input.
 */
export function parseLocalBundle(text: string): BundleResult {
  if (text.length > MAX_BYTES) {
    return { errors: [`Input too large (${text.length} bytes, max ${MAX_BYTES}).`] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }

  if (hasDangerousKey(parsed)) {
    return {
      errors: ["Rejected: input contains a forbidden key (__proto__/constructor/prototype)."],
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { errors: ['Expected an object with "manifest" and "files".'] };
  }
  const bundle = parsed as { manifest?: unknown; files?: unknown };
  if (!bundle.manifest || typeof bundle.manifest !== "object") {
    return { errors: ['Missing "manifest" object.'] };
  }
  if (!bundle.files || typeof bundle.files !== "object" || Array.isArray(bundle.files)) {
    return { errors: ['Missing "files" object (map of "<name>.spec.json" -> spec file).'] };
  }

  const errors: string[] = [];

  const manifestResult = validateManifest(bundle.manifest);
  if (!manifestResult.valid) {
    errors.push(`manifest: ${formatErrors(manifestResult.errors)}`);
  }

  const files = bundle.files as Record<string, unknown>;
  const names = Object.keys(files);
  if (names.length > MAX_FILES) {
    return { errors: [`Too many files (${names.length}, max ${MAX_FILES}).`] };
  }

  const specs: SpecWithFile[] = [];
  const fileGroups: Record<string, string> = {};
  for (const name of names) {
    if (!name.endsWith(".spec.json")) {
      errors.push(`${name}: file name must end with .spec.json`);
      continue;
    }
    const content = files[name];
    const fileResult = validateSpecFile(content);
    if (!fileResult.valid) {
      errors.push(`${name}: ${formatErrors(fileResult.errors)}`);
      continue;
    }
    const file = content as { group?: unknown; specs?: unknown[] };
    if (typeof file.group === "string") fileGroups[name] = file.group;
    for (const spec of file.specs ?? []) {
      specs.push({ ...(spec as Record<string, unknown>), _file: name } as SpecWithFile);
    }
  }

  if (specs.length > MAX_SPECS) {
    return { errors: [`Too many specs (${specs.length}, max ${MAX_SPECS}).`] };
  }

  if (errors.length > 0) return { errors };

  return { specs: { manifest: bundle.manifest as Manifest, specs }, fileGroups, errors: [] };
}

/** One picked file: its name and already-read text content. */
export interface NamedFile {
  name: string;
  text: string;
}

/**
 * Assemble a Manual-import bundle from individually picked files (the multi-file
 * picker in the Options page), then validate via parseLocalBundle. Classifies
 * files by name (manifest.json vs *.spec.json), builds the { manifest, files }
 * envelope, and delegates ALL validation (schema, size cap, prototype-pollution,
 * MAX_FILES/MAX_SPECS) to the single parseLocalBundle path. Pure (no DOM, no
 * FileReader) so it is directly testable. Never throws on bad input.
 */
export function parseLocalFiles(files: NamedFile[]): BundleResult {
  const errors: string[] = [];
  let manifest: unknown;
  const specFiles: Record<string, unknown> = {};

  for (const { name, text } of files) {
    // Tolerate path-prefixed names (some pickers expose webkitRelativePath).
    const base = name.split(/[/\\]/).pop() ?? name;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      errors.push(`${base}: invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (base === "manifest.json") {
      if (manifest !== undefined) errors.push("Multiple manifest.json files selected.");
      manifest = parsed;
    } else if (base.endsWith(".spec.json")) {
      specFiles[base] = parsed;
    } else {
      errors.push(`${base}: expected manifest.json or a *.spec.json file`);
    }
  }

  if (manifest === undefined) errors.push("No manifest.json among the selected files.");
  if (Object.keys(specFiles).length === 0) errors.push("No *.spec.json files selected.");
  if (errors.length > 0) return { errors };

  return parseLocalBundle(JSON.stringify({ manifest, files: specFiles }));
}
