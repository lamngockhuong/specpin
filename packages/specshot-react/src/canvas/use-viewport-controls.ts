/**
 * Owns the canvas container ref + viewport (zoom/pan) state and the pure
 * screen<->local-point conversion every pointer gesture needs. Split out of
 * use-editor-interactions.ts to keep that file under the 200-line budget —
 * the two together form one cohesive hook, this half just isolates the
 * "container + viewport" concern so it stays independently readable.
 */
import { fitToContainer, type Viewport, zoomAt } from "@specpin/specshot-core";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

export function useViewportControls(imageWidth: number, imageHeight: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ scale: 1, offsetX: 0, offsetY: 0 });
  const vpRef = useRef(viewport);
  vpRef.current = viewport;

  /** Fit the image whenever its size changes or the container first mounts. */
  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el || imageWidth <= 0) return;
    setViewport(fitToContainer(imageWidth, imageHeight, el.clientWidth, el.clientHeight));
  }, [imageWidth, imageHeight]);

  useLayoutEffect(fit, [fit]);

  const localPoint = useCallback((e: { clientX: number; clientY: number }) => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setViewport((vp) => zoomAt(vp, localPoint(e), factor));
    },
    [localPoint],
  );

  const zoomButton = useCallback((factor: number) => {
    const el = containerRef.current;
    const anchor = el ? { x: el.clientWidth / 2, y: el.clientHeight / 2 } : { x: 0, y: 0 };
    setViewport((vp) => zoomAt(vp, anchor, factor));
  }, []);

  return { containerRef, viewport, vpRef, setViewport, fit, zoomButton, onWheel, localPoint };
}
