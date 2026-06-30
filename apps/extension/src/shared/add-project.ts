import { type MessageKey, t } from "../i18n/index.js";
import { clearDraft, loadDraft, saveDraft } from "./draft-store.js";
import { escapeAttr, escapeHtml } from "./html.js";
import { normalizeLocalUrl } from "./local-url.js";
import { type CreateLocalProjectResult, sendToBackground } from "./messaging.js";

// Stashed "+ New project" input, so a popup dismissed mid-entry restores it on
// reopen. The password token is deliberately excluded (RT-SA6: the secret never
// outlives submission, and a draft store is persisted state). The key is scoped
// per surface (popup vs side panel) so the two surfaces keep independent drafts.
const DRAFT_KEY_PREFIX = "add-project";
interface AddProjectDraft {
  open: boolean;
  kind: "local" | "sidecar";
  project: string;
  domains: string;
  applyAll: boolean;
  url: string;
  label: string;
}

// The shared "+ New project" inline form, mounted by both the popup and the side
// panel into a layout-agnostic #add-project container. Two modes: a local
// (Manual) project created via CREATE_LOCAL_PROJECT, or a sidecar connection via
// ADD_CONNECTION (same path as the Options page). Built once; the host wires a
// toggle button and passes an onCreated callback to refresh the project list.

export interface AddProjectHandle {
  /** Toggle the inline panel open/closed. */
  toggle(): void;
  /** Force the panel hidden (e.g. when Specpin is disabled). */
  hide(): void;
}

/** A capture-target kind switch + the two field sets. No user data is ever
 *  interpolated into this template (only our own translated labels, escaped),
 *  so it is injection-safe on an extension page. */
function template(): string {
  const ph = (key: MessageKey) => escapeAttr(t(key));
  const lbl = (key: MessageKey) => escapeHtml(t(key));
  return `
    <div class="ap-panel">
      <div class="ap-modes">
        <label><input type="radio" name="ap-kind" value="local" checked /> ${lbl("addProject.modeLocal")}</label>
        <label><input type="radio" name="ap-kind" value="sidecar" /> ${lbl("addProject.modeSidecar")}</label>
      </div>
      <div class="ap-fields ap-local">
        <input type="text" id="ap-project" placeholder="${ph("addProject.projectPlaceholder")}" />
        <input type="text" id="ap-domains" placeholder="${ph("addProject.domainsPlaceholder")}" />
        <label class="ap-check"><input type="checkbox" id="ap-all" /> ${lbl("addProject.applyAllSites")}</label>
        <div class="ap-hint">${lbl("addProject.applyAllHint")}</div>
      </div>
      <div class="ap-fields ap-sidecar" hidden>
        <input type="text" id="ap-url" placeholder="${ph("addProject.urlPlaceholder")}" />
        <input type="text" id="ap-label" placeholder="${ph("addProject.labelPlaceholder")}" />
        <input type="password" id="ap-token" placeholder="${ph("addProject.tokenPlaceholder")}" />
      </div>
      <div class="ap-actions">
        <button type="button" id="ap-create">${lbl("addProject.create")}</button>
        <button type="button" id="ap-cancel">${lbl("addProject.cancel")}</button>
      </div>
      <div id="ap-result"></div>
    </div>`;
}

/** Comma/space-separated domain list -> trimmed non-empty entries. Shared with
 *  the Options rename form so the parse rule cannot drift. */
export function parseDomains(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((d) => d.trim())
    .filter(Boolean);
}

export function mountAddProject(
  container: HTMLElement,
  onCreated: () => void | Promise<void>,
  surface: string,
): AddProjectHandle {
  container.innerHTML = template();
  container.hidden = true;
  const draftKey = `${DRAFT_KEY_PREFIX}:${surface}`;

  const q = <T extends HTMLElement>(sel: string): T => {
    const el = container.querySelector<T>(sel);
    if (!el) throw new Error(`add-project: missing ${sel}`);
    return el;
  };
  const result = q<HTMLElement>("#ap-result");
  const localFields = q<HTMLElement>(".ap-local");
  const sidecarFields = q<HTMLElement>(".ap-sidecar");
  // The persisted form fields, queried once (persist() reads them on every
  // keystroke). The token input is deliberately absent — it is never stashed
  // (RT-SA6), so it stays a one-off `q()` lookup in submitSidecar.
  const fields = {
    project: q<HTMLInputElement>("#ap-project"),
    domains: q<HTMLInputElement>("#ap-domains"),
    all: q<HTMLInputElement>("#ap-all"),
    url: q<HTMLInputElement>("#ap-url"),
    label: q<HTMLInputElement>("#ap-label"),
  };

  function setResult(ok: boolean, text: string): void {
    result.className = ok ? "ok" : "err";
    result.textContent = text;
  }

  function selectedKind(): "local" | "sidecar" {
    const checked = container.querySelector<HTMLInputElement>('input[name="ap-kind"]:checked');
    return checked?.value === "sidecar" ? "sidecar" : "local";
  }

  // Show the field set for the selected capture kind. Shared by the radio change
  // handler and draft restore so the two cannot drift.
  function setFieldVisibility(kind: "local" | "sidecar"): void {
    localFields.hidden = kind !== "local";
    sidecarFields.hidden = kind !== "sidecar";
  }

  // Stash the current input (sans token) on every edit and on open/close, so a
  // popup dismissed mid-entry restores it next time. Gated on `ready` so an early
  // host hide()/update() (e.g. Specpin disabled) cannot overwrite the stored
  // draft with empty fields before the async restore below has applied it.
  let ready = false;
  function persist(): void {
    if (!ready) return;
    void saveDraft(draftKey, {
      open: !container.hidden,
      kind: selectedKind(),
      project: fields.project.value,
      domains: fields.domains.value,
      applyAll: fields.all.checked,
      url: fields.url.value,
      label: fields.label.value,
    } satisfies AddProjectDraft);
  }
  // Setting .value/.checked here fires no input/change events, so restore never
  // re-triggers persist(). The disabled-state invariant is re-enforced by the
  // host's next update()/hide(), so auto-opening a stashed panel is safe.
  void loadDraft<AddProjectDraft>(draftKey).then((draft) => {
    if (draft) {
      const kind = draft.kind === "sidecar" ? "sidecar" : "local";
      const radio = container.querySelector<HTMLInputElement>(
        `input[name="ap-kind"][value="${kind}"]`,
      );
      if (radio) radio.checked = true;
      setFieldVisibility(kind);
      fields.project.value = draft.project ?? "";
      fields.domains.value = draft.domains ?? "";
      fields.all.checked = !!draft.applyAll;
      fields.url.value = draft.url ?? "";
      fields.label.value = draft.label ?? "";
      if (draft.open) container.hidden = false;
    }
    ready = true;
  });

  for (const radio of container.querySelectorAll<HTMLInputElement>('input[name="ap-kind"]')) {
    radio.addEventListener("change", () => {
      setFieldVisibility(selectedKind());
      setResult(true, "");
      persist();
    });
  }
  // Persist as the user types each field (the token field is intentionally not
  // wired, so the secret is never written to storage).
  for (const el of [fields.project, fields.domains, fields.url, fields.label]) {
    el.addEventListener("input", persist);
  }
  fields.all.addEventListener("change", persist);

  q<HTMLButtonElement>("#ap-cancel").addEventListener("click", () => {
    container.hidden = true;
    // Cancel is an explicit discard: drop the stash so a dismissed popup does not
    // resurrect it.
    void clearDraft(draftKey);
  });

  async function submitLocal(): Promise<void> {
    const project = fields.project.value.trim();
    if (!project) {
      setResult(false, t("addProject.projectRequired"));
      return;
    }
    const res = await sendToBackground<CreateLocalProjectResult>({
      type: "CREATE_LOCAL_PROJECT",
      project,
      domains: parseDomains(fields.domains.value),
      applyToAllSites: fields.all.checked,
    });
    if (!res.ok) {
      setResult(false, res.error ?? t("addProject.couldNotCreate"));
      return;
    }
    fields.project.value = "";
    fields.domains.value = "";
    fields.all.checked = false;
    container.hidden = true;
    void clearDraft(draftKey);
    await onCreated();
  }

  async function submitSidecar(): Promise<void> {
    const { url, valid } = normalizeLocalUrl(fields.url.value);
    const tokenEl = q<HTMLInputElement>("#ap-token");
    const tok = tokenEl.value.trim();
    if (!url || !tok) {
      setResult(false, t("addProject.urlTokenRequired"));
      return;
    }
    if (!valid) {
      setResult(false, t("addProject.urlError"));
      return;
    }
    const res = await sendToBackground<{ ok: boolean; project?: string | null; error?: string }>({
      type: "ADD_CONNECTION",
      baseUrl: url,
      token: tok,
      label: fields.label.value.trim() || undefined,
    });
    // Never keep the secret in the DOM once submitted (RT-SA6).
    tokenEl.value = "";
    if (!res.ok) {
      setResult(false, res.error ?? t("addProject.couldNotConnect"));
      return;
    }
    fields.url.value = "";
    fields.label.value = "";
    container.hidden = true;
    void clearDraft(draftKey);
    await onCreated();
  }

  q<HTMLButtonElement>("#ap-create").addEventListener("click", () => {
    void (selectedKind() === "local" ? submitLocal() : submitSidecar());
  });

  return {
    toggle(): void {
      container.hidden = !container.hidden;
      // Record the open/closed state so a dismissed popup reopens it the same way.
      persist();
    },
    hide(): void {
      container.hidden = true;
      persist();
    },
  };
}
