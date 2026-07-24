/**
 * The editing surface: the source <img> plus the SVG/DOM marks overlay, with
 * zoom/pan and pointer editing driven by useEditorInteractions. Coordinates
 * stay in image space; only this viewport scales them for display.
 */
import type { ImageSource, MarkAction, MarkDoc } from "@specpin/specshot-core";
import { imageLenToScreen, imageToScreen } from "@specpin/specshot-core";
import type { Dispatch } from "react";
import { MarksLayer } from "./marks-layer.js";
import { type Tool, useEditorInteractions } from "./use-editor-interactions.js";

export interface EditorCanvasProps {
  source: ImageSource;
  doc: MarkDoc;
  dispatch: Dispatch<MarkAction>;
  selectedItemNo: string | null;
  onSelect: (itemNo: string | null) => void;
  tool: Tool;
}

export function EditorCanvas({
  source,
  doc,
  dispatch,
  selectedItemNo,
  onSelect,
  tool,
}: EditorCanvasProps) {
  const {
    containerRef,
    viewport,
    draft,
    fit,
    zoomButton,
    onWheel,
    onCanvasPointerDown,
    onMarkPointerDown,
    onHandlePointerDown,
  } = useEditorInteractions({
    doc,
    dispatch,
    imageWidth: source.width,
    imageHeight: source.height,
    tool,
    onSelect,
  });

  const imgTL = imageToScreen(viewport, { x: 0, y: 0 });

  return (
    <div className="canvas-wrap">
      <div className="zoom-controls">
        <button type="button" onClick={() => zoomButton(1.25)} title="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomButton(1 / 1.25)} title="Zoom out">
          −
        </button>
        <button type="button" onClick={fit} title="Fit to screen">
          Fit
        </button>
        <span className="zoom-pct">{Math.round(viewport.scale * 100)}%</span>
      </div>
      <div
        ref={containerRef}
        className={`canvas${tool === "add" ? " tool-add" : ""}`}
        onWheel={onWheel}
        onPointerDown={onCanvasPointerDown}
      >
        <img
          className="canvas-image"
          src={source.bitmapUrl}
          alt={source.name}
          draggable={false}
          style={{
            left: imgTL.x,
            top: imgTL.y,
            width: imageLenToScreen(viewport, source.width),
            height: imageLenToScreen(viewport, source.height),
          }}
        />
        <MarksLayer
          doc={doc}
          viewport={viewport}
          selectedItemNo={selectedItemNo}
          onMarkPointerDown={onMarkPointerDown}
          onHandlePointerDown={onHandlePointerDown}
        />
        {draft && (
          <div
            className="mark-box draft"
            style={{
              left: imageToScreen(viewport, { x: draft.startX, y: draft.startY }).x,
              top: imageToScreen(viewport, { x: draft.startX, y: draft.startY }).y,
              width: imageLenToScreen(viewport, draft.endX - draft.startX),
              height: imageLenToScreen(viewport, draft.endY - draft.startY),
            }}
          />
        )}
      </div>
    </div>
  );
}
