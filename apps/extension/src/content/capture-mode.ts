// Capture-mode element picker: highlight the element under the cursor and, on
// click, capture it while suppressing the host page's own click handlers.
// Capture-phase listeners with stopPropagation/preventDefault run only while
// active, so the host page is untouched outside capture mode.

import type { Theme } from "../shared/theme.js";
import { PickerHud, type PickerHudVariant } from "./picker-hud.js";

const HIGHLIGHT_ID = "specpin-capture-highlight";
const SELECTION_ID = "specpin-capture-selection";

/** Per-session picker options: which HUD instruction to show and the forced theme
 *  for the HUD host (threaded from the content script). */
export interface PickerOptions {
  hud?: PickerHudVariant;
  theme?: Theme;
}

export class CapturePicker {
  private active = false;
  private highlight: HTMLElement | null = null;
  private onPick: ((el: Element) => void) | null = null;
  private onCancel: (() => void) | null = null;
  private readonly doc: Document;
  // Multi-select mode (bulk capture): accumulate picks, toggle on re-click, finish
  // on Enter. Additive to single-shot `start`; when `multi` is false these stay idle.
  private multi = false;
  private selected: Element[] = [];
  private onDone: ((els: Element[]) => void) | null = null;
  private selectionLayer: HTMLElement | null = null;
  private hud: PickerHud | null = null;

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Begin picking. `onCancel` fires when the picker is dismissed WITHOUT a pick
   *  (Escape), so callers can release any "capture in progress" state instead of
   *  leaking it (a stuck flag would freeze re-rendering). */
  start(onPick: (el: Element) => void, onCancel?: () => void, opts?: PickerOptions): void {
    if (this.active) return;
    this.active = true;
    this.onPick = onPick;
    this.onCancel = onCancel ?? null;
    this.ensureHighlight();
    this.hud = new PickerHud(this.doc);
    this.hud.mount({
      multi: false,
      variant: opts?.hud ?? "capture",
      theme: opts?.theme,
      onCancel: () => this.cancelPick(),
    });
    this.doc.addEventListener("mousemove", this.onMove, true);
    this.doc.addEventListener("click", this.onClick, true);
    this.doc.addEventListener("keydown", this.onKey, true);
    // Swallow the press events too, so host handlers bound to pointerdown/
    // mousedown never fire for the element being captured.
    this.doc.addEventListener("pointerdown", this.suppress, true);
    this.doc.addEventListener("mousedown", this.suppress, true);
  }

  /** Begin multi-select picking (bulk capture): each click toggles the element in
   *  or out of the selection (a persistent outline marks the picked ones); Enter
   *  finishes with `onDone(selected)`; Escape cancels via `onCancel`. `start` (the
   *  single-shot flow) is untouched — this is purely additive. */
  startMulti(onDone: (els: Element[]) => void, onCancel?: () => void, opts?: PickerOptions): void {
    if (this.active) return;
    this.active = true;
    this.multi = true;
    this.selected = [];
    this.onDone = onDone;
    this.onCancel = onCancel ?? null;
    this.ensureHighlight();
    this.ensureSelectionLayer();
    this.hud = new PickerHud(this.doc);
    this.hud.mount({
      multi: true,
      variant: "bulk",
      theme: opts?.theme,
      onDone: () => this.finishMulti(),
      onCancel: () => this.cancelPick(),
    });
    this.doc.addEventListener("mousemove", this.onMove, true);
    this.doc.addEventListener("click", this.onClick, true);
    this.doc.addEventListener("keydown", this.onKey, true);
    this.doc.addEventListener("pointerdown", this.suppress, true);
    this.doc.addEventListener("mousedown", this.suppress, true);
  }

  /** Tear down the picker. External stop (caller-driven) does not fire onCancel;
   *  the caller already owns its own state in that path. */
  stop(): void {
    this.teardown();
  }

  private teardown(): void {
    if (!this.active) return;
    this.active = false;
    this.multi = false;
    this.onPick = null;
    this.onCancel = null;
    this.onDone = null;
    this.selected = [];
    this.doc.removeEventListener("mousemove", this.onMove, true);
    this.doc.removeEventListener("click", this.onClick, true);
    this.doc.removeEventListener("keydown", this.onKey, true);
    this.doc.removeEventListener("pointerdown", this.suppress, true);
    this.doc.removeEventListener("mousedown", this.suppress, true);
    this.highlight?.remove();
    this.highlight = null;
    this.selectionLayer?.remove();
    this.selectionLayer = null;
    this.hud?.destroy();
    this.hud = null;
  }

  // Abort the pick (Escape or the HUD Cancel button route here). Guarded on
  // `active` so the HUD button and a key press cannot double-teardown.
  private cancelPick(): void {
    if (!this.active) return;
    const cancel = this.onCancel;
    this.teardown();
    cancel?.();
  }

  // Finish a multi-pick with whatever is currently selected (Enter or the HUD
  // Done button route here). Same `active` guard against double-finish.
  private finishMulti(): void {
    if (!this.active) return;
    const done = this.onDone;
    const picked = this.selected.slice();
    this.teardown();
    done?.(picked);
  }

  // True when an element is one of Specpin's own overlay hosts (the HUD, hover
  // highlight, or selection layer). Shadow-DOM retargets events to their host at
  // the document level, so the host's `specpin-` id identifies them.
  private isOwnUiElement(el: Element | null): boolean {
    return !!el && el.id.startsWith("specpin-");
  }

  // Same test for an event's (retargeted) target. The picker must NOT suppress
  // these, or its own HUD buttons would never receive the click (the capture-phase
  // suppressor would stopPropagation first).
  private isOwnUi(event: Event): boolean {
    return this.isOwnUiElement(event.target as Element | null);
  }

  private ensureHighlight(): void {
    const box = this.doc.createElement("div");
    box.id = HIGHLIGHT_ID;
    Object.assign(box.style, {
      position: "fixed",
      zIndex: "2147483646",
      pointerEvents: "none",
      border: "2px solid #4f46e5",
      background: "rgba(79,70,229,0.12)",
      borderRadius: "3px",
      transition: "all 40ms linear",
    } satisfies Partial<CSSStyleDeclaration>);
    (this.doc.body ?? this.doc.documentElement).appendChild(box);
    this.highlight = box;
  }

  private ensureSelectionLayer(): void {
    const layer = this.doc.createElement("div");
    layer.id = SELECTION_ID;
    Object.assign(layer.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483645",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    (this.doc.body ?? this.doc.documentElement).appendChild(layer);
    this.selectionLayer = layer;
  }

  // Repaint one persistent outline per selected element from live rects. Distinct
  // from the hover highlight (emerald vs indigo) so a picked element reads clearly.
  private paintSelection(): void {
    const layer = this.selectionLayer;
    if (!layer) return;
    layer.replaceChildren();
    for (const el of this.selected) {
      const rect = el.getBoundingClientRect();
      const box = this.doc.createElement("div");
      Object.assign(box.style, {
        position: "fixed",
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        border: "2px solid #059669",
        background: "rgba(5,150,105,0.14)",
        borderRadius: "3px",
        boxSizing: "border-box",
        pointerEvents: "none",
      } satisfies Partial<CSSStyleDeclaration>);
      layer.appendChild(box);
    }
  }

  // Add or remove an element from the multi-select set; ignores our own overlay
  // nodes so a stray click on a highlight box never becomes a selection.
  private toggleSelect(el: Element): void {
    // Skip our own overlay nodes: the selection-layer boxes (no id, caught by
    // contains) and any `specpin-*` host — a shadow-DOM click retargets to its host
    // (e.g. `specpin-capture-highlight`, or `specpin-coverage-host` when coverage
    // mode is also on) — so a stray click never selects Specpin's UI as a page el.
    if (this.selectionLayer?.contains(el)) return;
    if (this.isOwnUiElement(el)) return;
    const idx = this.selected.indexOf(el);
    if (idx >= 0) this.selected.splice(idx, 1);
    else this.selected.push(el);
    this.paintSelection();
    this.hud?.setCount(this.selected.length);
  }

  private onMove = (event: Event): void => {
    // Don't chase our own overlay hosts (HUD/highlight) with the hover box.
    if (this.isOwnUi(event)) return;
    const el = event.target as Element | null;
    if (!el || !this.highlight || el === this.highlight) return;
    const rect = el.getBoundingClientRect();
    Object.assign(this.highlight.style, {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    // Keep the persistent selection outlines glued as the layout shifts under the
    // cursor (cheap; the set is small).
    if (this.multi) this.paintSelection();
  };

  private onClick = (event: Event): void => {
    // A click on the HUD (or any Specpin overlay host) is not a page pick: let it
    // through so the HUD's own button handlers fire.
    if (this.isOwnUi(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const el = event.target as Element | null;
    if (this.multi) {
      if (el) this.toggleSelect(el);
      return;
    }
    const pick = this.onPick;
    this.teardown();
    if (el && pick) pick(el);
  };

  private suppress = (event: Event): void => {
    // Never suppress presses on our own overlay hosts (the HUD buttons), only on
    // page elements being captured.
    if (this.isOwnUi(event)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  private onKey = (event: Event): void => {
    const key = (event as KeyboardEvent).key;
    if (key === "Escape") {
      event.preventDefault();
      this.cancelPick();
      return;
    }
    // Enter finishes multi-select with whatever is currently picked (possibly none).
    if (this.multi && key === "Enter") {
      event.preventDefault();
      this.finishMulti();
    }
  };
}
