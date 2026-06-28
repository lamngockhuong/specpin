// Per-batch identity for the page-owned local (Manual) source. Each local batch
// is addressable for write-routing and target-picking via a `manual:<batchId>`
// connection id, replacing the single bare `MANUAL_CONNECTION_ID` ("manual") tag.
// Kept dependency-light (only the reserved-id constant) so the content script,
// orchestrator, registry, and surface renderers can all share one predicate.

/** Prefix that marks a connection id as a local (Manual) batch. The suffix is
 *  the batch's stable uuid. A real sidecar connection id is a bare uuid and never
 *  starts with this. */
export const LOCAL_CONN_PREFIX = "manual:";

/** Is this connection id a local (Manual) batch?
 *
 *  Prefix-only by design (RT): the bare legacy `"manual"` is NOT local. It is a
 *  valid arbitrary sidecar id, so treating it as local would misroute writes; and
 *  `localBatchId("manual")` returning null would crash a handler that assumed a
 *  suffix. Legacy bare-`"manual"` batches are migrated to `manual:<id>` on first
 *  load (see config/normalize + background reconcile). */
export function isLocalConnectionId(id: string): boolean {
  return id.startsWith(LOCAL_CONN_PREFIX);
}

/** The batch uuid behind a local connection id, or null when `connId` is not a
 *  local id. Callers MUST null-check before looking the batch up. */
export function localBatchId(connId: string): string | null {
  return connId.startsWith(LOCAL_CONN_PREFIX) ? connId.slice(LOCAL_CONN_PREFIX.length) : null;
}

/** The local connection id for a batch uuid (the inverse of `localBatchId`). */
export function localConnId(batchId: string): string {
  return LOCAL_CONN_PREFIX + batchId;
}

// The bare `"manual"` (legacy `MANUAL_CONNECTION_ID`) needs no runtime reservation
// check: connection ids are server-minted uuids (or the fixed `"default"`) and
// local ids always carry the `manual:` prefix, so neither path can ever produce
// the bare value. The prefix-only predicate above keeps the two id spaces
// partitioned by construction.
