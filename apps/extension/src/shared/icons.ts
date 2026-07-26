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
const STROKE_WIDTH = "1.4";

/** Stroke paths on a 12x12 viewBox, each geometrically centered on (6,6). */
const ICON_PATHS = {
  close: "M3.5 3.5 8.5 8.5M8.5 3.5 3.5 8.5",
  plus: "M6 2.5V9.5M2.5 6H9.5",
  minus: "M2.5 6H9.5",
  // Four corner brackets = "fit to view" (zoom-to-frame the whole graph).
  fit: "M4.5 2.5H2.5V4.5M7.5 2.5H9.5V4.5M9.5 7.5V9.5H7.5M2.5 7.5V9.5H4.5",
  // Layout-direction arrows: right = left-to-right (LR), down = top-to-bottom (TB).
  arrowRight: "M2.5 6H9.5M6.8 3.3 9.5 6 6.8 8.7",
  arrowDown: "M6 2.5V9.5M3.3 6.8 6 9.5 8.7 6.8",
  // Diagonal up-right connector = "add edge" (connect two nodes). Deliberately
  // NOT a plus, so it never reads as "add node".
  edge: "M3 9 9 3M9 3H6.4M9 3V5.6",
  // Return arrow (↩) = "undo": a left-pointing head, then a top segment that
  // hooks down in a clean semicircle on the right.
  undo: "M3 5.3H7a2.2 2.2 0 0 1 0 4.4M3 5.3 4.8 3.5M3 5.3 4.8 7.1",
  // Floppy disk = "save": body with a clipped top-right corner, header slot, and
  // a label panel at the bottom.
  save: "M2.7 2.5H8L9.5 4V9.3A.2.2 0 0 1 9.3 9.5H2.7A.2.2 0 0 1 2.5 9.3V2.7A.2.2 0 0 1 2.7 2.5ZM4.3 2.5V4.6H7.4V2.5M4 9.5V6.8H8V9.5",
  check: "M2.5 6.3 5 8.8 9.5 3.5",
  play: "M4.5 3.2V8.8L9 6Z",
  pencil: "M8.1 2.7 9.3 3.9 4.5 8.7 3 9 3.3 7.5Z",
  // Trash can (Feather "trash-2" scaled to the 12 grid): wide lid, rounded handle
  // tab, body with rounded bottom corners, and two ribs. Reads clearly small.
  trash:
    "M1.5 3H10.5M9.5 3V10a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V3M4.5 3V2a1 1 0 0 1 1-1H6.5a1 1 0 0 1 1 1V3M5 5.5V8.5M7 5.5V8.5",
  // Duplicate = two overlapping rounded squares (front + back-corner hint). Shape
  // deliberately differs from `link` so "duplicate to element" never reads as
  // "copy link".
  copy: "M2.5 5.5a1 1 0 0 1 1-1H7a1 1 0 0 1 1 1V9a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1ZM5 4.5V3.5a1 1 0 0 1 1-1H9a1 1 0 0 1 1 1V7a1 1 0 0 1-1 1H8",
  // Chain link = two linked rounded strokes (copy-a-link). Distinct from `copy`.
  link: "M5 7 7 5M4.6 6.2 3.4 7.4a1.6 1.6 0 0 0 2.2 2.2L6.8 8.4M7.4 5.8 8.6 4.6a1.6 1.6 0 0 0-2.2-2.2L5.2 3.6",
  // Side panel = rounded rect with a divided right column (open-in-side-panel).
  panel: "M2 3.5a1 1 0 0 1 1-1H9a1 1 0 0 1 1 1V8.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1ZM7.5 2.5V9.5",
  // Flow-chart = one node branching down to two (the graph view). Boxes are
  // stroked rects; the connector drops from the top box, forks, and meets each
  // child box.
  graph:
    "M4.5 1.5H7.5V3.5H4.5ZM1.5 8.5H4.5V10.5H1.5ZM7.5 8.5H10.5V10.5H7.5ZM6 3.5V6M3 6H9M3 6V8.5M9 6V8.5",
  // Grid = the table view: an outer frame with two row rules and one column rule.
  table: "M2 2.5H10V9.5H2ZM2 5.2H10M2 7.4H10M5.3 2.5V9.5",
  // Caret up = collapse a row; rotate 180deg (CSS) for the expand/down state.
  chevronUp: "M3 7.5 6 4.5 9 7.5",
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

/** Build an icon-only `<button>`: the label becomes both the accessible name
 *  (`aria-label`) and the hover tooltip (`title`), and the icon strokes
 *  `currentColor` so a variant class (e.g. `.danger`) still tints it. Shared by
 *  the guide-row actions and the Options corpus-entry delete. */
export function createIconButton(
  doc: Document,
  className: string,
  name: IconName,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = doc.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.appendChild(createIcon(doc, name, 16));
  btn.addEventListener("click", onClick);
  return btn;
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
