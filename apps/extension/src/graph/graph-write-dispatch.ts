import type { FlowsConfig, ScreensConfig } from "@specpin/spec-schema";
import { isLocalConnectionId, localBatchId } from "../shared/local-id.js";
import type { GraphWriteResult } from "../shared/messaging.js";
import { sendToBackground } from "../shared/messaging.js";

// The one messaging-touching piece of the write-back layer (graph-write-back.ts
// and graph-write-back-flows.ts stay pure/testable without a browser): routes
// an already-merged, already-validated FlowsConfig/ScreensConfig to whichever
// path the project actually writes through -- a sidecar (PUT via the
// background) or a local Manual batch (storage.local via the background) --
// selected the same way every other write in this codebase picks it: by the
// `manual:<id>` prefix on the connection id (shared/local-id.ts).

/** Persist a merged flows config for `connectionId`'s owning project. */
export function dispatchWriteFlows(
  connectionId: string,
  config: FlowsConfig,
): Promise<GraphWriteResult> {
  if (isLocalConnectionId(connectionId)) {
    const id = localBatchId(connectionId);
    if (!id) return Promise.resolve({ ok: false, errors: ["invalid local project"] });
    return sendToBackground<GraphWriteResult>({ type: "SET_LOCAL_BATCH_FLOWS", id, config });
  }
  return sendToBackground<GraphWriteResult>({ type: "SAVE_GRAPH_FLOWS", connectionId, config });
}

/** Persist a merged screens config for `connectionId`'s owning project. */
export function dispatchWriteScreens(
  connectionId: string,
  config: ScreensConfig,
): Promise<GraphWriteResult> {
  if (isLocalConnectionId(connectionId)) {
    const id = localBatchId(connectionId);
    if (!id) return Promise.resolve({ ok: false, errors: ["invalid local project"] });
    return sendToBackground<GraphWriteResult>({ type: "SET_LOCAL_BATCH_SCREENS", id, config });
  }
  return sendToBackground<GraphWriteResult>({ type: "SAVE_GRAPH_SCREENS", connectionId, config });
}
