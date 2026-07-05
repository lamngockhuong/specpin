import { browser } from "#imports";

// Register the bundled Inter face on the HOST document from the content script.
//
// The extension pages get Inter via @font-face (shared/inter-font.css), but the
// in-page renderers live in shadow roots, and Chromium ignores @font-face rules
// declared inside a shadow tree - only document-scoped faces cascade into shadow
// DOM. So we add the FontFace to `document.fonts`, which the shadow renderers'
// `var(--sp-font-ui)` (Inter first) then resolves to.
//
// The woff2 is a web-accessible resource (see wxt.config.ts); the glyph load is
// still subject to the host page's font-src CSP. On a strict page the load
// rejects and the renderers keep the system-ui fallback - matching the
// non-intrusive, degrade-gracefully contract for content-script resources.
export function registerInterFont(): void {
  try {
    for (const face of document.fonts) {
      if (face.family === "Inter") return; // already registered this document
    }
    const url = browser.runtime.getURL("/fonts/inter-latin-variable.woff2");
    const face = new FontFace("Inter", `url("${url}") format("woff2")`, {
      weight: "100 900",
      display: "swap",
    });
    face
      .load()
      .then((loaded) => document.fonts.add(loaded))
      .catch(() => {
        /* host CSP blocked the font: system-ui fallback stands */
      });
  } catch {
    /* FontFace / runtime unavailable: system-ui fallback stands */
  }
}
