/**
 * Renders a MarkDoc as absolutely-positioned boxes + number labels over the
 * image, using the viewport transform. Presentational: it draws and forwards
 * pointer events; the geometry math lives in @specpin/specshot-core.
 *
 * The label placement mirrors the python annotator (above the box, flipped
 * below when it would clip at the top edge) so the on-screen overlay matches
 * the skill's annotated PNG.
 */
import type { HandleId, MarkDoc, MarkItem, Viewport } from "@specpin/specshot-core";
import { imageLenToScreen, imageToScreen } from "@specpin/specshot-core";
import { memo } from "react";

const HANDLES: HandleId[] = ["nw", "ne", "sw", "se", "n", "s", "e", "w"];

export interface MarksLayerProps {
  doc: MarkDoc;
  viewport: Viewport;
  selectedItemNo?: string | null;
  /** Pointer down on a mark body (select / start drag). */
  onMarkPointerDown?: (itemNo: string, e: React.PointerEvent) => void;
  /** Pointer down on a resize handle. */
  onHandlePointerDown?: (itemNo: string, handle: HandleId, e: React.PointerEvent) => void;
}

export function MarksLayer({
  doc,
  viewport,
  selectedItemNo,
  onMarkPointerDown,
  onHandlePointerDown,
}: MarksLayerProps) {
  return (
    <div className="marks-layer">
      {doc.map((item) => (
        <MarkBox
          key={item.itemNo}
          item={item}
          viewport={viewport}
          selected={item.itemNo === selectedItemNo}
          onMarkPointerDown={onMarkPointerDown}
          onHandlePointerDown={onHandlePointerDown}
        />
      ))}
    </div>
  );
}

// Memoized: during a single-mark drag, marksReducer preserves object identity
// for every non-dragged item and the viewport is unchanged, so memoizing keeps
// the re-render to just the dragged box (and any box whose `selected` flips).
const MarkBox = memo(function MarkBox({
  item,
  viewport,
  selected,
  onMarkPointerDown,
  onHandlePointerDown,
}: {
  item: MarkItem;
  viewport: Viewport;
  selected: boolean;
  onMarkPointerDown?: MarksLayerProps["onMarkPointerDown"];
  onHandlePointerDown?: MarksLayerProps["onHandlePointerDown"];
}) {
  const tl = imageToScreen(viewport, { x: item.position.startX, y: item.position.startY });
  const w = imageLenToScreen(viewport, item.position.endX - item.position.startX);
  const h = imageLenToScreen(viewport, item.position.endY - item.position.startY);

  // Label above the box; flip below if it would clip past the top.
  const labelAbove = tl.y - 22 >= 0;
  const labelStyle: React.CSSProperties = {
    top: labelAbove ? -22 : 2,
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a pointer-drag/resize box, not a real button
    // biome-ignore lint/a11y/useFocusableInteractive: role is presentational (accessible name only); dragging is a pointer-only affordance
    <div
      className={`mark-box${selected ? " selected" : ""}`}
      style={{ left: tl.x, top: tl.y, width: w, height: h }}
      onPointerDown={(e) => onMarkPointerDown?.(item.itemNo, e)}
      role="button"
      aria-label={`Mark ${item.itemNo}${item.label ? `: ${item.label}` : ""}`}
    >
      <span className="mark-label" style={labelStyle}>
        {item.itemNo}
      </span>
      {selected &&
        onHandlePointerDown &&
        HANDLES.map((handle) => (
          <span
            key={handle}
            className={`handle handle-${handle}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              onHandlePointerDown(item.itemNo, handle, e);
            }}
          />
        ))}
    </div>
  );
});
