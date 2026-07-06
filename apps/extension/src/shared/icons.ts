// Inline-SVG icons shared across the extension UI. Text glyphs such as "×" and
// "+" carry asymmetric side/vertical bearing, so they read off-center inside a
// round or square button even when the box itself is perfectly centered. Drawing
// the strokes on a fixed square viewBox centers them exactly. Icons stroke with
// `currentColor`, so they inherit the button's text and :hover colors with no
// extra wiring. Two builders share one set of path data (and one set of stroke
// attributes): `iconSvg` returns a markup string for the trusted-HTML template
// sites (setTrustedHtml), and `createIcon` returns a detached node for the
// createElement sites.

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW_BOX = "0 0 12 12";
// Fixed screen-px stroke weight. `vector-effect: non-scaling-stroke` keeps it
// constant regardless of the rendered `size`, so a 9px icon and a 13px icon share
// the same line weight (without it, the stroke would scale with the box).
const STROKE_WIDTH = "1.6";

/** Stroke paths on a 12x12 viewBox, each geometrically centered on (6,6). */
const ICON_PATHS = {
  close: "M3.5 3.5 8.5 8.5M8.5 3.5 3.5 8.5",
  plus: "M6 2.5V9.5M2.5 6H9.5",
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** Trusted-HTML markup for an icon, for template-string call sites that insert
 *  via setTrustedHtml/appendTrustedHtml. `size` is the rendered px square. */
export function iconSvg(name: IconName, size = 12): string {
  return (
    `<svg viewBox="${VIEW_BOX}" width="${size}" height="${size}" fill="none" aria-hidden="true">` +
    `<path d="${ICON_PATHS[name]}" stroke="currentColor" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`
  );
}

/** The same icon as a detached SVG node, for createElement call sites. */
export function createIcon(doc: Document, name: IconName, size = 12): SVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", VIEW_BOX);
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICON_PATHS[name]);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", STROKE_WIDTH);
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("vector-effect", "non-scaling-stroke");
  svg.appendChild(path);
  return svg;
}
