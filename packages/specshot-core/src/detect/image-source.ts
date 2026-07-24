/**
 * Unified image loader: a File → a displayable URL + the intrinsic pixel size
 * that defines the coordinate space marks live in.
 *
 * Raster (PNG/JPG/WEBP): object URL + naturalWidth/Height from an <img>.
 * SVG: kept as text so detect/svg-geometry can re-parse it; displayed via a
 * blob URL; intrinsic size read from width/height attrs, else the viewBox,
 * else measured by rendering to an offscreen image.
 */

export type ImageKind = "raster" | "svg";

export interface ImageSource {
  /** URL usable as an <img> src (object/blob URL — revoke when replaced). */
  bitmapUrl: string;
  /** Intrinsic width in image pixels — the coordinate space for marks. */
  width: number;
  /** Intrinsic height in image pixels. */
  height: number;
  kind: ImageKind;
  /** Original file name (for export defaults). */
  name: string;
  /** Raw SVG markup when kind === 'svg' (input to geometry detection). */
  svgText?: string;
}

const SVG_TYPES = ["image/svg+xml"];

function isSvg(file: File): boolean {
  return SVG_TYPES.includes(file.type) || /\.svg$/i.test(file.name);
}

export const SUPPORTED_EXT = [".png", ".jpg", ".jpeg", ".webp", ".svg"];

export function isSupported(file: File): boolean {
  return /\.(png|jpe?g|webp|svg)$/i.test(file.name) || file.type.startsWith("image/");
}

/** Load a raster image file into an ImageSource. */
async function loadRaster(file: File): Promise<ImageSource> {
  const url = URL.createObjectURL(file);
  const { width, height } = await measureImage(url);
  return { bitmapUrl: url, width, height, kind: "raster", name: file.name };
}

/** Read intrinsic size from a loaded <img>. */
function measureImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = url;
  });
}

/** Parse intrinsic size out of raw SVG markup (attrs → viewBox → fallback). */
export function svgIntrinsicSize(svgText: string): { width: number; height: number } | null {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return null;
  const w = Number.parseFloat(svg.getAttribute("width") ?? "");
  const h = Number.parseFloat(svg.getAttribute("height") ?? "");
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { width: w, height: h };
  }
  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    const pw = parts[2];
    const ph = parts[3];
    if (parts.length === 4 && pw !== undefined && ph !== undefined && pw > 0 && ph > 0) {
      return { width: pw, height: ph };
    }
  }
  return null;
}

/** Load an SVG file: keep text, make a blob URL, resolve intrinsic size. */
async function loadSvg(file: File): Promise<ImageSource> {
  const svgText = await file.text();
  const blob = new Blob([svgText], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  let size = svgIntrinsicSize(svgText);
  if (!size) {
    // Fallback: let the browser measure the rendered SVG.
    size = await measureImage(url);
  }
  return {
    bitmapUrl: url,
    width: size.width,
    height: size.height,
    kind: "svg",
    name: file.name,
    svgText,
  };
}

/** Load any supported image file into an ImageSource. */
export async function loadImageSource(file: File): Promise<ImageSource> {
  if (!isSupported(file)) {
    throw new Error(`Unsupported file type: ${file.name}. Use PNG, JPG, WEBP or SVG.`);
  }
  return isSvg(file) ? loadSvg(file) : loadRaster(file);
}
