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
  /** Multiply the current zoom by `factor`, centered on the canvas middle.
   *  Backs the graph toolbar's zoom-in / zoom-out buttons (the wheel zooms
   *  toward the cursor instead). */
  zoomBy(factor: number): void;
  /** Reset pan/zoom to the identity transform -- at scale 1 the SVG viewBox
   *  already frames the whole graph, so this is the toolbar's "fit" action. */
  reset(): void;
  /** Remove the pointer/wheel listeners this attached. */
  destroy(): void;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 3;
const ZOOM_STEP = 0.0015;
// Pointer travel (px) that turns a press into a pan. Under this it stays a
// click, so node/edge click handlers still fire (see onPointerDown).
const DRAG_THRESHOLD = 3;

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
  let activePointerId: number | null = null;
  let panning = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;

  // The transform origin never changes; set it once so per-frame apply() writes
  // only the (translate + scale) transform on the pan/zoom hot path.
  target.style.transformOrigin = "0 0";

  function apply(): void {
    target.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
  }

  // Map a client (viewport) point to the graph's user-space coordinates -- the
  // space state.x/state.y/scale live in. The <svg> renders with a viewBox and
  // width/height=100%, so screen pixels are NOT user units: the viewBox scale
  // plus the default preserveAspectRatio ("xMidYMid meet") letterbox offset
  // differ per axis. Anchoring the wheel zoom on `clientX - rect.left` ignored
  // both, which drifted the zoom along a diagonal. getScreenCTM captures the
  // full user->screen mapping; invert it to go screen->user. Falls back to a
  // rect-relative mapping where no CTM is available (e.g. jsdom in tests).
  function clientToUser(clientX: number, clientY: number): { x: number; y: number } {
    const ctm = typeof surface.getScreenCTM === "function" ? surface.getScreenCTM() : null;
    // Feature-check the full SVG geometry API (real browsers have it; test DOMs
    // stub getScreenCTM but not createSVGPoint().matrixTransform) before using it.
    if (ctm && typeof ctm.inverse === "function" && typeof surface.createSVGPoint === "function") {
      const pt = surface.createSVGPoint();
      if (typeof pt.matrixTransform === "function") {
        pt.x = clientX;
        pt.y = clientY;
        const u = pt.matrixTransform(ctm.inverse());
        return { x: u.x, y: u.y };
      }
    }
    const rect = surface.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function onPointerDown(e: PointerEvent): void {
    // Only the primary button/touch arms a pan. Crucially, DON'T capture the
    // pointer here: capturing on press makes the browser retarget the ensuing
    // `click` to this <svg> surface, so node/edge <g> click handlers never fire
    // (only onBackgroundClick would) -- which silently breaks selection in the
    // graph. Instead just record the press; panning + capture begin in
    // onPointerMove once travel passes DRAG_THRESHOLD. Under that it stays a
    // click and reaches the node/edge handlers underneath.
    if (e.button !== 0) return;
    activePointerId = e.pointerId;
    panning = false;
    startX = e.clientX;
    startY = e.clientY;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onPointerMove(e: PointerEvent): void {
    if (activePointerId === null) return;
    if (!panning) {
      // Below the threshold this is still a potential click -- don't pan or
      // capture yet, so the click can reach the node/edge underneath.
      if (
        Math.abs(e.clientX - startX) < DRAG_THRESHOLD &&
        Math.abs(e.clientY - startY) < DRAG_THRESHOLD
      ) {
        return;
      }
      // Real drag: now capture so moves keep flowing even off the surface.
      panning = true;
      surface.setPointerCapture(activePointerId);
    } else {
      // Pan in user space too, so a drag tracks the cursor 1:1 on screen
      // regardless of the viewBox scale (converting each endpoint, not the raw
      // screen delta).
      const prev = clientToUser(lastX, lastY);
      const curr = clientToUser(e.clientX, e.clientY);
      state = { ...state, x: state.x + (curr.x - prev.x), y: state.y + (curr.y - prev.y) };
      apply();
    }
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onPointerUp(): void {
    // A pointercancel (e.g. browser gesture interruption) can already release
    // capture before this handler runs; guard so a second release never throws.
    if (activePointerId !== null && surface.hasPointerCapture(activePointerId)) {
      surface.releasePointerCapture(activePointerId);
    }
    activePointerId = null;
    panning = false;
  }

  // Rescale to `nextScale` while keeping the graph point currently under
  // (px, py) fixed -- solve for the new translate given the new scale. Shared by
  // the wheel (anchors on the cursor) and the toolbar zoom buttons (anchor on
  // the canvas centre).
  function zoomToward(px: number, py: number, nextScale: number): void {
    const gx = (px - state.x) / state.scale;
    const gy = (py - state.y) / state.scale;
    state = { x: px - gx * nextScale, y: py - gy * nextScale, scale: nextScale };
    apply();
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const { x, y } = clientToUser(e.clientX, e.clientY);
    zoomToward(x, y, clampScale(state.scale * (1 - e.deltaY * ZOOM_STEP)));
  }

  // Button zoom: same anchored rescale as the wheel, anchored on the canvas
  // centre (mapped through clientToUser so it lands on the true visual middle).
  function zoomBy(factor: number): void {
    const rect = surface.getBoundingClientRect();
    const { x, y } = clientToUser(rect.left + rect.width / 2, rect.top + rect.height / 2);
    zoomToward(x, y, clampScale(state.scale * factor));
  }

  function reset(): void {
    state = { x: 0, y: 0, scale: 1 };
    apply();
  }

  surface.addEventListener("pointerdown", onPointerDown);
  surface.addEventListener("pointermove", onPointerMove);
  surface.addEventListener("pointerup", onPointerUp);
  surface.addEventListener("pointercancel", onPointerUp);
  surface.addEventListener("wheel", onWheel, { passive: false });
  apply();

  return {
    zoomBy,
    reset,
    destroy: () => {
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", onPointerUp);
      surface.removeEventListener("pointercancel", onPointerUp);
      surface.removeEventListener("wheel", onWheel);
    },
  };
}
