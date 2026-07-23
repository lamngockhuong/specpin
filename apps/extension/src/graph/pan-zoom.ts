// Pointer-drag pan + wheel zoom for the graph canvas. Applies a single CSS
// `transform` (translate + scale) to one wrapping `<g>`, so panning/zooming a
// ~200-node SVG stays GPU-composited (no per-frame relayout of the graph
// itself -- see the phase's perf risk note).

export interface PanZoomState {
  x: number;
  y: number;
  scale: number;
}

export interface PanZoomController {
  /** Remove the pointer/wheel listeners this attached. */
  destroy(): void;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 3;
const ZOOM_STEP = 0.0015;

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Wire pan (pointer drag) + zoom (wheel) on `surface` (the `<svg>` itself),
 *  transforming `target` (the single `<g>` that holds every node/edge). */
export function attachPanZoom(
  surface: SVGSVGElement,
  target: SVGGElement,
  initial: PanZoomState = { x: 0, y: 0, scale: 1 },
): PanZoomController {
  let state: PanZoomState = { ...initial };
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  // The transform origin never changes; set it once so per-frame apply() writes
  // only the (translate + scale) transform on the pan/zoom hot path.
  target.style.transformOrigin = "0 0";

  function apply(): void {
    target.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
  }

  function onPointerDown(e: PointerEvent): void {
    // Only the primary button/touch starts a pan; a click that neither moved
    // nor dragged still reaches the node/edge click handlers underneath.
    if (e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    surface.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!dragging) return;
    state = { ...state, x: state.x + (e.clientX - lastX), y: state.y + (e.clientY - lastY) };
    lastX = e.clientX;
    lastY = e.clientY;
    apply();
  }

  function onPointerUp(e: PointerEvent): void {
    dragging = false;
    // A pointercancel (e.g. browser gesture interruption) can already release
    // capture before this handler runs; guard so a second release never throws.
    if (surface.hasPointerCapture(e.pointerId)) surface.releasePointerCapture(e.pointerId);
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = surface.getBoundingClientRect();
    // Zoom toward the cursor: keep the graph point under the pointer fixed by
    // solving for the new translate given the new scale.
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const nextScale = clampScale(state.scale * (1 - e.deltaY * ZOOM_STEP));
    const gx = (px - state.x) / state.scale;
    const gy = (py - state.y) / state.scale;
    state = { x: px - gx * nextScale, y: py - gy * nextScale, scale: nextScale };
    apply();
  }

  surface.addEventListener("pointerdown", onPointerDown);
  surface.addEventListener("pointermove", onPointerMove);
  surface.addEventListener("pointerup", onPointerUp);
  surface.addEventListener("pointercancel", onPointerUp);
  surface.addEventListener("wheel", onWheel, { passive: false });
  apply();

  return {
    destroy: () => {
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", onPointerUp);
      surface.removeEventListener("pointercancel", onPointerUp);
      surface.removeEventListener("wheel", onWheel);
    },
  };
}
