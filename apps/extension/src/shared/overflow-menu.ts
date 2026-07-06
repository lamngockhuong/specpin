// A single-instance overflow ("...") dropdown, shared by any surface that needs
// to collapse a row of actions behind one kebab button. Generalized from the
// export project-picker in project-actions.ts (same proven approach: appended to
// <body>, positioned with position: fixed against the anchor's bounding rect,
// dismissed on outside-click / Escape / scroll), plus a `danger` item variant.
// The export picker predates this and still carries its own copy of the lifecycle;
// it could later migrate onto openOverflowMenu (needs an optional header row + a
// close/is-open hook for its live-target rebuild). Keep the two in sync until then.
//
// Injection-safe: item labels go through textContent, never innerHTML.

export interface OverflowMenuItem {
  /** Visible menu-item text. */
  label: string;
  /** Optional native tooltip; falls back to `label` when omitted. */
  title?: string;
  /** Render as a destructive item (e.g. Delete) with the error accent. */
  danger?: boolean;
  onSelect: () => void;
}

// One menu at a time across the whole page. Reopening (or opening from another
// anchor) tears the previous one down first, so listeners never stack.
let menu: HTMLElement | null = null;
let dismiss: (() => void) | null = null;
let openAnchor: HTMLElement | null = null;

function close(): void {
  if (menu) menu.hidden = true;
  if (dismiss) {
    dismiss();
    dismiss = null;
  }
  openAnchor = null;
}

/** Open (or, when already open for the same anchor, toggle shut) a dropdown of
 *  `items` anchored under `anchor`, right-aligned to it. */
export function openOverflowMenu(anchor: HTMLElement, items: OverflowMenuItem[]): void {
  // Same-anchor click closes it: the kebab button acts as a toggle.
  if (openAnchor === anchor && menu && !menu.hidden) {
    close();
    return;
  }
  close();

  if (!menu) {
    menu = document.createElement("div");
    menu.className = "sp-menu";
    menu.setAttribute("role", "menu");
    document.body.appendChild(menu);
  }
  menu.replaceChildren();
  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = item.danger ? "sp-menu-item danger" : "sp-menu-item";
    btn.setAttribute("role", "menuitem");
    btn.textContent = item.label;
    btn.title = item.title ?? item.label;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
      item.onSelect();
    });
    menu.appendChild(btn);
  }

  // Right-align under the anchor (rect is viewport-relative, so position: fixed
  // needs no scroll offset).
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = "auto";
  menu.style.right = `${window.innerWidth - rect.right}px`;
  menu.hidden = false;
  openAnchor = anchor;

  // Dismiss on outside click, Escape, or scroll. Bound on the next tick so the
  // click that opened the menu does not immediately close it (matches the export
  // picker's lifecycle).
  const onClick = (e: MouseEvent): void => {
    const target = e.target as Node;
    // Ignore clicks on the anchor itself: its own handler toggles the menu, so
    // closing here first (this capture listener fires before the anchor's click)
    // would immediately reopen it - a close-then-reopen flicker that defeats the
    // toggle. Only genuine outside clicks close.
    if (menu && !menu.contains(target) && !anchor.contains(target)) close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  const onScroll = (): void => close();
  setTimeout(() => {
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
  }, 0);
  dismiss = () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", onScroll, true);
  };
}
