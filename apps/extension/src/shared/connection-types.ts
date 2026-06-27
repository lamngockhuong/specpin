import type { SpecWithFile } from "@specpin/api-client";

/** Connection id used to tag specs from the page-owned Manual import source. It
 *  is not a real sidecar connection: capture cannot write to it. */
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
 *  label lets multi-project pages disambiguate colliding spec ids. */
export type TaggedSpec = SpecWithFile & { connectionId: string; project: string };

/** One Manual-import batch as shown in the Options list. Carries NO `specs`
 *  payload (only counts + metadata), so it is safe to send over GET_STATUS to any
 *  extension surface. Lives here (not messaging.ts) so the registry can build it
 *  without importing the message layer; messaging.ts re-exports it. */
export interface ManualBatchSummary {
  id: string;
  label: string;
  source: "paste" | "files";
  fileNames?: string[];
  project: string;
  domains: string[];
  specCount: number;
  importedAt: number;
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
