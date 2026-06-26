// Capture-mode element picker: highlight the element under the cursor and, on
// click, capture it while suppressing the host page's own click handlers.
// Capture-phase listeners with stopPropagation/preventDefault run only while
// active, so the host page is untouched outside capture mode.

const HIGHLIGHT_ID = "specpin-capture-highlight";

export class CapturePicker {
  private active = false;
  private highlight: HTMLElement | null = null;
  private onPick: ((el: Element) => void) | null = null;
  private onCancel: (() => void) | null = null;
  private readonly doc: Document;

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Begin picking. `onCancel` fires when the picker is dismissed WITHOUT a pick
   *  (Escape), so callers can release any "capture in progress" state instead of
   *  leaking it (a stuck flag would freeze re-rendering). */
  start(onPick: (el: Element) => void, onCancel?: () => void): void {
    if (this.active) return;
    this.active = true;
    this.onPick = onPick;
    this.onCancel = onCancel ?? null;
    this.ensureHighlight();
    this.doc.addEventListener("mousemove", this.onMove, true);
    this.doc.addEventListener("click", this.onClick, true);
    this.doc.addEventListener("keydown", this.onKey, true);
    // Swallow the press events too, so host handlers bound to pointerdown/
    // mousedown never fire for the element being captured.
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
    this.onPick = null;
    this.onCancel = null;
    this.doc.removeEventListener("mousemove", this.onMove, true);
    this.doc.removeEventListener("click", this.onClick, true);
    this.doc.removeEventListener("keydown", this.onKey, true);
    this.doc.removeEventListener("pointerdown", this.suppress, true);
    this.doc.removeEventListener("mousedown", this.suppress, true);
    this.highlight?.remove();
    this.highlight = null;
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

  private onMove = (event: Event): void => {
    const el = event.target as Element | null;
    if (!el || !this.highlight || el === this.highlight) return;
    const rect = el.getBoundingClientRect();
    Object.assign(this.highlight.style, {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  };

  private onClick = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    const el = event.target as Element | null;
    const pick = this.onPick;
    this.teardown();
    if (el && pick) pick(el);
  };

  private suppress = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  private onKey = (event: Event): void => {
    if ((event as KeyboardEvent).key === "Escape") {
      event.preventDefault();
      const cancel = this.onCancel;
      this.teardown();
      cancel?.();
    }
  };
}
