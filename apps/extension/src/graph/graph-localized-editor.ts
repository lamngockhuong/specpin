import type { LocalizedString } from "@specpin/spec-schema";
import { t } from "../i18n/index.js";
import { promptDialog } from "../shared/dialog.js";

// The multi-locale text editor for LocalizedString fields (label/name/object/
// trigger), shared by graph-edit-form.ts (node/edge fields) and
// graph-edit-flow-form.ts (a flow's `object`). One row per locale key, an "add
// locale" affordance (the same modal promptDialog + BCP-47 pattern
// content/capture-form.ts already uses for the capture form's language tabs --
// reused rather than re-invented), and inline "at least one non-empty entry"
// validation (LocalizedString has schema minProperties 1). CSP-safe: every
// node is built with createElement + textContent/value, never innerHTML.

const LOCALE_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export interface LocalizedEditorHandle {
  /** The current non-empty entries only (schema-shape ready). */
  getValue(): LocalizedString;
  /** False when every row is empty (schema minProperties 1 would reject it). */
  isValid(): boolean;
  /** Replace the rows: one per key in `value`, plus `seedLocale` if absent
   *  (so the panel's current locale is always editable even for a brand-new
   *  field with no existing entries). */
  setValue(value: LocalizedString, seedLocale: string): void;
}

/** Mount a LocalizedString row editor into `container`. `onChange` fires after
 *  every edit (row text, add, or remove) so the caller can re-validate/re-save
 *  live, per graph-edit-form.ts's edit-mode contract. */
export function mountLocalizedEditor(
  container: HTMLElement,
  onChange: () => void,
): LocalizedEditorHandle {
  const rowsEl = document.createElement("div");
  rowsEl.className = "edit-form-locale-rows";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "edit-form-add-locale";
  addBtn.textContent = t("graph.edit.addLocale");
  const errorEl = document.createElement("div");
  errorEl.className = "edit-form-field-error";
  errorEl.textContent = t("graph.edit.localizedEmpty");
  errorEl.hidden = true;

  let rows: { locale: string; input: HTMLInputElement }[] = [];

  function currentValue(): LocalizedString {
    const value: LocalizedString = {};
    for (const row of rows) {
      const v = row.input.value.trim();
      if (v) value[row.locale] = v;
    }
    return value;
  }

  function refreshError(): void {
    errorEl.hidden = Object.keys(currentValue()).length > 0;
  }

  function addRow(locale: string, initial: string): void {
    if (rows.some((r) => r.locale === locale)) return;
    const row = document.createElement("div");
    row.className = "edit-form-locale-row";
    const label = document.createElement("span");
    label.className = "edit-form-locale-label";
    label.textContent = locale;
    const input = document.createElement("input");
    input.type = "text";
    input.value = initial;
    input.addEventListener("input", () => {
      refreshError();
      onChange();
    });
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "edit-form-remove-locale";
    removeBtn.textContent = "×";
    removeBtn.title = t("graph.edit.removeLocale");
    removeBtn.addEventListener("click", () => {
      rowsEl.removeChild(row);
      rows = rows.filter((r) => r.locale !== locale);
      refreshError();
      onChange();
    });
    row.append(label, input, removeBtn);
    rowsEl.appendChild(row);
    rows.push({ locale, input });
  }

  addBtn.addEventListener("click", () => {
    void (async () => {
      const code = await promptDialog({
        message: t("capture.addLanguagePrompt"),
        placeholder: "vi",
      });
      if (!code) return;
      if (!LOCALE_PATTERN.test(code)) return;
      addRow(code, "");
      refreshError();
      onChange();
    })();
  });

  container.append(rowsEl, addBtn, errorEl);

  return {
    getValue: currentValue,
    isValid: () => Object.keys(currentValue()).length > 0,
    setValue(value, seedLocale) {
      rowsEl.replaceChildren();
      rows = [];
      const locales = new Set([...Object.keys(value), seedLocale]);
      for (const locale of locales) addRow(locale, value[locale] ?? "");
      refreshError();
    },
  };
}
