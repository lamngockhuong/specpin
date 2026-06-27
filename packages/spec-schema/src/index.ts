// Public surface of @specpin/spec-schema: generated types, runtime validators,
// and the raw JSON Schema. schema/v1.json is the single source of truth; the Go
// CLI embeds the same file and CI cross-validates both implementations.

// The parsed schema, for consumers that need the raw document (e.g. tooling).
export { resolveLocalized, resolveLocalizedList } from "./resolve-localized.js";
export { schemaV1 } from "./schema.gen.js";
export type {
  DisplayMode,
  ElementFingerprint,
  FrameworkHint,
  LocalizedString,
  Manifest,
  ManifestSettings,
  PositionHint,
  Spec,
  SpecFile,
  SpecMeta,
  SpecSource,
  ViewsConfig,
} from "./types.gen.js";
export {
  type ErrorObject,
  formatErrors,
  type ValidationResult,
  validateManifest,
  validateSpec,
  validateSpecFile,
  validateViews,
} from "./validate.js";

/** $id of the published schema; also the value of the `$schema` field in files. */
export const SCHEMA_V1_ID = "https://specpin.dev/schema/v1.json";
