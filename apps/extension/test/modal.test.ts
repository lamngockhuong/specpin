import type { Spec } from "@specpin/spec-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalRenderer } from "../src/renderers/modal.js";
import { must } from "./test-utils.js";

function spec(id: string, title: string): Spec {
  return {
    id,
    title: { en: title },
    description: { en: `desc ${id}` },
    businessRules: [{ en: "rule one" }],
  } as unknown as Spec;
}

function modalHost(): HTMLElement | null {
  return document.getElementById("specpin-modal-host");
}

function launcherHost(): HTMLElement | null {
  return document.getElementById("specpin-launcher-host-modal");
}

afterEach(() => {
  document.body.innerHTML = "";
  modalHost()?.remove();
  launcherHost()?.remove();
});

describe("ModalRenderer", () => {
  it("renders an accessible dialog listing every matched spec", () => {
    const r = new ModalRenderer(document);
    const target = document.createElement("button");
    document.body.appendChild(target);

    r.render(spec("a", "One"), target, { confidence: 1, needsReview: false });
    r.render(spec("b", "Two"), target, { confidence: 0.6, needsReview: true });

    const shadow = modalHost()?.shadowRoot;
    expect(shadow).toBeTruthy();
    const dialog = shadow?.querySelector('[role="dialog"]');
    // Non-modal panel: the page stays interactive, so it must NOT claim aria-modal.
    expect(dialog?.hasAttribute("aria-modal")).toBe(false);
    expect(dialog?.getAttribute("aria-labelledby")).toBe("specpin-modal-title");
    expect(shadow?.querySelectorAll(".card")).toHaveLength(2);
    // The lower-confidence spec is flagged for review.
    expect(shadow?.querySelectorAll('.card[data-review="true"]')).toHaveLength(1);
    // Localized title resolves to plain text (never "[object Object]") - RT1.
    const titles = [...(shadow?.querySelectorAll(".card .t") ?? [])].map((n) => n.textContent);
    expect(titles).toEqual(["One", "Two"]);

    r.destroy();
  });

  it("renders the requested locale and falls back when it is absent", () => {
    const r = new ModalRenderer(document);
    const target = document.createElement("button");
    document.body.appendChild(target);
    const bilingual = {
      id: "x",
      title: { en: "Login", vi: "Đăng nhập" },
      description: { en: "desc" },
      businessRules: [],
    } as unknown as Spec;

    r.render(bilingual, target, {
      confidence: 1,
      needsReview: false,
      locale: "vi",
      defaultLocale: "en",
    });
    expect(modalHost()?.shadowRoot?.querySelector(".card .t")?.textContent).toBe("Đăng nhập");
    // Description has no vi -> falls back to en.
    expect(modalHost()?.shadowRoot?.querySelector(".card .d")?.textContent).toBe("desc");
    r.destroy();
  });

  it("clicking a card highlights the matched element and keeps the panel open", () => {
    const r = new ModalRenderer(document);
    const target = document.createElement("button");
    document.body.appendChild(target);
    const onHighlight = vi.fn();
    r.render(spec("a", "One"), target, { confidence: 1, needsReview: false, onHighlight });

    const card = modalHost()?.shadowRoot?.querySelector<HTMLElement>(".card");
    card?.click();

    expect(onHighlight).toHaveBeenCalledWith(target);
    // The panel stays open: only the close button dismisses it.
    const root = modalHost()?.shadowRoot?.querySelector(".root");
    expect(root?.hasAttribute("hidden")).toBe(false);
    r.destroy();
  });

  it("ignores Escape (closes only via the close button) and destroy() removes the host", () => {
    const r = new ModalRenderer(document);
    const target = document.createElement("div");
    document.body.appendChild(target);
    r.render(spec("a", "One"), target);

    const root = modalHost()?.shadowRoot?.querySelector(".root");
    expect(root?.hasAttribute("hidden")).toBe(false);

    // Esc no longer closes the panel: it stays open.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(root?.hasAttribute("hidden")).toBe(false);

    // The corner close button closes it (local hide, no onSetDismissed wired).
    modalHost()?.shadowRoot?.querySelector<HTMLButtonElement>(".close")?.click();
    expect(root?.hasAttribute("hidden")).toBe(true);

    r.destroy();
    expect(modalHost()).toBeNull();
  });

  it("drags the panel by its header, offsetting it via a translate", () => {
    const r = new ModalRenderer(document);
    const target = document.createElement("div");
    document.body.appendChild(target);
    r.render(spec("a", "One"), target);

    const shadow = modalHost()?.shadowRoot;
    const head = shadow?.querySelector<HTMLElement>(".head");
    const dialog = shadow?.querySelector<HTMLElement>(".dialog");
    expect(head).toBeTruthy();

    head?.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 100, clientY: 100, button: 0, pointerId: 1 }),
    );
    head?.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 160, clientY: 140, button: 0, pointerId: 1 }),
    );
    head?.dispatchEvent(new PointerEvent("pointerup", { button: 0, pointerId: 1 }));

    expect(dialog?.style.getPropertyValue("--sp-dx")).toBe("60px");
    expect(dialog?.style.getPropertyValue("--sp-dy")).toBe("40px");
    r.destroy();
  });

  it("persists dismissal via onSetDismissed when wired (close button)", () => {
    const r = new ModalRenderer(document);
    const target = document.createElement("button");
    document.body.appendChild(target);
    const onSetDismissed = vi.fn();
    r.render(spec("a", "One"), target, { confidence: 1, needsReview: false, onSetDismissed });

    const closeBtn = modalHost()?.shadowRoot?.querySelector<HTMLButtonElement>(".close");
    closeBtn?.click();
    expect(onSetDismissed).toHaveBeenCalledWith("modal", true);
    // With a callback the dialog defers to the content re-render rather than the
    // local hide, so the root stays visible until the renderer is recreated.
    const root = modalHost()?.shadowRoot?.querySelector(".root");
    expect(root?.hasAttribute("hidden")).toBe(false);
    r.destroy();
  });

  it("dismissed meta shows the relaunch pill instead of the dialog", () => {
    const r = new ModalRenderer(document);
    const target = document.createElement("button");
    document.body.appendChild(target);
    const onSetDismissed = vi.fn();
    r.render(spec("a", "One"), target, {
      confidence: 1,
      needsReview: false,
      dismissed: true,
      onSetDismissed,
    });
    r.render(spec("b", "Two"), target, {
      confidence: 1,
      needsReview: false,
      dismissed: true,
      onSetDismissed,
    });

    expect(modalHost()).toBeNull();
    const pill = launcherHost()?.shadowRoot?.querySelector<HTMLButtonElement>(".pill");
    expect(pill).toBeTruthy();
    expect(launcherHost()?.shadowRoot?.querySelector(".count")?.textContent).toBe("· 2");

    // Clicking the pill asks the content script to reopen this mode.
    pill?.click();
    expect(onSetDismissed).toHaveBeenCalledWith("modal", false);
    r.destroy();
    expect(launcherHost()).toBeNull();
  });

  it("aborts all listeners on destroy (no residual key handling, no host)", () => {
    const r = new ModalRenderer(document);
    const target = document.createElement("div");
    document.body.appendChild(target);
    r.render(spec("a", "One"), target);
    r.destroy();

    // Listeners were bound through an AbortController; after destroy a stray
    // event neither throws nor resurrects any UI.
    expect(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    ).not.toThrow();
    expect(modalHost()).toBeNull();
  });

  it("renders the Markdown subset and keeps XSS inert", () => {
    const r = new ModalRenderer(document);
    const target = document.createElement("button");
    document.body.appendChild(target);
    const md = {
      id: "m",
      title: { en: "T" },
      description: { en: "A **bold** word\n\n- one\n- two" },
      businessRules: [{ en: "See [docs](https://x.com)" }],
    } as unknown as Spec;
    const evil = {
      id: "e",
      title: { en: "E" },
      description: { en: "<img src=x onerror=alert(1)>" },
    } as unknown as Spec;
    r.render(md, target);
    r.render(evil, target);
    const shadow = must(modalHost()).shadowRoot;
    expect(shadow?.querySelector(".d strong")?.textContent).toBe("bold");
    expect(shadow?.querySelectorAll(".d ul li")).toHaveLength(2);
    expect(shadow?.querySelector(".card a")?.getAttribute("href")).toBe("https://x.com");
    // The injected <img> never becomes a live element.
    expect(shadow?.querySelector("img")).toBeNull();
    r.destroy();
  });
});
