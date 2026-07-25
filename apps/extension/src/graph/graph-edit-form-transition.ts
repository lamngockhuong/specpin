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

// Transition edge fields (trigger/guard/role/specId) -- the edge-side twin of
// graph-edit-form-screen.ts/-state.ts; see graph-edit-form.ts for the shared
// create-vs-edit rationale. Edit mode additionally guards on `editable`
// (false for a non-manual/owned transition, mirroring graph-edit-mode.ts's
// ownership rule): fields render but never call `onChange`.

export interface TransitionFieldValues {
  trigger: LocalizedString;
  guard: string | null;
  role: string | null;
  specId: string | null;
}

export function showCreateTransition(
  container: HTMLElement,
  deps: KnownSpecsSource,
  onCreate: (values: TransitionFieldValues) => EditOpResult,
): void {
  const { body, errorEl } = resetForm(container, "graph.edit.titleNewTransition");
  const triggerWrap = document.createElement("div");
  body.appendChild(fieldRow(t("graph.edit.fieldTrigger"), triggerWrap));
  const trigger = mountLocalizedEditor(triggerWrap, () => {});
  trigger.setValue({}, deps.locale());
  const guard = textInput("", "amount > 0");
  body.appendChild(fieldRow(t("graph.edit.guardLabel"), guard));
  const role = textInput("", "admin");
  body.appendChild(fieldRow(t("graph.edit.roleLabel"), role));
  const specId = specIdRow(body, deps, null);
  const btn = submitButton();
  body.appendChild(btn);
  btn.addEventListener("click", () => {
    if (!trigger.isValid()) return showFormError(errorEl, t("graph.edit.localizedEmpty"));
    const result = onCreate({
      trigger: trigger.getValue(),
      guard: guard.value.trim() || null,
      role: role.value.trim() || null,
      specId: specId.getValue(),
    });
    showFormError(errorEl, result.ok ? undefined : result.error);
  });
}

export function showEditTransition(
  container: HTMLElement,
  deps: KnownSpecsSource,
  current: TransitionFieldValues,
  editable: boolean,
  onChange: (values: TransitionFieldValues) => EditOpResult,
): void {
  const { body, errorEl } = resetForm(container, "graph.edit.titleEditTransition");
  if (!editable) {
    const notice = document.createElement("div");
    notice.className = "edit-form-notice";
    notice.textContent = t("graph.edit.notEditableOwned");
    body.appendChild(notice);
  }
  const triggerWrap = document.createElement("div");
  body.appendChild(fieldRow(t("graph.edit.fieldTrigger"), triggerWrap));
  const guard = textInput(current.guard ?? "");
  body.appendChild(fieldRow(t("graph.edit.guardLabel"), guard));
  const role = textInput(current.role ?? "");
  body.appendChild(fieldRow(t("graph.edit.roleLabel"), role));
  function apply(): void {
    if (!editable) return;
    if (!trigger.isValid()) {
      showFormError(errorEl, t("graph.edit.localizedEmpty"));
      return;
    }
    const result = onChange({
      trigger: trigger.getValue(),
      guard: guard.value.trim() || null,
      role: role.value.trim() || null,
      specId: specId.getValue(),
    });
    showFormError(errorEl, result.ok ? undefined : result.error);
  }
  const trigger = mountLocalizedEditor(triggerWrap, apply);
  trigger.setValue(current.trigger, deps.locale());
  guard.addEventListener("input", apply);
  role.addEventListener("input", apply);
  const specId = specIdRow(body, deps, current.specId, editable ? apply : undefined);
  specId.setDisabled(!editable);
  for (const el of [guard, role]) el.disabled = !editable;
}
