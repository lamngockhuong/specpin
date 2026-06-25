// Small HTML-escaping helpers shared by the renderers and the capture form, so
// the escaping rules live in one place.

/** Escape text for safe insertion as element text content. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape a string for use inside a double-quoted HTML attribute. */
export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
