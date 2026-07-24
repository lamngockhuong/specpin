/**
 * The one place the box/label look is defined, matching the python annotator's
 * defaults (annotate-image-bboxes.py) so a skill-annotated PNG and an app-
 * exported PNG look identical. Shared by the PNG and SVG exporters.
 */
export const DRAW_STYLE = {
  boxColor: "#E53935",
  labelColor: "#FFFFFF",
  labelBg: "#111111",
  lineWidth: 3,
  fontSize: 16,
  fontFamily: "DejaVu Sans, Arial, sans-serif",
  paddingX: 6,
  paddingY: 4,
  /** Gap between the box top and the label, matching the python `- 4`. */
  labelGap: 4,
} as const;

/** Approx label box size for a given itemNo text (python uses textbbox). */
export function labelSize(text: string, fontSize = DRAW_STYLE.fontSize) {
  // Rough monospace-ish estimate; good enough for placement/backgrounds.
  const charW = fontSize * 0.6;
  const width = Math.ceil(text.length * charW) + DRAW_STYLE.paddingX * 2;
  const height = fontSize + DRAW_STYLE.paddingY * 2;
  return { width, height };
}
