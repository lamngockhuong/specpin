// @specpin/import-flows public API: the import.config.json loader, the
// adapters + registry, and the config -> Flows/Screens mapping layer. The
// CLI (`cli.ts`) is exposed only as the `specpin-import-flows` bin, not
// re-exported here.

export { extractFsmTable } from "./adapters/fsm-table.js";
export { extractReactRouter } from "./adapters/react-router.js";
export type {
  Adapter,
  ExtractInput,
  FlowExtractResult,
  ScreensExtractResult,
} from "./adapters/registry.js";
export { ADAPTER_REGISTRY } from "./adapters/registry.js";
export { loadImportConfig, validateImportConfig } from "./config.js";
export type {
  FlowImportEntry,
  ImportAdapter,
  ImportConfig,
  LoadImportConfigResult,
  ScreenImportEntry,
  ValidateImportConfigResult,
} from "./config-types.js";
export type { FileDiff } from "./diff.js";
export { diffText } from "./diff.js";
export type { MapConfigResult } from "./map-config.js";
export { mapConfig } from "./map-config.js";
export type { MergeResult } from "./merge.js";
export { mergeFlows, mergeScreens } from "./merge.js";
export type { OwnedIds } from "./owned.js";
export { OWNED_FILE_NAME, readOwnedIds, writeOwnedIds } from "./owned.js";
export { dedupeSlug, slugify } from "./slug.js";
export type { WriteCanonicalResult } from "./write-canonical.js";
export { canonicalize, writeCanonical } from "./write-canonical.js";
