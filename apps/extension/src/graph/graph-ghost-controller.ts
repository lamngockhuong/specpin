import type {
  ApproveCapturedResult,
  CaptureBufferEntry,
  CaptureBufferResult,
} from "../shared/messaging.js";
import { sendToBackground } from "../shared/messaging.js";

// The graph panel's Track B draft-buffer client (Phase B3): fetches every
// project's capture buffer (like GET_FLOWS_SCREENS aggregates every project's
// flows/screens) and relays the per-entry approve/discard round-trip. Split
// out of main.ts to keep the entrypoint within the plan's 200-line-per-file
// budget (mirrors graph-project-picker.ts's split for the same reason).
// Message-sending glue only -- no DOM, no graph math (that's graph-ghost.ts).

export interface GhostController {
  /** This project's current buffer entries (call `refresh` first to update). */
  forProject(connectionId: string): CaptureBufferEntry[];
  /** Re-fetch every project's buffer from the background. */
  refresh(): Promise<void>;
  /** Approve one buffered transition; the caller re-fetches flows/screens +
   *  the buffer on success (the committed graph and the buffer both changed). */
  approve(connectionId: string, transitionId: string): Promise<ApproveCapturedResult>;
  /** Discard one buffered transition; no `.specs/` write. */
  discard(connectionId: string, transitionId: string): Promise<void>;
  /** Discard EVERY buffered transition for one project (B4's "Clear all
   *  captured" action). No `.specs/` write -- these are drafts only. */
  clearAll(connectionId: string): Promise<void>;
}

export function createGhostController(): GhostController {
  let buffer: CaptureBufferEntry[] = [];

  return {
    forProject: (connectionId) => buffer.filter((e) => e.project === connectionId),
    refresh: async () => {
      const result = await sendToBackground<CaptureBufferResult>({ type: "GET_CAPTURE_BUFFER" });
      buffer = result.entries;
    },
    approve: (connectionId, transitionId) =>
      sendToBackground<ApproveCapturedResult>({
        type: "APPROVE_CAPTURED_TRANSITION",
        project: connectionId,
        transitionId,
      }),
    discard: async (connectionId, transitionId) => {
      await sendToBackground({
        type: "DISCARD_CAPTURED_TRANSITION",
        project: connectionId,
        transitionId,
      });
    },
    clearAll: async (connectionId) => {
      await sendToBackground({ type: "CLEAR_CAPTURE_BUFFER", project: connectionId });
    },
  };
}
