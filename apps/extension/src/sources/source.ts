import type {
  FlowsConfig,
  GuidesConfig,
  ScreensConfig,
  SpecsResponse,
  ViewsConfig,
} from "@specpin/api-client";
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
  /** Optional status-flow FSM config (sidecar /flows). Sources that do not
   *  support it omit this; the connection treats a missing loadFlows as "no
   *  flows.json". */
  loadFlows?(): Promise<FlowsConfig>;
  /** Optional screen-transition config (sidecar /screens). Sources that do not
   *  support it omit this; the connection treats a missing loadScreens as "no
   *  screens.json". */
  loadScreens?(): Promise<ScreensConfig>;
  /** Write the screen-transition config (Phase B3's ghost-edge approve).
   *  Sources that do not support writing (FileSystem/Manual) omit this. */
  saveScreens?(config: ScreensConfig): Promise<void>;
  /** Write the status-flow FSM config (Track C's C1 editor Save). Sources
   *  that do not support writing (FileSystem/Manual) omit this. */
  saveFlows?(config: FlowsConfig): Promise<void>;
  /** Optional shot inventory (sidecar GET /shots): the screenIds every stored
   *  `.specs/shots/*.shot.json` references (Track C's C3 orphaned-shot
   *  warning). Sources that do not support it (FileSystem/Manual, or an older
   *  sidecar with no /shots endpoint) omit this; the connection treats a
   *  missing/failed loadShotScreenIds as "unknown" (never a hard block --
   *  the caller degrades to a generic caution). */
  loadShotScreenIds?(): Promise<string[]>;
  /** Optional live-change subscription; returns an unsubscribe function.
   *  `options.jitterMs` randomizes reconnect timing across concurrent watches. */
  watch?(onChange: () => void, options?: { jitterMs?: number }): () => void;
}
