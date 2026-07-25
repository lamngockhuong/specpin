import type { FlowState } from "@specpin/spec-schema";
import { t } from "../i18n/index.js";
import {
  fieldRow,
  type KnownSpecsSource,
  kindSelect,
  resetForm,
  showFormError,
  specIdRow,
  submitButton,
  textInput,
} from "./graph-edit-form-shared.js";
import type { EditOpResult } from "./graph-edit-mode.js";
import { mountLocalizedEditor } from "./graph-localized-editor.js";

// FlowState node fields (label/kind/specId) -- the flows-side twin of
// graph-edit-form-screen.ts; see that file / graph-edit-form.ts for the
// shared create-vs-edit rationale.

export interface StateFieldValues {
  label: FlowState["label"];
  kind: FlowState["kind"];
  specId: string | null;
}

export function showCreateState(
  container: HTMLElement,
  deps: KnownSpecsSource,
  onCreate: (id: string, values: StateFieldValues) => EditOpResult,
): void {
  const { body, errorEl } = resetForm(container, "graph.edit.titleNewState");
  const idInput = textInput("", t("graph.edit.idPlaceholder"));
  body.appendChild(fieldRow(t("graph.edit.idLabel"), idInput));
  const labelWrap = document.createElement("div");
  body.appendChild(fieldRow(t("graph.edit.fieldLabel"), labelWrap));
  const label = mountLocalizedEditor(labelWrap, () => {});
  label.setValue({}, deps.locale());
  const kind = kindSelect(undefined);
  body.appendChild(fieldRow(t("graph.edit.kindLabel"), kind));
  const specId = specIdRow(body, deps, null);
  const btn = submitButton();
  body.appendChild(btn);
  btn.addEventListener("click", () => {
    const id = idInput.value.trim();
    if (!id || !label.isValid()) return showFormError(errorEl, t("graph.edit.localizedEmpty"));
    const result = onCreate(id, {
      label: label.getValue(),
      kind: (kind.value || undefined) as FlowState["kind"],
      specId: specId.getValue(),
    });
    showFormError(errorEl, result.ok ? undefined : result.error);
  });
}

export function showEditState(
  container: HTMLElement,
  deps: KnownSpecsSource,
  current: StateFieldValues,
  onChange: (values: StateFieldValues) => EditOpResult,
): void {
  const { body, errorEl } = resetForm(container, "graph.edit.titleEditState");
  const labelWrap = document.createElement("div");
  body.appendChild(fieldRow(t("graph.edit.fieldLabel"), labelWrap));
  const kind = kindSelect(current.kind);
  body.appendChild(fieldRow(t("graph.edit.kindLabel"), kind));
  function apply(): void {
    if (!label.isValid()) {
      showFormError(errorEl, t("graph.edit.localizedEmpty"));
      return;
    }
    const result = onChange({
      label: label.getValue(),
      kind: (kind.value || undefined) as FlowState["kind"],
      specId: specId.getValue(),
    });
    showFormError(errorEl, result.ok ? undefined : result.error);
  }
  const label = mountLocalizedEditor(labelWrap, apply);
  label.setValue(current.label, deps.locale());
  kind.addEventListener("change", apply);
  const specId = specIdRow(body, deps, current.specId, apply);
}
