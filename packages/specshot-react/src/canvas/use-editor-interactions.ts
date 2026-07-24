/**
 * Owns every pointer gesture on the canvas: pan, drag-a-mark, resize-a-mark,
 * and drag-to-create. Keeps editor-canvas.tsx thin. All mark math is
 * delegated to the pure helpers in @specpin/specshot-core; this hook only
 * tracks gesture state and dispatches doc actions. Viewport (zoom/pan) state
 * and the container ref live in use-viewport-controls.ts.
 */
import type { HandleId, MarkAction, MarkDoc, Position } from "@specpin/specshot-core";
import {
  applyDrag,
  applyResize,
  boxFromPoints,
  clampToImage,
  panBy,
  screenToImage,
} from "@specpin/specshot-core";
import type { Dispatch } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useViewportControls } from "./use-viewport-controls.js";

export type Tool = "select" | "add";

type Gesture =
  | { kind: "none" }
  | { kind: "pan"; lastX: number; lastY: number }
  | { kind: "drag"; itemNo: string; startImg: Position; originX: number; originY: number }
  | { kind: "resize"; itemNo: string; handle: HandleId }
  | { kind: "create"; startX: number; startY: number };

interface Args {
  doc: MarkDoc;
  dispatch: Dispatch<MarkAction>;
  imageWidth: number;
  imageHeight: number;
  tool: Tool;
  onSelect: (itemNo: string | null) => void;
}

export function useEditorInteractions({
  doc,
  dispatch,
  imageWidth,
  imageHeight,
  tool,
  onSelect,
}: Args) {
  const { containerRef, viewport, vpRef, setViewport, fit, zoomButton, onWheel, localPoint } =
    useViewportControls(imageWidth, imageHeight);
  const [draft, setDraft] = useState<Position | null>(null);
  const gesture = useRef<Gesture>({ kind: "none" });
  // onUp is bound to `window` once at gesture-start and never rebound on
  // subsequent renders, so it must read the LATEST draft via a ref — closing
  // over the `draft` state directly would always see the value from the
  // render that started the gesture (null), and drag-to-create would never
  // dispatch its `add` action.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const endGesture = useCallback(() => {
    gesture.current = { kind: "none" };
    setDraft(null);
  }, []);

  const onMove = useCallback(
    (e: PointerEvent) => {
      const g = gesture.current;
      if (g.kind === "none") return;
      const p = localPoint(e);
      const img = screenToImage(vpRef.current, p);
      if (g.kind === "pan") {
        setViewport((vp) => panBy(vp, p.x - g.lastX, p.y - g.lastY));
        gesture.current = { kind: "pan", lastX: p.x, lastY: p.y };
      } else if (g.kind === "drag") {
        const dx = img.x - g.originX;
        const dy = img.y - g.originY;
        const moved = clampToImage(applyDrag(g.startImg, dx, dy), imageWidth, imageHeight);
        dispatch({ type: "move", itemNo: g.itemNo, position: moved });
      } else if (g.kind === "resize") {
        const cur = doc.find((it) => it.itemNo === g.itemNo);
        if (cur) {
          dispatch({
            type: "resize",
            itemNo: g.itemNo,
            position: applyResize(cur.position, g.handle, img),
          });
        }
      } else if (g.kind === "create") {
        setDraft(boxFromPoints({ x: g.startX, y: g.startY }, img));
      }
    },
    [dispatch, doc, imageWidth, imageHeight, localPoint, setViewport, vpRef],
  );

  // The exact handler pair currently bound to window, so we can always detach
  // them — including from the unmount cleanup below if a gesture is in flight.
  const bound = useRef<{ move: (e: PointerEvent) => void; up: () => void } | null>(null);
  const detach = useCallback(() => {
    if (bound.current) {
      window.removeEventListener("pointermove", bound.current.move);
      window.removeEventListener("pointerup", bound.current.up);
      bound.current = null;
    }
  }, []);

  const onUp = useCallback(() => {
    const g = gesture.current;
    const d = draftRef.current;
    if (g.kind === "create" && d) {
      if (d.endX - d.startX > 3 && d.endY - d.startY > 3) {
        dispatch({ type: "add", position: clampToImage(d, imageWidth, imageHeight) });
      }
    }
    detach();
    endGesture();
  }, [dispatch, imageWidth, imageHeight, detach, endGesture]);

  const beginWindowGesture = useCallback(() => {
    detach(); // drop any stale pair before binding a fresh one
    bound.current = { move: onMove, up: onUp };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [onMove, onUp, detach]);

  // Detach on unmount so a component teardown mid-gesture can't strand listeners.
  useEffect(() => detach, [detach]);

  /** Pointer down on empty canvas: pan (select tool) or start a new box (add tool). */
  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const p = localPoint(e);
      if (tool === "add") {
        const img = screenToImage(vpRef.current, p);
        gesture.current = { kind: "create", startX: img.x, startY: img.y };
        setDraft({ startX: img.x, startY: img.y, endX: img.x, endY: img.y });
      } else {
        onSelect(null);
        gesture.current = { kind: "pan", lastX: p.x, lastY: p.y };
      }
      beginWindowGesture();
    },
    [tool, onSelect, beginWindowGesture, localPoint, vpRef],
  );

  /** Pointer down on a mark body: select + begin drag. */
  const onMarkPointerDown = useCallback(
    (itemNo: string, e: React.PointerEvent) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      onSelect(itemNo);
      const item = doc.find((it) => it.itemNo === itemNo);
      if (!item) return;
      const img = screenToImage(vpRef.current, localPoint(e));
      gesture.current = {
        kind: "drag",
        itemNo,
        startImg: item.position,
        originX: img.x,
        originY: img.y,
      };
      beginWindowGesture();
    },
    [doc, onSelect, beginWindowGesture, localPoint, vpRef],
  );

  /** Pointer down on a resize handle. */
  const onHandlePointerDown = useCallback(
    (itemNo: string, handle: HandleId, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      onSelect(itemNo);
      gesture.current = { kind: "resize", itemNo, handle };
      beginWindowGesture();
    },
    [onSelect, beginWindowGesture],
  );

  return {
    containerRef,
    viewport,
    draft,
    fit,
    zoomButton,
    onWheel,
    onCanvasPointerDown,
    onMarkPointerDown,
    onHandlePointerDown,
  };
}
