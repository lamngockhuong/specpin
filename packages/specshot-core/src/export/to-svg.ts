/**
 * Export a standalone SVG: an embedded <image> of the source plus <rect>/<text>
 * marks in image coordinates. Opens correctly on its own in any browser.
 * The string builder (markDocToSvg) is pure (unit-tested); the async wrapper
 * (exportSvg) produces the embedded raster data URL and triggers the download
 * — not exercised under happy-dom (no real canvas 2D context), same as the
 * original project which never unit-tested it either.
 *
 * `to-png.ts` (canvas-PNG export) is deferred out of this port, so the image
 * loader it would have shared is kept private here instead.
 */
import type { ImageSource } from "../detect/image-source.js";
import type { MarkDoc } from "../model/mark-doc.js";
import { downloadText, withExtension } from "./download.js";
import { DRAW_STYLE, labelSize } from "./draw-style.js";
import { escapeMarkup as escapeXml } from "./escape.js";

/** Build the standalone SVG markup. `imageHref` is a data/URL for the raster. */
export function markDocToSvg(
  doc: MarkDoc,
  imageHref: string,
  width: number,
  height: number,
): string {
  const s = DRAW_STYLE;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  parts.push(`<image href="${imageHref}" x="0" y="0" width="${width}" height="${height}"/>`);

  for (const item of doc) {
    const { startX, startY, endX, endY } = item.position;
    const w = endX - startX;
    const h = endY - startY;
    parts.push(
      `<rect x="${startX}" y="${startY}" width="${w}" height="${h}" fill="none" ` +
        `stroke="${s.boxColor}" stroke-width="${s.lineWidth}"/>`,
    );
    const { width: labelW, height: labelH } = labelSize(item.itemNo);
    const labelLeft = Math.min(startX, Math.max(width - labelW, 0));
    let labelTop = startY - labelH - s.labelGap;
    if (labelTop < 0) labelTop = Math.min(startY + s.labelGap, Math.max(height - labelH, 0));
    parts.push(
      `<rect x="${labelLeft}" y="${labelTop}" width="${labelW}" height="${labelH}" fill="${s.labelBg}"/>`,
    );
    parts.push(
      `<text x="${labelLeft + s.paddingX}" y="${labelTop + labelH - s.paddingY}" ` +
        `font-family="${s.fontFamily}" font-size="${s.fontSize}" font-weight="bold" ` +
        `fill="${s.labelColor}">${escapeXml(item.itemNo)}</text>`,
    );
  }
  parts.push("</svg>");
  return parts.join("\n");
}

/** Load an <img> element from a URL and resolve once decoded. */
function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for export"));
    img.src = url;
  });
}

/** Convert the source image to a PNG data URL for self-contained embedding. */
async function imageToDataUrl(source: ImageSource): Promise<string> {
  const img = await loadImageElement(source.bitmapUrl);
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, source.width, source.height);
  return canvas.toDataURL("image/png");
}

export async function exportSvg(source: ImageSource, doc: MarkDoc): Promise<void> {
  const href = await imageToDataUrl(source);
  const svg = markDocToSvg(doc, href, source.width, source.height);
  downloadText(svg, withExtension(source.name, "annotated.svg"), "image/svg+xml");
}
