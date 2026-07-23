import { t } from "../i18n/index.js";
import { clearDraft, loadDraft, saveDraft } from "./draft-store.js";
import { ensureRemotePermission } from "./host-permission.js";
import { setTrustedHtml } from "./html.js";
import { normalizeSidecarUrl } from "./local-url.js";
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

/** A capture-target kind switch + the two field sets. Labels/placeholders carry
 *  `data-i18n*` keys (with English fallback text) rather than baked-in `t()` calls:
 *  this panel is mounted at module load, BEFORE each surface runs initI18n(), so a
 *  `t()` here would freeze the startup-default English. The surface's
 *  hydrateI18n(document) (run after initI18n and on every UI-locale change)
 *  translates these nodes in place. No user data is interpolated, so the static
 *  template is injection-safe on an extension page. */
function template(): string {
  return `
    <div class="ap-panel">
      <div class="ap-modes">
        <label><input type="radio" name="ap-kind" value="local" checked /> <span data-i18n="addProject.modeLocal">Local project</span></label>
        <label><input type="radio" name="ap-kind" value="sidecar" /> <span data-i18n="addProject.modeSidecar">Sidecar</span></label>
      </div>
      <div class="ap-fields ap-local">
        <input type="text" id="ap-project" data-i18n-placeholder="addProject.projectPlaceholder" placeholder="Project name" />
        <input type="text" id="ap-domains" data-i18n-placeholder="addProject.domainsPlaceholder" placeholder="Domains (optional, comma-separated)" />
        <label class="ap-check"><input type="checkbox" id="ap-all" /> <span data-i18n="addProject.applyAllSites">Apply to all sites</span></label>
        <div class="ap-hint" data-i18n="addProject.applyAllHint">Without domains or this, the project serves no page.</div>
      </div>
      <div class="ap-fields ap-sidecar" hidden>
        <input type="text" id="ap-url" data-i18n-placeholder="addProject.urlPlaceholder" placeholder="http://127.0.0.1:PORT" />
        <input type="text" id="ap-label" data-i18n-placeholder="addProject.labelPlaceholder" placeholder="Label (optional)" />
        <input type="password" id="ap-token" data-i18n-placeholder="addProject.tokenPlaceholder" placeholder="Token" />
      </div>
      <div class="ap-actions">
        <button type="button" id="ap-create" data-i18n="addProject.create">Create</button>
        <button type="button" id="ap-cancel" data-i18n="addProject.cancel">Cancel</button>
      </div>
      <div id="ap-result"></div>
    </div>`;
}

/** A single entry -> a bare host (the shape `originMatchesDomains` compares
 *  against). Users paste whole URLs into the domains field; matching keys off the
 *  page's `host`, so a stored `https://app.example.com/path` never matches and the
 *  project silently serves nothing. Strip an entry down to its host: parse it as a
 *  URL (prepending a scheme when absent, so a bare host / host:port also parses),
 *  keep `host` (port included, to mirror the origin host), and lowercase. Anything
 *  that cannot yield a host (e.g. contains a space) returns "" and is dropped. */
export function normalizeDomain(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(candidate).host.toLowerCase();
  } catch {
    return "";
  }
}

/** Comma/space-separated domain list -> normalized, de-duplicated bare hosts.
 *  Shared with the Options rename form so the parse rule cannot drift. */
export function parseDomains(raw: string): string[] {
  const hosts = raw
    .split(/[\s,]+/)
    .map(normalizeDomain)
    .filter(Boolean);
  return [...new Set(hosts)];
}

export function mountAddProject(
  container: HTMLElement,
  onCreated: () => void | Promise<void>,
  surface: string,
): AddProjectHandle {
  setTrustedHtml(container, template());
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
    const { url, valid, isRemote } = normalizeSidecarUrl(fields.url.value);
    const tokenEl = q<HTMLInputElement>("#ap-token");
    const tok = tokenEl.value.trim();
    if (!url || !tok) {
      setResult(false, t("addProject.urlTokenRequired"));
      return;
    }
    if (!valid) {
      setResult(false, t(isRemote ? "addProject.urlErrorRemoteHttps" : "addProject.urlError"));
      return;
    }
    // Remote origins are NOT in the declared host_permissions; grant the optional
    // permission within this gesture (no await before this point) before connecting.
    // On denial: clear the secret from the DOM (RT-SA6) and surface the message.
    const granted = await ensureRemotePermission(url, isRemote, () => {
      tokenEl.value = "";
      setResult(false, t("addProject.permissionDenied"));
    });
    if (!granted) return;
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
