import type { Spec } from "@specpin/spec-schema";
import type { SpecsResponse } from "@specpin/api-client";

// SpecSource abstracts where specs come from. Phase 1 ships only SidecarSource,
// but the interface is shaped for the deferred FileSystem + ManualImport
// adapters so adding them never touches the rest of the extension.
export interface SpecSource {
  readonly id: string;
  /** Whether this source can currently serve specs (e.g. sidecar reachable). */
  isAvailable(): Promise<boolean>;
  loadSpecs(): Promise<SpecsResponse>;
  saveSpec(file: string, spec: Spec): Promise<void>;
  /** Optional live-change subscription; returns an unsubscribe function. */
  watch?(onChange: () => void): () => void;
}
