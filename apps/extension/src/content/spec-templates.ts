// Built-in spec templates: a small fixed set of common patterns (form validation,
// API error, auth flow) that prefill the capture + bulk forms. No persistence, no
// schema — pure static data in the bundle. Template bodies are i18n *keys* (not
// literal strings) so `t()` resolves them in the active UI locale, and the parity
// hook keeps every locale in step.
import type { SpecStatus } from "@specpin/spec-schema";
import type { MessageKey } from "../i18n/index.js";

/** One built-in template. `tags`/`status` are literal defaults; `ruleKeys` and
 *  `labelKey` are i18n message keys resolved per locale at apply time. */
export interface SpecTemplate {
  id: string;
  labelKey: MessageKey;
  tags: string[];
  status: SpecStatus | null;
  ruleKeys: MessageKey[];
}

/** The fixed template set. Deliberately small — templates are a velocity nudge,
 *  not a taxonomy; a team that needs more authors them as regular specs. */
export const SPEC_TEMPLATES: SpecTemplate[] = [
  {
    id: "form-validation",
    labelKey: "template.formValidation.label",
    tags: ["validation"],
    status: "draft",
    ruleKeys: ["template.formValidation.rule1", "template.formValidation.rule2"],
  },
  {
    id: "api-error",
    labelKey: "template.apiError.label",
    tags: ["error-handling"],
    status: "draft",
    ruleKeys: ["template.apiError.rule1", "template.apiError.rule2"],
  },
  {
    id: "auth-flow",
    labelKey: "template.authFlow.label",
    tags: ["auth"],
    status: "draft",
    ruleKeys: ["template.authFlow.rule1", "template.authFlow.rule2"],
  },
];

/** The subset of form fields a template can prefill. Both the capture form and
 *  the bulk form map their controls onto this shape. */
export interface TemplateFields {
  tags: string[];
  businessRules: string[];
  status: SpecStatus | null;
}

/** Apply a template with FILL-EMPTY semantics: only fields the user has left empty
 *  are populated — user-entered text is never overwritten (no confirm dialog
 *  needed). An unknown id is a no-op. `translate` resolves the localized rule
 *  bodies (pass `t`), so the result matches the active UI locale. Pure + testable. */
export function applyTemplate(
  current: TemplateFields,
  templateId: string,
  translate: (key: MessageKey) => string,
): TemplateFields {
  const tpl = SPEC_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return current;
  const hasRules = current.businessRules.some((r) => r.trim() !== "");
  return {
    tags: current.tags.length > 0 ? current.tags : [...tpl.tags],
    businessRules: hasRules ? current.businessRules : tpl.ruleKeys.map(translate),
    status: current.status ?? tpl.status,
  };
}

/** The three form controls a template prefills. */
export interface TemplateControls {
  tags: HTMLInputElement;
  rules: HTMLTextAreaElement;
  status: HTMLSelectElement;
}

/** Wire a template `<select>` to fill the given controls with fill-empty
 *  semantics on change. Shared by the capture form and the bulk form so the
 *  read → applyTemplate → write-back round-trip lives in one place. */
export function wireTemplateSelect(
  select: HTMLSelectElement | null,
  controls: TemplateControls,
  translate: (key: MessageKey) => string,
): void {
  select?.addEventListener("change", (e) => {
    const id = (e.target as HTMLSelectElement).value;
    if (!id) return;
    const applied = applyTemplate(
      {
        tags: controls.tags.value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        businessRules: controls.rules.value.split("\n").filter((s) => s.trim() !== ""),
        status: (controls.status.value || null) as SpecStatus | null,
      },
      id,
      translate,
    );
    controls.tags.value = applied.tags.join(", ");
    if (applied.businessRules.length) controls.rules.value = applied.businessRules.join("\n");
    controls.status.value = applied.status ?? "";
  });
}
