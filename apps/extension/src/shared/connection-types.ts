import type { SpecWithFile } from "@specpin/api-client";
import type { GuideDef } from "@specpin/spec-schema";

/** The legacy bare id for the page-owned Manual source. Local batches are now
 *  tagged per-batch as `manual:<batchId>` (see `shared/local-id.ts`); this bare
 *  value remains only as the pre-batch tag that the background migrates to a
 *  prefixed id on load. */
export const MANUAL_CONNECTION_ID = "manual";

// Pure, browser-free types shared by the storage layer (config.ts), the message
// contracts (messaging.ts), and the background registry. Kept here (no `#imports`)
// so the registry and its tests never pull the extension runtime.

/** One sidecar project the extension connects to. The extension holds a list of
 *  these (the native storage format) so it can serve several projects at once,
 *  routed to each page by the project's manifest `domains`. */
export interface Connection {
  /** Stable opaque id (assigned on add); used to tag specs and target messages. */
  id: string;
  baseUrl: string;
  token: string;
  label?: string;
  /** RT-SA1: a project whose manifest pins no `domains` matches a page ONLY when
   *  the user explicitly opts in here. Without it such a project matches nothing. */
  applyToAllSites?: boolean;
  /** Per-project on/off. Distinct from the global SET_ENABLED master switch: a
   *  disabled connection serves no page, stops its SSE watch, and drops out of the
   *  status, but stays listed in Options to be re-enabled. Undefined = enabled
   *  (backward compatible with connections stored before this field existed). */
  enabled?: boolean;
}

/** A spec tagged with the connection (project) it came from. Extends
 *  SpecWithFile so existing single-project consumers keep working; the project
 *  label lets multi-project pages disambiguate colliding spec ids. `writable` is
 *  true when this origin can edit the spec back to its source (a sidecar that
 *  serves the page, or a local batch that serves it under the applyToAllSites
 *  gate) - drives the Edit affordance so it never offers a save that would fail. */
export type TaggedSpec = SpecWithFile & {
  connectionId: string;
  project: string;
  writable?: boolean;
};

/** A guide tagged with where it came from, for the merged GET_GUIDES_FOR_ORIGIN
 *  list. `scope` is "team" for a guide served by a project (sidecar OR local
 *  committed batch) and "personal" for one kept privately in storage.sync.
 *  Team guides carry the owning `connectionId` (a sidecar uuid or the
 *  `manual:<batchId>` local form) + the project label for disambiguation; cross-
 *  project id collisions are keyed by `connectionId + id` at the UI. Personal
 *  guides carry the canonical `origin` they are pinned to instead. */
export type TaggedGuide = GuideDef & {
  scope: "team" | "personal";
  /** Project display label (team scope). */
  project?: string;
  /** Owning connection id for a team guide (sidecar uuid or `manual:<batchId>`). */
  connectionId?: string;
  /** Canonical origin a personal guide is pinned to (personal scope). */
  origin?: string;
};

/** One Manual-import batch as shown in the Options list. Carries NO `specs`
 *  payload (only counts + metadata), so it is safe to send over GET_STATUS to any
 *  extension surface. Lives here (not messaging.ts) so the registry can build it
 *  without importing the message layer; messaging.ts re-exports it. */
export interface ManualBatchSummary {
  id: string;
  label: string;
  source: "paste" | "files" | "manual";
  fileNames?: string[];
  project: string;
  domains: string[];
  specCount: number;
  importedAt: number;
  /** Per-batch on/off (parallel to ConnectionStatus.enabled). False means the
   *  user disabled this batch: it serves no page but stays listed in Options to
   *  be re-enabled. */
  enabled: boolean;
}

/** Per-connection state for the management UI. NEVER carries the bearer token
 *  (RT-SA6): an unprivileged GET_STATUS must not be able to read secrets. */
export interface ConnectionStatus {
  id: string;
  label?: string;
  baseUrl: string;
  project: string | null;
  connected: boolean;
  /** Machine error code from the last failed reload (e.g. "load_failed"). */
  error?: string;
  /** Human-readable detail behind `error`, passed through from the sidecar's
   *  `details` (e.g. the missing-file path). Absent when there is no extra detail. */
  errorDetail?: string;
  specCount: number;
  domains: string[];
  /** True when this project pins no domains and is opted in to all sites. */
  matchesAllSites: boolean;
  /** Per-project on/off state. False means the user disabled this connection: it
   *  serves no page and is excluded from the surface "serving" set, but is still
   *  listed in Options so it can be re-enabled. */
  enabled: boolean;
}
