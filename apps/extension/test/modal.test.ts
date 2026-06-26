import type { Spec } from "@specpin/spec-schema";
import { afterEach, describe, expect, it } from "vitest";
import { ModalRenderer } from "../src/renderers/modal.js";

function spec(id: string, title: string): Spec {
  return {
    id,
    title,
    description: `desc ${id}`,
    businessRules: ["rule one"],
  } as unknown as Spec;
}

function modalHost(): HTMLElement | null {
  return document.getElementById("specpin-modal-host");
}

afterEach(() => {
  document.body.innerHTML = "";
  modalHost()?.remove();
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
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-labelledby")).toBe("specpin-modal-title");
    expect(shadow?.querySelectorAll(".card")).toHaveLength(2);
    // The lower-confidence spec is flagged for review.
    expect(shadow?.querySelectorAll('.card[data-review="true"]')).toHaveLength(1);

    r.destroy();
  });

  it("closes on Escape and destroy() removes the host", () => {
    const r = new ModalRenderer(document);
    const target = document.createElement("div");
    document.body.appendChild(target);
    r.render(spec("a", "One"), target);

    const root = modalHost()?.shadowRoot?.querySelector(".root");
    expect(root?.hasAttribute("hidden")).toBe(false);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(root?.hasAttribute("hidden")).toBe(true);

    r.destroy();
    expect(modalHost()).toBeNull();
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
});
