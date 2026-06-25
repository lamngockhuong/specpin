// Shared Shadow-DOM host setup used by every rendered surface (tooltip, sidebar,
// capture form). Creates the host element, attaches an open shadow root, and
// injects the given stylesheet. Callers build their own content inside `shadow`.
export function createShadowHost(
  doc: Document,
  hostId: string,
  styles: string,
): { host: HTMLElement; shadow: ShadowRoot } {
  const host = doc.createElement("div");
  host.id = hostId;
  (doc.body ?? doc.documentElement).appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = styles;
  shadow.appendChild(style);
  return { host, shadow };
}
