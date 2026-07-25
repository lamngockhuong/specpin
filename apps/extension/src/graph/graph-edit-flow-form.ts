import type { LocalizedString } from "@specpin/spec-schema";
import { t } from "../i18n/index.js";
import {
  fieldRow,
  resetForm,
  showFormError,
  submitButton,
  textInput,
} from "./graph-edit-form-shared.js";
import { mountLocalizedEditor } from "./graph-localized-editor.js";

// The whole-Flow lifecycle mini-forms (Track C, C2): "New flow" (id + object)
// and "Rename flow" (object only), the create-from-scratch counterpart to
// graph-edit-form-*.ts's node/edge fields. Both submits are async (a network
// round trip via graph-edit-flow-save.ts), so the submit button disables
// while in flight rather than applying live like a field edit.

export interface FlowActionOutcome {
  ok: boolean;
  error?: string;
}

export function showCreateFlow(
  container: HTMLElement,
  locale: string,
  onCreate: (id: string, object: LocalizedString) => Promise<FlowActionOutcome>,
): void {
  const { body, errorEl } = resetForm(container, "graph.edit.titleNewFlow");
  const idInput = textInput("", t("graph.edit.idPlaceholder"));
  body.appendChild(fieldRow(t("graph.edit.idLabel"), idInput));
  const objectWrap = document.createElement("div");
  body.appendChild(fieldRow(t("graph.edit.fieldObject"), objectWrap));
  const object = mountLocalizedEditor(objectWrap, () => {});
  object.setValue({}, locale);
  const btn = submitButton();
  btn.textContent = t("graph.edit.newFlow");
  body.appendChild(btn);
  btn.addEventListener("click", () => {
    void (async () => {
      const id = idInput.value.trim();
      if (!id || !object.isValid()) return showFormError(errorEl, t("graph.edit.localizedEmpty"));
      btn.disabled = true;
      const result = await onCreate(id, object.getValue());
      btn.disabled = false;
      showFormError(errorEl, result.ok ? undefined : result.error);
    })();
  });
}

export function showRenameFlow(
  container: HTMLElement,
  locale: string,
  currentObject: LocalizedString,
  onRename: (object: LocalizedString) => Promise<FlowActionOutcome>,
): void {
  const { body, errorEl } = resetForm(container, "graph.edit.titleRenameFlow");
  const objectWrap = document.createElement("div");
  body.appendChild(fieldRow(t("graph.edit.fieldObject"), objectWrap));
  const object = mountLocalizedEditor(objectWrap, () => {});
  object.setValue(currentObject, locale);
  const btn = submitButton();
  btn.textContent = t("graph.edit.rename");
  body.appendChild(btn);
  btn.addEventListener("click", () => {
    void (async () => {
      if (!object.isValid()) return showFormError(errorEl, t("graph.edit.localizedEmpty"));
      btn.disabled = true;
      const result = await onRename(object.getValue());
      btn.disabled = false;
      showFormError(errorEl, result.ok ? undefined : result.error);
    })();
  });
}
