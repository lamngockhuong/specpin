import type { Spec } from "@specpin/spec-schema";
import { afterEach, describe, expect, it } from "vitest";
import { initI18n } from "../src/i18n/index.js";
import en from "../src/i18n/messages/en.js";
import vi from "../src/i18n/messages/vi.js";
import { ModalRenderer } from "../src/renderers/modal.js";

function spec(id: string, title: string): Spec {
  return {
    id,
    title: { en: title },
    description: { en: `desc ${id}` },
    businessRules: [],
  } as unknown as Spec;
}

afterEach(() => {
  document.body.innerHTML = "";
  document.getElementById("specpin-modal-host")?.remove();
  // Restore the default locale so other suites are unaffected by the module-level state.
  initI18n("en");
});

describe("renderer chrome i18n (end to end)", () => {
  it("renders Vietnamese chrome when the UI locale is vi", () => {
    initI18n("vi");
    const r = new ModalRenderer(document);
    const target = document.createElement("button");
    document.body.appendChild(target);
    r.render(spec("a", "One"), target, { confidence: 1, needsReview: false });

    const shadow = document.getElementById("specpin-modal-host")?.shadowRoot;
    expect(shadow?.querySelector(".title")?.textContent).toBe(vi["common.specsOnThisPage"]);
    // Spec CONTENT (the title) stays as authored; only chrome is translated.
    expect(shadow?.querySelector(".card .t")?.textContent).toBe("One");
    r.destroy();
  });

  it("renders English chrome when the UI locale is en", () => {
    initI18n("en");
    const r = new ModalRenderer(document);
    const target = document.createElement("button");
    document.body.appendChild(target);
    r.render(spec("a", "One"), target, { confidence: 1, needsReview: false });

    const shadow = document.getElementById("specpin-modal-host")?.shadowRoot;
    expect(shadow?.querySelector(".title")?.textContent).toBe(en["common.specsOnThisPage"]);
    r.destroy();
  });
});
