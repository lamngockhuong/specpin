/**
 * Escape the five XML/HTML special characters for safe placement in element
 * text or a double-quoted attribute. The apostrophe uses the numeric `&#39;`
 * (not `&apos;`) so the output is valid in BOTH HTML and XML/SVG — one escaper
 * shared by the HTML spec-sheet builder and the SVG export builder.
 */
export function escapeMarkup(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
