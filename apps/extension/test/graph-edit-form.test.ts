import { validateFlows } from "@specpin/spec-schema";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyFlow } from "../src/graph/graph-edit-flow-crud.js";
import { mountEditForm } from "../src/graph/graph-edit-form.js";
import { mountLocalizedEditor } from "../src/graph/graph-localized-editor.js";
import { mountSpecIdPicker } from "../src/graph/graph-specid-picker.js";
import { must } from "./test-utils.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

function fire(el: Element, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

describe("mountLocalizedEditor", () => {
  it("round-trips typed text into a valid LocalizedString map", () => {
    const container = mount();
    const editor = mountLocalizedEditor(container, () => {});
    editor.setValue({}, "en");
    const input = must(container.querySelector("input")) as HTMLInputElement;
    input.value = "Checkout";
    fire(input, "input");
    expect(editor.getValue()).toEqual({ en: "Checkout" });
    expect(editor.isValid()).toBe(true);
  });

  it("seeds one row per existing locale plus the panel's current locale", () => {
    const container = mount();
    const editor = mountLocalizedEditor(container, () => {});
    editor.setValue({ en: "Checkout", vi: "Thanh toán" }, "ja");
    const inputs = [...container.querySelectorAll("input")];
    expect(inputs).toHaveLength(3);
  });

  it("rejects an all-empty map inline (schema minProperties 1)", () => {
    const container = mount();
    const editor = mountLocalizedEditor(container, () => {});
    editor.setValue({ en: "Checkout" }, "en");
    const input = must(container.querySelector("input")) as HTMLInputElement;
    input.value = "";
    fire(input, "input");
    expect(editor.isValid()).toBe(false);
    expect(editor.getValue()).toEqual({});
    const error = must(container.querySelector(".edit-form-field-error")) as HTMLElement;
    expect(error.hidden).toBe(false);
  });

  it("removing a row drops that locale from the value", () => {
    const container = mount();
    const editor = mountLocalizedEditor(container, () => {});
    editor.setValue({ en: "Checkout", vi: "Thanh toán" }, "en");
    fire(must(container.querySelector(".edit-form-remove-locale")), "click");
    expect(Object.keys(editor.getValue())).toEqual(["vi"]);
  });
});

describe("mountSpecIdPicker", () => {
  it("labels pending vs pinned specs and offers a none option", () => {
    const container = mount();
    const picker = mountSpecIdPicker(container, () => {});
    picker.setSpecs([
      { id: "pinned-1", pending: false },
      { id: "pending-1", pending: true },
    ]);
    const options = [...container.querySelectorAll("option")].map((o) => o.textContent);
    expect(options).toContain("pinned-1");
    expect(options.some((o) => o?.includes("pending-1") && o.includes("pending"))).toBe(true);
    expect(options[0]).toBe("— none —");
  });

  it("getValue/setValue round-trip the selected id, null for none", () => {
    const container = mount();
    let changed = 0;
    const picker = mountSpecIdPicker(container, () => {
      changed++;
    });
    picker.setSpecs([{ id: "a", pending: false }]);
    const select = must(container.querySelector("select")) as HTMLSelectElement;
    select.value = "a";
    fire(select, "change");
    expect(picker.getValue()).toBe("a");
    expect(changed).toBe(1);
    select.value = "";
    fire(select, "change");
    expect(picker.getValue()).toBeNull();
  });

  it("never blocks editing when the spec list is empty", () => {
    const container = mount();
    const picker = mountSpecIdPicker(container, () => {});
    picker.setSpecs([]);
    expect(container.querySelectorAll("option")).toHaveLength(1); // just "none"
    expect(picker.getValue()).toBeNull();
  });
});

describe("mountEditForm: create screen (duplicate id + empty label flagged)", () => {
  it("blocks submit inline when the name is empty, without calling onCreate", () => {
    const container = mount();
    const form = mountEditForm(container, { knownSpecs: () => [], locale: () => "en" });
    let called = false;
    form.showCreateScreen(() => {
      called = true;
      return { ok: true };
    });
    fire(must(container.querySelector(".edit-form-submit")), "click");
    expect(called).toBe(false);
    expect(must(container.querySelector(".edit-form-error") as HTMLElement).hidden).toBe(false);
  });

  it("surfaces a duplicate-id rejection from onCreate inline", () => {
    const container = mount();
    const form = mountEditForm(container, { knownSpecs: () => [], locale: () => "en" });
    const inputs = () => [...container.querySelectorAll("input")];
    form.showCreateScreen((id, values) => {
      expect(id).toBe("checkout");
      expect(values.name).toEqual({ en: "Checkout" });
      return { ok: false, error: 'a screen with id "checkout" already exists' };
    });
    const [idInput, nameInput] = inputs();
    idInput.value = "checkout";
    fire(idInput, "input");
    nameInput.value = "Checkout";
    fire(nameInput, "input");
    fire(must(container.querySelector(".edit-form-submit")), "click");
    const error = must(container.querySelector(".edit-form-error")) as HTMLElement;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toMatch(/already exists/);
  });
});

describe("mountEditForm: create transition (dangling endpoint flagged)", () => {
  it("surfaces a dangling-endpoint rejection from onCreate inline", () => {
    const container = mount();
    const form = mountEditForm(container, { knownSpecs: () => [], locale: () => "en" });
    form.showCreateTransition(() => ({ ok: false, error: "edge references an unknown screen" }));
    const triggerInput = must(container.querySelector("input")) as HTMLInputElement;
    triggerInput.value = "Buy";
    fire(triggerInput, "input");
    fire(must(container.querySelector(".edit-form-submit")), "click");
    const error = must(container.querySelector(".edit-form-error")) as HTMLElement;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toMatch(/unknown screen/);
  });

  it("blocks submit inline when the trigger is empty", () => {
    const container = mount();
    const form = mountEditForm(container, { knownSpecs: () => [], locale: () => "en" });
    let called = false;
    form.showCreateTransition(() => {
      called = true;
      return { ok: true };
    });
    fire(must(container.querySelector(".edit-form-submit")), "click");
    expect(called).toBe(false);
  });
});

describe("mountEditForm: edit transition (non-manual not editable)", () => {
  it("disables guard/role/specId and never calls onChange for a non-manual transition", () => {
    const container = mount();
    const form = mountEditForm(container, { knownSpecs: () => [], locale: () => "en" });
    let called = false;
    form.showEditTransition(
      { trigger: { en: "Submit" }, guard: null, role: null, specId: null },
      false,
      () => {
        called = true;
        return { ok: true };
      },
    );
    const notice = container.querySelector(".edit-form-notice");
    expect(notice).not.toBeNull();
    const inputs = [...container.querySelectorAll("input")];
    // guard + role inputs (index 1, 2 -- index 0 is the trigger's locale row).
    expect(inputs[1].disabled).toBe(true);
    expect(inputs[2].disabled).toBe(true);
    fire(inputs[1], "input");
    expect(called).toBe(false);
  });

  it("applies live for a manual transition", () => {
    const container = mount();
    const form = mountEditForm(container, { knownSpecs: () => [], locale: () => "en" });
    let received: unknown;
    form.showEditTransition(
      { trigger: { en: "Submit" }, guard: null, role: null, specId: null },
      true,
      (values) => {
        received = values;
        return { ok: true };
      },
    );
    const inputs = [...container.querySelectorAll("input")];
    const guardInput = inputs[1];
    guardInput.value = "amount > 0";
    fire(guardInput, "input");
    expect(received).toMatchObject({ guard: "amount > 0" });
  });
});

describe("create-from-scratch produces a schema-valid config", () => {
  it("createEmptyFlow + an empty FlowsConfig validates", () => {
    const flow = createEmptyFlow("application-status", { en: "Application" });
    const config = { version: "1.0", flows: [flow] };
    expect(validateFlows(config).valid).toBe(true);
  });
});
