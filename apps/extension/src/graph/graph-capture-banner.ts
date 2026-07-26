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
  | { kind: "off" }
  | { kind: "empty" }
  | { kind: "active"; count: number }
  | { kind: "full"; cap: number };

/** Per-project record opt-in replaces the old device-global switch, so the banner
 *  now always shows for a SELECTED project: `off` offers a Turn-on (opt-in is the
 *  new default, so OFF must be actionable here, not just hidden), while `empty` /
 *  `active` / `full` (the bounded per-project ring-buffer cap, B2) show the live
 *  recording state. No project selected -> `hidden` (nothing to scope to). */
export function captureBannerState(
  recording: boolean,
  count: number,
  hasProject: boolean,
  cap: number = MAX_CAPTURE_ENTRIES_PER_PROJECT,
): CaptureBannerState {
  if (!hasProject) return { kind: "hidden" };
  if (!recording) return { kind: "off" };
  if (count >= cap) return { kind: "full", cap };
  if (count === 0) return { kind: "empty" };
  return { kind: "active", count };
}

export interface CaptureBannerCallbacks {
  onTurnOn(): void | Promise<void>;
  onTurnOff(): void | Promise<void>;
  onClearAll(): void | Promise<void>;
}

export interface CaptureBannerHandle {
  /** Re-render for the current state. `count` is the currently-selected
   *  project's draft buffer size; `hasProject` is whether one is selected. */
  update(recording: boolean, count: number, hasProject: boolean): void;
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

  const turnOn = document.createElement("button");
  turnOn.type = "button";
  turnOn.className = "capture-banner-action";
  turnOn.textContent = t("graph.capture.turnOn");
  turnOn.addEventListener("click", () => void callbacks.onTurnOn());

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

  container.append(dot, message, turnOn, turnOff, clearAll);
  container.hidden = true;

  return {
    update(recording, count, hasProject) {
      const state = captureBannerState(recording, count, hasProject);
      if (state.kind === "hidden") {
        container.hidden = true;
        return;
      }
      container.hidden = false;
      const off = state.kind === "off";
      // `off` state: only the Turn-on affordance; the pulsing dot + Turn-off +
      // Clear-all belong to the live-recording states. Otherwise: Turn-off always,
      // Clear-all except when there is nothing captured yet (empty).
      container.classList.toggle("off", off);
      container.classList.toggle("full", state.kind === "full");
      turnOn.hidden = !off;
      turnOff.hidden = off;
      clearAll.hidden = off || state.kind === "empty";
      message.textContent = off
        ? t("graph.capture.off")
        : state.kind === "empty"
          ? t("graph.capture.recordingEmpty")
          : state.kind === "full"
            ? t("graph.capture.recordingFull", { cap: state.cap })
            : t("graph.capture.recording", { count: state.count });
    },
  };
}
