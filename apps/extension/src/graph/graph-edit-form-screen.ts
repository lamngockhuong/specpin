import type { LocalizedString } from "@specpin/spec-schema";
import { t } from "../i18n/index.js";
import {
  fieldRow,
  type KnownSpecsSource,
  resetForm,
  showFormError,
  specIdRow,
  submitButton,
  textInput,
} from "./graph-edit-form-shared.js";
import type { EditOpResult } from "./graph-edit-mode.js";
import { mountLocalizedEditor } from "./graph-localized-editor.js";

// Screen node fields (name/urlGlob/specId), split out of graph-edit-form.ts to
// hold that orchestrator under the plan's 200-line budget -- see its header
// comment for the create-vs-edit (submit vs live) rationale shared by every
// per-kind module.

export interface ScreenFieldValues {
  name: LocalizedString;
  urlGlob: string;
  specId: string | null;
}

export function showCreateScreen(
  container: HTMLElement,
  deps: KnownSpecsSource,
  onCreate: (id: string, values: ScreenFieldValues) => EditOpResult,
): void {
  const { body, errorEl } = resetForm(container, "graph.edit.titleNewScreen");
  const idInput = textInput("", t("graph.edit.idPlaceholder"));
  body.appendChild(fieldRow(t("graph.edit.idLabel"), idInput));
  const nameWrap = document.createElement("div");
  body.appendChild(fieldRow(t("graph.edit.fieldName"), nameWrap));
  const name = mountLocalizedEditor(nameWrap, () => {});
  name.setValue({}, deps.locale());
  const urlGlob = textInput("/", "/checkout/*");
  body.appendChild(fieldRow(t("graph.edit.urlGlobLabel"), urlGlob));
  const specId = specIdRow(body, deps, null);
  const btn = submitButton();
  body.appendChild(btn);
  btn.addEventListener("click", () => {
    const id = idInput.value.trim();
    if (!id || !name.isValid()) return showFormError(errorEl, t("graph.edit.localizedEmpty"));
    const result = onCreate(id, {
      name: name.getValue(),
      urlGlob: urlGlob.value.trim() || "/",
      specId: specId.getValue(),
    });
    showFormError(errorEl, result.ok ? undefined : result.error);
  });
}

export function showEditScreen(
  container: HTMLElement,
  deps: KnownSpecsSource,
  current: ScreenFieldValues,
  onChange: (values: ScreenFieldValues) => EditOpResult,
): void {
  const { body, errorEl } = resetForm(container, "graph.edit.titleEditScreen");
  const nameWrap = document.createElement("div");
  body.appendChild(fieldRow(t("graph.edit.fieldName"), nameWrap));
  const urlGlob = textInput(current.urlGlob);
  body.appendChild(fieldRow(t("graph.edit.urlGlobLabel"), urlGlob));
  function apply(): void {
    if (!name.isValid()) {
      showFormError(errorEl, t("graph.edit.localizedEmpty"));
      return;
    }
    const result = onChange({
      name: name.getValue(),
      urlGlob: urlGlob.value.trim() || "/",
      specId: specId.getValue(),
    });
    showFormError(errorEl, result.ok ? undefined : result.error);
  }
  const name = mountLocalizedEditor(nameWrap, apply);
  name.setValue(current.name, deps.locale());
  urlGlob.addEventListener("input", apply);
  const specId = specIdRow(body, deps, current.specId, apply);
}
