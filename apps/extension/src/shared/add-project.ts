import { type MessageKey, t } from "../i18n/index.js";
import { escapeAttr, escapeHtml } from "./html.js";
import { normalizeLocalUrl } from "./local-url.js";
import { type CreateLocalProjectResult, sendToBackground } from "./messaging.js";

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
): AddProjectHandle {
  container.innerHTML = template();
  container.hidden = true;

  const q = <T extends HTMLElement>(sel: string): T => {
    const el = container.querySelector<T>(sel);
    if (!el) throw new Error(`add-project: missing ${sel}`);
    return el;
  };
  const result = q<HTMLElement>("#ap-result");
  const localFields = q<HTMLElement>(".ap-local");
  const sidecarFields = q<HTMLElement>(".ap-sidecar");

  function setResult(ok: boolean, text: string): void {
    result.className = ok ? "ok" : "err";
    result.textContent = text;
  }

  function selectedKind(): "local" | "sidecar" {
    const checked = container.querySelector<HTMLInputElement>('input[name="ap-kind"]:checked');
    return checked?.value === "sidecar" ? "sidecar" : "local";
  }

  for (const radio of container.querySelectorAll<HTMLInputElement>('input[name="ap-kind"]')) {
    radio.addEventListener("change", () => {
      const kind = selectedKind();
      localFields.hidden = kind !== "local";
      sidecarFields.hidden = kind !== "sidecar";
      setResult(true, "");
    });
  }

  q<HTMLButtonElement>("#ap-cancel").addEventListener("click", () => {
    container.hidden = true;
  });

  async function submitLocal(): Promise<void> {
    const project = q<HTMLInputElement>("#ap-project").value.trim();
    if (!project) {
      setResult(false, t("addProject.projectRequired"));
      return;
    }
    const res = await sendToBackground<CreateLocalProjectResult>({
      type: "CREATE_LOCAL_PROJECT",
      project,
      domains: parseDomains(q<HTMLInputElement>("#ap-domains").value),
      applyToAllSites: q<HTMLInputElement>("#ap-all").checked,
    });
    if (!res.ok) {
      setResult(false, res.error ?? t("addProject.couldNotCreate"));
      return;
    }
    q<HTMLInputElement>("#ap-project").value = "";
    q<HTMLInputElement>("#ap-domains").value = "";
    q<HTMLInputElement>("#ap-all").checked = false;
    container.hidden = true;
    await onCreated();
  }

  async function submitSidecar(): Promise<void> {
    const { url, valid } = normalizeLocalUrl(q<HTMLInputElement>("#ap-url").value);
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
      label: q<HTMLInputElement>("#ap-label").value.trim() || undefined,
    });
    // Never keep the secret in the DOM once submitted (RT-SA6).
    tokenEl.value = "";
    if (!res.ok) {
      setResult(false, res.error ?? t("addProject.couldNotConnect"));
      return;
    }
    q<HTMLInputElement>("#ap-url").value = "";
    q<HTMLInputElement>("#ap-label").value = "";
    container.hidden = true;
    await onCreated();
  }

  q<HTMLButtonElement>("#ap-create").addEventListener("click", () => {
    void (selectedKind() === "local" ? submitLocal() : submitSidecar());
  });

  return {
    toggle(): void {
      container.hidden = !container.hidden;
    },
    hide(): void {
      container.hidden = true;
    },
  };
}
