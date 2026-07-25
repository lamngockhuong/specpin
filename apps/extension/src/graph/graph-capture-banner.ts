import { t } from "../i18n/index.js";
import { MAX_CAPTURE_ENTRIES_PER_PROJECT } from "../shared/messaging.js";

// Phase B4: a project-scoped banner in the graph panel surfacing the Track B
// auto-capture recording state. The Options page indicator (B2) lives on a
// different extension page the user may not have open while browsing the
// graph, so recording being ON must be unmissable here too, with a reachable
// "Turn off" switch alongside it (never just a checked checkbox easy to
// miss). `captureBannerState` is a pure function over (recording, count, cap)
// so its four variants are unit-testable without mounting any DOM -- mirrors
// graph-controls.ts's split between computeGraphVisibility (pure) and
// mountGraphControls (DOM). DOM building/wiring (confirmDialog, messaging,
// watchRecordMode) lives in graph-capture-recording.ts, not here.

export type CaptureBannerState =
  | { kind: "hidden" }
  | { kind: "empty" }
  | { kind: "active"; count: number }
  | { kind: "full"; cap: number };

/** Recording is the hard gate: OFF hides the banner entirely, regardless of
 *  buffer contents -- this banner is about the LIVE recording state, not
 *  whether stale ghost entries exist (those still render via the graph's
 *  ghost overlay/review panel independent of this banner). Empty vs active vs
 *  full (the bounded per-project ring-buffer cap, B2) each get distinct copy. */
export function captureBannerState(
  recording: boolean,
  count: number,
  cap: number = MAX_CAPTURE_ENTRIES_PER_PROJECT,
): CaptureBannerState {
  if (!recording) return { kind: "hidden" };
  if (count >= cap) return { kind: "full", cap };
  if (count === 0) return { kind: "empty" };
  return { kind: "active", count };
}

export interface CaptureBannerCallbacks {
  onTurnOff(): void | Promise<void>;
  onClearAll(): void | Promise<void>;
}

export interface CaptureBannerHandle {
  /** Re-render for the current state. `count` is the currently-selected
   *  project's draft buffer size; pass `0` when no project is selected. */
  update(recording: boolean, count: number): void;
}

/** Build the banner ONCE into `container` (a fixed row in the page, like the
 *  existing #hint/#ghost-panel); `update` just toggles visibility/text rather
 *  than rebuilding the DOM on every state change (mirrors mountGhostPanel). */
export function mountCaptureBanner(
  container: HTMLElement,
  callbacks: CaptureBannerCallbacks,
): CaptureBannerHandle {
  const dot = document.createElement("span");
  dot.className = "capture-banner-dot";
  dot.setAttribute("aria-hidden", "true");
  const message = document.createElement("span");
  message.className = "capture-banner-message";

  const turnOff = document.createElement("button");
  turnOff.type = "button";
  turnOff.className = "capture-banner-action";
  turnOff.textContent = t("graph.capture.turnOff");
  turnOff.addEventListener("click", () => void callbacks.onTurnOff());

  const clearAll = document.createElement("button");
  clearAll.type = "button";
  clearAll.className = "capture-banner-action";
  clearAll.textContent = t("graph.capture.clearAll");
  clearAll.addEventListener("click", () => void callbacks.onClearAll());

  container.append(dot, message, turnOff, clearAll);
  container.hidden = true;

  return {
    update(recording, count) {
      const state = captureBannerState(recording, count);
      if (state.kind === "hidden") {
        container.hidden = true;
        return;
      }
      container.hidden = false;
      container.classList.toggle("full", state.kind === "full");
      // Nothing to clear yet in the empty state.
      clearAll.hidden = state.kind === "empty";
      message.textContent =
        state.kind === "empty"
          ? t("graph.capture.recordingEmpty")
          : state.kind === "full"
            ? t("graph.capture.recordingFull", { cap: state.cap })
            : t("graph.capture.recording", { count: state.count });
    },
  };
}
