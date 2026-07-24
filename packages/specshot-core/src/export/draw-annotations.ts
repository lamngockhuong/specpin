/**
 * Draw boxes + number labels onto a 2D canvas context in IMAGE pixel space,
 * using the shared DRAW_STYLE. Mirrors the python annotator's label placement
 * (above the box, flipped below when it would clip past the top edge) so the
 * exported PNG matches the skill's annotated image.
 *
 * NOTE: not exercised under happy-dom (no real canvas 2D rendering context) —
 * consistent with the original project, which never unit-tested this module
 * either. Faithfully ported; exercised in a real browser at runtime.
 */
import type { MarkDoc } from "../model/mark-doc.js";
import { DRAW_STYLE } from "./draw-style.js";

export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  doc: MarkDoc,
  imageWidth: number,
  imageHeight: number,
): void {
  const s = DRAW_STYLE;
  ctx.lineWidth = s.lineWidth;
  ctx.strokeStyle = s.boxColor;
  ctx.font = `bold ${s.fontSize}px ${s.fontFamily}`;
  ctx.textBaseline = "top";

  for (const item of doc) {
    const { startX, startY, endX, endY } = item.position;
    ctx.strokeStyle = s.boxColor;
    ctx.strokeRect(startX, startY, endX - startX, endY - startY);

    const text = item.itemNo;
    const textW = Math.ceil(ctx.measureText(text).width);
    const labelW = textW + s.paddingX * 2;
    const labelH = s.fontSize + s.paddingY * 2;
    const labelLeft = Math.min(startX, Math.max(imageWidth - labelW, 0));
    let labelTop = startY - labelH - s.labelGap;
    if (labelTop < 0) labelTop = Math.min(startY + s.labelGap, Math.max(imageHeight - labelH, 0));

    ctx.fillStyle = s.labelBg;
    ctx.fillRect(labelLeft, labelTop, labelW, labelH);
    ctx.fillStyle = s.labelColor;
    ctx.fillText(text, labelLeft + s.paddingX, labelTop + s.paddingY);
  }
}
