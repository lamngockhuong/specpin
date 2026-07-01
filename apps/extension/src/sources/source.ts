import type { GuidesConfig, SpecsResponse, ViewsConfig } from "@specpin/api-client";
import type { Spec } from "@specpin/spec-schema";

// SpecSource abstracts where specs come from. Phase 1 ships only SidecarSource,
// but the interface is shaped for the deferred FileSystem + ManualImport
// adapters so adding them never touches the rest of the extension.
export interface SpecSource {
  readonly id: string;
  /** Whether this source can currently serve specs (e.g. sidecar reachable). */
  isAvailable(): Promise<boolean>;
  loadSpecs(): Promise<SpecsResponse>;
  saveSpec(file: string, spec: Spec): Promise<void>;
  /** Update an existing spec in place, addressed by its stable `id`. The backing
   *  store locates the spec across files, so no file argument is needed. Read-only
   *  sources (Manual) reject this. */
  updateSpec(id: string, spec: Spec): Promise<void>;
  /** Delete an existing spec, addressed by its stable `id`. The backing store
   *  locates the spec across files. Read-only sources (Manual) reject this. */
  deleteSpec(id: string): Promise<void>;
  /** Optional team-default visibility config (sidecar /views). Sources that do
   *  not support it (FileSystem/Manual) omit these; the registry treats a missing
   *  loadViews as "no team default". */
  loadViews?(): Promise<ViewsConfig>;
  saveViews?(config: ViewsConfig): Promise<void>;
  /** Optional named-guides config (sidecar /guides). Sources that do not support
   *  it omit these; the registry treats a missing loadGuides as "no team guides". */
  loadGuides?(): Promise<GuidesConfig>;
  saveGuides?(config: GuidesConfig): Promise<void>;
  /** Optional live-change subscription; returns an unsubscribe function.
   *  `options.jitterMs` randomizes reconnect timing across concurrent watches. */
  watch?(onChange: () => void, options?: { jitterMs?: number }): () => void;
}
