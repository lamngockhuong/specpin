// Sidebar-rail section switching for the options page. Presentation only: it
// toggles which `.pane` is visible and keeps the nav rail's active state in
// sync. The Spec pane holds two sources (live sidecar / manual bundle) behind a
// segmented control; its choice is a second hash segment. The whole route lives
// in `location.hash` so it is deep-linkable and survives a reload; no storage
// and no message round-trips.

const PANES = ["spec", "appearance", "toolbar", "corpus", "support", "shortcuts"] as const;
type Pane = (typeof PANES)[number];

// Sub-tabs of the Spec pane. Selected via `#spec/<tab>`; bare `#spec` falls
// back to the first (live).
const SPEC_TABS = ["live", "manual"] as const;
type SpecTab = (typeof SPEC_TABS)[number];

function isPane(value: string): value is Pane {
  return (PANES as readonly string[]).includes(value);
}

function isSpecTab(value: string): value is SpecTab {
  return (SPEC_TABS as readonly string[]).includes(value);
}

interface Route {
  pane: Pane;
  tab: SpecTab;
}

/** Parse `#pane` or `#spec/<tab>` into a route, defaulting unknown values. */
function routeFromHash(): Route {
  const [head, sub = ""] = location.hash.replace(/^#/, "").split("/");
  const pane = isPane(head) ? head : "spec";
  const tab: SpecTab = pane === "spec" && isSpecTab(sub) ? sub : "live";
  return { pane, tab };
}

/** Show one pane, hide the rest, mark the active nav item, and (for the Spec
 *  pane) show the active sub-pane and mark its segmented button. Rail items use
 *  `aria-current="page"` (hash navigation); segmented buttons are a real tab
 *  widget, so they carry `aria-selected`. */
function activate(route: Route): void {
  for (const p of PANES) {
    document.getElementById(`pane-${p}`)?.classList.toggle("active", p === route.pane);
    const item = document.querySelector<HTMLElement>(`.nav-item[data-pane="${p}"]`);
    if (p === route.pane) item?.setAttribute("aria-current", "page");
    else item?.removeAttribute("aria-current");
  }
  // Sub-tabs belong to the Spec pane only; skip the DOM writes for every other
  // pane (their sub-panes stay hidden under the inactive parent regardless).
  if (route.pane === "spec") {
    for (const t of SPEC_TABS) {
      const selected = t === route.tab;
      document.getElementById(`spec-${t}`)?.classList.toggle("active", selected);
      const btn = document.querySelector<HTMLElement>(`.seg-btn[data-spec-tab="${t}"]`);
      btn?.setAttribute("aria-selected", String(selected));
      // Roving tabindex: only the selected tab is in the Tab sequence; the others
      // are reachable via the arrow keys wired in `initOptionsNav`.
      if (btn) btn.tabIndex = selected ? 0 : -1;
    }
  }
}

/** Move focus (and selection) to a Spec sub-tab by index, wrapping at the ends.
 *  Automatic activation: focusing a tab also selects it, per the WAI-ARIA tabs
 *  pattern. */
function focusSpecTab(index: number): void {
  const tab = SPEC_TABS[(index + SPEC_TABS.length) % SPEC_TABS.length];
  location.hash = `spec/${tab}`;
  document.querySelector<HTMLElement>(`.seg-btn[data-spec-tab="${tab}"]`)?.focus();
}

/** Wire the rail and the Spec segmented control: clicks set the hash, the hash
 *  drives which pane and sub-tab show. */
export function initOptionsNav(): void {
  for (const btn of document.querySelectorAll<HTMLElement>(".nav-item")) {
    btn.addEventListener("click", () => {
      location.hash = btn.dataset.pane ?? "spec";
    });
  }
  const segButtons = [...document.querySelectorAll<HTMLElement>(".seg-btn")];
  for (const [i, btn] of segButtons.entries()) {
    btn.addEventListener("click", () => {
      location.hash = `spec/${btn.dataset.specTab ?? "live"}`;
    });
    btn.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (step !== undefined) focusSpecTab(i + step);
      else if (event.key === "Home") focusSpecTab(0);
      else if (event.key === "End") focusSpecTab(segButtons.length - 1);
      else return;
      event.preventDefault();
    });
  }
  window.addEventListener("hashchange", () => activate(routeFromHash()));
  activate(routeFromHash());
}
