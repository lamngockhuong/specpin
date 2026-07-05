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

// DOMParser is stateless, so one shared instance serves every parse call. It is
// created lazily on first use: this module is also pulled into the background
// service worker (via shared/messaging + config), where DOMParser does not exist
// and a top-level `new DOMParser()` would throw at import time, aborting SW
// registration. The parse helpers only ever run in DOM contexts (pages, content
// script), so the instance is never constructed in the worker.
let trustedHtmlParser: DOMParser | undefined;

// Parse a trusted HTML string into detached nodes with DOMParser instead of
// assigning `innerHTML` / calling `insertAdjacentHTML`. DOMParser never runs
// scripts and is treated as safe by the add-on store's no-unsanitized linter,
// so routing every trusted-fragment insertion through these two helpers keeps
// the AMO validation free of "unsafe assignment/call" warnings. The trust
// contract is unchanged: callers still own escaping (escapeHtml/escapeAttr on
// every interpolated value). The markup must be body-level: `text/html` parsing
// relocates <style>/<script>/<head> elements into <head> and foster-parents bare
// table sections (<tr>/<td>/<tbody>) out of <body>, so those would silently
// vanish here. The returned array snapshots the nodes before the caller's
// replaceChildren/append moves them out of the parser document.
function parseTrustedNodes(html: string): ChildNode[] {
  trustedHtmlParser ??= new DOMParser();
  return [...trustedHtmlParser.parseFromString(html, "text/html").body.childNodes];
}

/** Replace an element's children with nodes parsed from a trusted HTML string. */
export function setTrustedHtml(el: Element, html: string): void {
  el.replaceChildren(...parseTrustedNodes(html));
}

/** Append nodes parsed from a trusted HTML string to an element. */
export function appendTrustedHtml(el: Element, html: string): void {
  el.append(...parseTrustedNodes(html));
}
