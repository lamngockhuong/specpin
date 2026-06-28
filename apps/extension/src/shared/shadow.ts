import { applyTheme, type Theme } from "./theme.js";

// Shared Shadow-DOM host setup used by every rendered surface (tooltip, sidebar,
// capture form). Creates the host element, attaches an open shadow root, injects
// the given stylesheet, and (when given) stamps the forced theme on the host so
// the `:host([data-theme])` token block activates. Callers build their own
// content inside `shadow`. Applying the theme here keeps it at one chokepoint:
// hosts are destroyed and recreated on every theme change, so the host's theme
// never needs updating after creation.
export function createShadowHost(
  doc: Document,
  hostId: string,
  styles: string,
  theme?: Theme,
): { host: HTMLElement; shadow: ShadowRoot } {
  const host = doc.createElement("div");
  host.id = hostId;
  (doc.body ?? doc.documentElement).appendChild(host);
  if (theme) applyTheme(host, theme);
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = styles;
  shadow.appendChild(style);
  return { host, shadow };
}
