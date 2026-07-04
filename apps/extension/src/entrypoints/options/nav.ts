// Sidebar-rail section switching for the options page. Presentation only: it
// toggles which `.pane` is visible and keeps the nav rail's active state in
// sync. The active section lives in `location.hash` so it is deep-linkable and
// survives a reload; no storage and no message round-trips.

const PANES = ["projects", "appearance", "toolbar", "manual", "corpus", "support"] as const;
type Pane = (typeof PANES)[number];

function isPane(value: string): value is Pane {
  return (PANES as readonly string[]).includes(value);
}

function paneFromHash(): Pane {
  const hash = location.hash.replace(/^#/, "");
  return isPane(hash) ? hash : "projects";
}

/** Show one pane, hide the rest, and mark the active nav item. This is
 *  hash-based navigation (not a tab widget), so the active item carries
 *  `aria-current="page"` rather than `aria-selected`. */
function activate(pane: Pane): void {
  for (const p of PANES) {
    document.getElementById(`pane-${p}`)?.classList.toggle("active", p === pane);
    const item = document.querySelector<HTMLElement>(`.nav-item[data-pane="${p}"]`);
    if (p === pane) item?.setAttribute("aria-current", "page");
    else item?.removeAttribute("aria-current");
  }
}

/** Wire the rail: clicks set the hash, the hash drives which pane shows. */
export function initOptionsNav(): void {
  for (const btn of document.querySelectorAll<HTMLElement>(".nav-item")) {
    btn.addEventListener("click", () => {
      location.hash = btn.dataset.pane ?? "projects";
    });
  }
  window.addEventListener("hashchange", () => activate(paneFromHash()));
  activate(paneFromHash());
}
