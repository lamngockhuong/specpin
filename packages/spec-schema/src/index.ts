// Public surface of @specpin/spec-schema: generated types, runtime validators,
// and the raw JSON Schema. schema/v1.json is the single source of truth; the Go
// CLI embeds the same file and CI cross-validates both implementations.

export type {
  DisplayMode,
  FrameworkHint,
  SpecSource,
  SpecFile,
  Spec,
  ElementFingerprint,
  PositionHint,
  SpecMeta,
  Manifest,
  ManifestSettings,
} from "./types.gen.js";

export {
  validateSpec,
  validateManifest,
  validateSpecFile,
  formatErrors,
  type ValidationResult,
  type ErrorObject,
} from "./validate.js";

// The parsed schema, for consumers that need the raw document (e.g. tooling).
export { schemaV1 } from "./schema.gen.js";

/** $id of the published schema; also the value of the `$schema` field in files. */
export const SCHEMA_V1_ID = "https://specpin.dev/schema/v1.json";
