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
}

/** A spec tagged with the connection (project) it came from. Extends
 *  SpecWithFile so existing single-project consumers keep working; the project
 *  label lets multi-project pages disambiguate colliding spec ids. */
export type TaggedSpec = SpecWithFile & { connectionId: string; project: string };

/** Per-connection state for the management UI. NEVER carries the bearer token
 *  (RT-SA6): an unprivileged GET_STATUS must not be able to read secrets. */
export interface ConnectionStatus {
  id: string;
  label?: string;
  baseUrl: string;
  project: string | null;
  connected: boolean;
  error?: string;
  specCount: number;
  domains: string[];
  /** True when this project pins no domains and is opted in to all sites. */
  matchesAllSites: boolean;
}
