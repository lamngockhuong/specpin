// Shared types for import.config.json — the committed, per-repo manifest
// that drives `specpin-import-flows`. NOT part of the @specpin/spec-schema
// SSOT: this is CLI tooling config, not a `.specs/` artifact the
// sidecar/extension consume, so it gets its own hand-written guard rather
// than an ajv schema (KISS — the shape is small and closed).

/** Adapters implemented by A2. Shared enum for both `flows[]` and
 * `screens[]` entries; which adapter belongs in which section is enforced
 * by the adapter dispatch itself (A2/A3), not by the structural guard. */
export type ImportAdapter = "fsm-table" | "react-router";

export const IMPORT_ADAPTERS: readonly ImportAdapter[] = ["fsm-table", "react-router"];

export interface FlowImportEntry {
  /** Path to the source file, relative to the repo root that owns `.specs/`. */
  file: string;
  /** Named export holding the FSM transition table. */
  export: string;
  adapter: ImportAdapter;
  /** Flow id to stamp onto the generated `flows.json` entry. */
  id: string;
}

export interface ScreenImportEntry {
  /** Path to the source file, relative to the repo root that owns `.specs/`. */
  file: string;
  adapter: ImportAdapter;
  /** Named export holding the route table. Optional: some route modules
   * export the table as the default (or only) export. */
  export?: string;
}

/** The validated shape of import.config.json. Before path resolution,
 * `file` is the relative path as authored; `loadImportConfig` resolves it
 * to an absolute path under the repo root. */
export interface ImportConfig {
  $schema?: string;
  flows: FlowImportEntry[];
  screens: ScreenImportEntry[];
}

export type ValidateImportConfigResult =
  | { ok: true; config: ImportConfig }
  | { ok: false; errors: string[] };

export type LoadImportConfigResult =
  | { ok: true; config: ImportConfig }
  | { ok: false; errors: string[] };
