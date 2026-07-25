import type { FlowState, LocalizedString } from "@specpin/spec-schema";
import type { MessageKey } from "../i18n/index.js";
import { t } from "../i18n/index.js";
import { type LocalizedEditorHandle, mountLocalizedEditor } from "./graph-localized-editor.js";
import { mountSpecIdPicker, type SpecIdPickerHandle } from "./graph-specid-picker.js";

// Shared DOM-building helpers for the per-kind form modules
// (graph-edit-form-screen/-state/-transition.ts): split out purely to hold
// each of those files, and graph-edit-form.ts's orchestrator, under the
// plan's 200-line budget. Only the specId picker (a real sub-widget with its
// own state) needs a dependency in; everything else is a plain DOM builder.

export interface KnownSpecsSource {
  knownSpecs(): { id: string; pending: boolean }[];
  locale(): string;
}

export function resetForm(
  container: HTMLElement,
  titleKey: MessageKey,
): { body: HTMLElement; errorEl: HTMLElement } {
  container.replaceChildren();
  container.hidden = false;
  const title = document.createElement("h3");
  title.className = "edit-form-title";
  title.textContent = t(titleKey);
  const body = document.createElement("div");
  body.className = "edit-form-body";
  const errorEl = document.createElement("div");
  errorEl.className = "edit-form-error";
  errorEl.hidden = true;
  container.append(title, body, errorEl);
  return { body, errorEl };
}

export function showFormError(errorEl: HTMLElement, error: string | undefined): void {
  errorEl.hidden = !error;
  errorEl.textContent = error ?? "";
}

export function fieldRow(labelText: string, control: HTMLElement): HTMLElement {
  const row = document.createElement("div");
  row.className = "edit-form-row";
  const label = document.createElement("label");
  label.textContent = labelText;
  row.append(label, control);
  return row;
}

export function textInput(initial: string, placeholder?: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.value = initial;
  if (placeholder) input.placeholder = placeholder;
  return input;
}

const KIND_OPTIONS: { value: NonNullable<FlowState["kind"]> | ""; labelKey: MessageKey }[] = [
  { value: "", labelKey: "graph.edit.kindNormal" },
  { value: "initial", labelKey: "graph.edit.kindInitial" },
  { value: "terminal", labelKey: "graph.edit.kindTerminal" },
];

export function kindSelect(initial: FlowState["kind"]): HTMLSelectElement {
  const select = document.createElement("select");
  for (const opt of KIND_OPTIONS) {
    const el = document.createElement("option");
    el.value = opt.value;
    el.textContent = t(opt.labelKey);
    select.appendChild(el);
  }
  select.value = initial ?? "";
  return select;
}

/** The specId field row. `onChange` fires on every selection change -- create
 *  forms pass the default no-op (read only at submit time); edit forms pass
 *  their own `apply` so a specId edit saves live like every other field. */
export function specIdRow(
  body: HTMLElement,
  deps: KnownSpecsSource,
  initial: string | null,
  onChange: () => void = () => {},
): SpecIdPickerHandle {
  const wrap = document.createElement("div");
  const picker = mountSpecIdPicker(wrap, onChange);
  picker.setSpecs(deps.knownSpecs());
  picker.setValue(initial);
  body.appendChild(fieldRow(t("graph.edit.specIdLabel"), wrap));
  return picker;
}

/** A LocalizedString field row: build the wrapper, append it via `fieldRow`,
 *  mount the multi-locale editor, and seed it -- the identical four-line dance
 *  every node/edge/flow form repeats for its label/name/object/trigger field.
 *  `onChange` fires on every edit (edit forms save live; create forms pass a
 *  no-op and read `getValue()` at submit). `initial` is `{}` for a create. */
export function localizedRow(
  body: HTMLElement,
  labelKey: MessageKey,
  initial: LocalizedString,
  locale: string,
  onChange: () => void = () => {},
): LocalizedEditorHandle {
  const wrap = document.createElement("div");
  body.appendChild(fieldRow(t(labelKey), wrap));
  const editor = mountLocalizedEditor(wrap, onChange);
  editor.setValue(initial, locale);
  return editor;
}

export function submitButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "edit-form-submit";
  btn.textContent = t("graph.edit.create");
  return btn;
}
