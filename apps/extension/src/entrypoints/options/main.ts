import type { SpecsResponse, ViewsConfig } from "@specpin/api-client";
import { hydrateI18n, initI18n, resolveUiLocale, t, type UiLocale } from "../../i18n/index.js";
import {
  type DefaultSurface,
  getDefaultSurface,
  getTheme,
  getUiLocale,
  setDefaultSurface,
  setTheme,
  setUiLocale,
  type Theme,
} from "../../shared/config.js";
import {
  type AddLocalBatchResult,
  broadcastToTabs,
  type ConnectionStatus,
  type ManualBatchSummary,
  type StatusResult,
  sendToBackground,
} from "../../shared/messaging.js";
import { applyTheme, watchThemeChanges } from "../../shared/theme.js";
import { parseLocalBundle, parseLocalFiles } from "../../sources/local-bundle.js";
import "../../shared/tokens.gen.css";
import "../../shared/switch.css";

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
};

const baseUrl = byId("baseUrl") as HTMLInputElement;
const label = byId("label") as HTMLInputElement;
const token = byId("token") as HTMLInputElement;
const applyAll = byId("applyAll") as HTMLInputElement;
const addResult = byId("addResult");
const connections = byId("connections");
const localSpecs = byId("localSpecs") as HTMLTextAreaElement;
const localFiles = byId("localFiles") as HTMLInputElement;
const localResult = byId("localResult");
const localBatches = byId("localBatches");
const surface = byId("surface") as HTMLSelectElement;
const theme = byId("theme") as HTMLSelectElement;
const uiLocale = byId("uiLocale") as HTMLSelectElement;

// The sidecar binds localhost only; reject anything else before sending.
const LOCAL_URL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

/** Normalize a sidecar URL (trim + drop trailing slashes) and validate the
 *  localhost-only rule. Returns the normalized URL plus an error message when a
 *  non-empty URL fails that rule. The empty-input case is left to each caller's
 *  required-field check (add needs a token too; edit keeps the stored token). */
function normalizeLocalUrl(raw: string): { url: string; error: string | null } {
  const url = raw.trim().replace(/\/+$/, "");
  const error = url && !LOCAL_URL.test(url) ? t("options.urlError") : null;
  return { url, error };
}

function showResult(target: HTMLElement, ok: boolean, text: string): void {
  target.className = ok ? "ok" : "err";
  target.textContent = text;
}

/** Build one connection row with DOM nodes (no innerHTML) so project/label/
 *  domain values are never an injection sink. The token is never rendered. */
function connectionRow(c: ConnectionStatus): HTMLElement {
  const row = document.createElement("div");
  row.className = c.enabled ? "conn" : "conn conn-disabled";

  const head = document.createElement("div");
  head.className = "conn-head";
  const title = document.createElement("div");
  title.className = "conn-title";
  const dot = document.createElement("span");
  dot.className = `dot ${c.connected ? "ok" : c.error ? "err" : ""}`;
  const name = document.createElement("span");
  name.textContent = c.label || c.project || c.baseUrl;
  title.append(dot, name);

  const actions = document.createElement("div");
  actions.className = "conn-actions";

  // Per-project on/off. Disabling stops this project's watch and removes its
  // specs from every page; the row stays so it can be re-enabled.
  const toggle = document.createElement("label");
  toggle.className = "conn-toggle";
  toggle.title = c.enabled ? t("options.disableProject") : t("options.enableProject");
  const toggleBox = document.createElement("input");
  toggleBox.type = "checkbox";
  // Styled as a track+knob switch, matching the popup's on/off control.
  toggleBox.className = "switch";
  toggleBox.checked = c.enabled;
  toggleBox.addEventListener("change", async () => {
    await sendToBackground({ type: "UPDATE_CONNECTION", id: c.id, enabled: toggleBox.checked });
    await refresh();
  });
  // Label tracks the switch state so it never contradicts the knob position.
  toggle.append(
    document.createTextNode(c.enabled ? t("options.enabled") : t("options.disabled")),
    toggleBox,
  );
  actions.append(toggle);
  const edit = document.createElement("button");
  edit.className = "secondary";
  edit.textContent = t("common.edit");
  const reconnect = document.createElement("button");
  reconnect.className = "secondary";
  reconnect.textContent = t("options.reconnect");
  reconnect.addEventListener("click", async () => {
    await sendToBackground({ type: "RECONNECT", id: c.id });
    await refresh();
  });
  const remove = document.createElement("button");
  remove.className = "secondary";
  remove.textContent = t("options.remove");
  remove.addEventListener("click", async () => {
    await sendToBackground({ type: "REMOVE_CONNECTION", id: c.id });
    await refresh();
  });
  actions.append(edit, reconnect, remove);
  head.append(title, actions);

  const meta = document.createElement("div");
  meta.className = "conn-meta";
  const errorText = `${t("options.error", { error: c.error ?? "" })}${
    c.errorDetail ? ` (${c.errorDetail})` : ""
  }`;
  const liveState = c.connected
    ? t("options.connected")
    : c.error
      ? errorText
      : t("options.disconnected");
  // A disabled project serves no page regardless of reachability, so say so first.
  const state = c.enabled ? liveState : t("options.disabledState", { state: liveState });
  const domains = c.domains.length ? c.domains.join(", ") : t("options.noDomains");
  meta.textContent = `${c.baseUrl} · ${state} · ${t("options.specCount", {
    count: c.specCount,
  })} · ${domains}`;

  // Inline edit form, toggled by the Edit button. Hidden until first opened.
  const editForm = editSection(c);
  edit.addEventListener("click", () => {
    editForm.hidden = !editForm.hidden;
  });

  row.append(head, meta, editForm);

  // Team-default visibility editor (sidecar-backed connections only). Writes
  // .specs/views.json to Git, shared with everyone on the project.
  if (c.connected) row.append(teamViewsSection(c));

  // Empty-domains projects are inactive until the user opts in (RT-SA1).
  if (c.domains.length === 0) {
    const warn = document.createElement("div");
    warn.className = "warn";
    const text = document.createElement("div");
    text.textContent = c.matchesAllSites ? t("options.warnAllSites") : t("options.warnInactive");
    const optLabel = document.createElement("label");
    optLabel.className = "inline";
    const opt = document.createElement("input");
    opt.type = "checkbox";
    opt.checked = c.matchesAllSites;
    opt.addEventListener("change", async () => {
      await sendToBackground({
        type: "UPDATE_CONNECTION",
        id: c.id,
        applyToAllSites: opt.checked,
      });
      await refresh();
    });
    optLabel.append(opt, document.createTextNode(` ${t("options.applyToAllSites")}`));
    warn.append(text, optLabel);
    row.append(warn);
  }

  return row;
}

/** Inline edit form for one connection: change the sidecar URL, label, and
 *  (optionally) the bearer token. The token field starts empty and a blank value
 *  keeps the stored secret (RT-SA6: the current token is never rendered back).
 *  Saving re-validates the connection and reports the result like adding does;
 *  on success the list refreshes (which collapses the form). */
function editSection(c: ConnectionStatus): HTMLElement {
  const form = document.createElement("div");
  form.className = "conn-edit";
  form.hidden = true;

  const urlLabel = document.createElement("label");
  urlLabel.textContent = t("options.sidecarUrl");
  const url = document.createElement("input");
  url.type = "text";
  url.value = c.baseUrl;

  const labelLabel = document.createElement("label");
  labelLabel.textContent = t("options.labelOptional");
  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.value = c.label ?? "";

  const tokenLabel = document.createElement("label");
  tokenLabel.textContent = t("options.token");
  const tokenInput = document.createElement("input");
  tokenInput.type = "password";
  tokenInput.autocomplete = "off";
  tokenInput.placeholder = t("options.tokenKeepPlaceholder");

  const actions = document.createElement("div");
  actions.className = "conn-actions";
  const save = document.createElement("button");
  save.className = "secondary";
  save.textContent = t("options.saveChanges");
  const cancel = document.createElement("button");
  cancel.className = "secondary";
  cancel.textContent = t("common.cancel");
  actions.append(save, cancel);

  const result = document.createElement("div");

  cancel.addEventListener("click", () => {
    tokenInput.value = "";
    result.textContent = "";
    result.className = "";
    form.hidden = true;
  });

  save.addEventListener("click", async () => {
    const { url: nextUrl, error } = normalizeLocalUrl(url.value);
    if (!nextUrl) {
      showResult(result, false, t("options.urlRequired"));
      return;
    }
    if (error) {
      showResult(result, false, error);
      return;
    }
    const tok = tokenInput.value.trim();
    const res = await sendToBackground<{ ok: boolean; project?: string | null; error?: string }>({
      type: "UPDATE_CONNECTION",
      id: c.id,
      baseUrl: nextUrl,
      label: labelInput.value.trim(),
      // Omit the token when blank so the background keeps the stored secret.
      ...(tok ? { token: tok } : {}),
    });
    // Never keep the secret in the field once submitted.
    tokenInput.value = "";
    if (res.ok) {
      await refresh();
    } else {
      showResult(
        result,
        false,
        t("options.couldNotConnect", { error: res.error ?? "unknown error" }),
      );
    }
  });

  form.append(urlLabel, url, labelLabel, labelInput, tokenLabel, tokenInput, actions, result);
  return form;
}

/** Team-default visibility editor for one connection. The hidden facet keys are
 *  edited as one-per-line text (tag: / file: / spec: / url:) and saved to
 *  .specs/views.json via the sidecar. The current views load lazily on expand. */
function teamViewsSection(c: ConnectionStatus): HTMLElement {
  const wrap = document.createElement("details");
  wrap.className = "team-views";
  const summary = document.createElement("summary");
  summary.textContent = t("options.teamViewsSummary");
  wrap.appendChild(summary);

  const note = document.createElement("p");
  note.className = "muted";
  note.textContent = t("options.teamViewsNote");
  const area = document.createElement("textarea");
  area.className = "views-editor";
  area.rows = 4;
  area.placeholder = "tag:internal\nurl:/admin/**";
  const actions = document.createElement("div");
  actions.className = "conn-actions";
  const save = document.createElement("button");
  save.className = "secondary";
  save.textContent = t("options.saveTeamDefault");
  actions.appendChild(save);
  const result = document.createElement("div");

  let version = "1.0";
  let loaded = false;
  wrap.addEventListener("toggle", async () => {
    if (!wrap.open || loaded) return;
    loaded = true;
    const views = await sendToBackground<ViewsConfig>({
      type: "GET_TEAM_VIEWS",
      connectionId: c.id,
    });
    version = views.version || "1.0";
    area.value = (views.hidden ?? []).join("\n");
  });

  save.addEventListener("click", async () => {
    const hidden = area.value
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const res = await sendToBackground<{ ok: boolean; errors?: string[] }>({
      type: "SAVE_TEAM_VIEWS",
      connectionId: c.id,
      views: { version, hidden },
    });
    showResult(
      result,
      res.ok,
      res.ok
        ? t("options.savedTeamViews")
        : t("options.teamViewsFailed", { errors: res.errors?.join("; ") ?? "error" }),
    );
  });

  wrap.append(note, area, actions, result);
  return wrap;
}

function renderConnections(list: ConnectionStatus[]): void {
  connections.replaceChildren();
  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = t("options.noProjects");
    connections.appendChild(empty);
    return;
  }
  for (const c of list) connections.appendChild(connectionRow(c));
}

/** Build one manual-batch row with DOM nodes only (no innerHTML) so label/
 *  project/file names from a crafted bundle are never an injection sink, matching
 *  connectionRow. One row per import: the batch's pinned sites are listed inline
 *  and Remove drops the whole batch by id. */
function batchRow(b: ManualBatchSummary): HTMLElement {
  const row = document.createElement("div");
  row.className = "conn";

  const head = document.createElement("div");
  head.className = "conn-head";
  const title = document.createElement("div");
  title.className = "conn-title";
  const name = document.createElement("span");
  name.textContent = b.label;
  title.append(name);

  const actions = document.createElement("div");
  actions.className = "conn-actions";
  const remove = document.createElement("button");
  remove.className = "secondary";
  remove.textContent = t("options.remove");
  remove.addEventListener("click", async () => {
    await sendToBackground({ type: "REMOVE_LOCAL_BATCH", id: b.id });
    showResult(localResult, true, t("options.batchRemoved"));
    await refresh();
  });
  actions.append(remove);
  head.append(title, actions);

  const meta = document.createElement("div");
  meta.className = "conn-meta";
  const how =
    b.source === "files"
      ? (b.fileNames?.join(", ") ?? t("options.sourceFiles"))
      : t("options.sourcePasted");
  // importedAt is 0 for legacy-migrated batches (unknown time); omit it then.
  const when = b.importedAt ? ` · ${new Date(b.importedAt).toLocaleString()}` : "";
  meta.textContent = `${b.project || t("options.untitled")} · ${t("options.specCount", {
    count: b.specCount,
  })} · ${how}${when}`;

  // Pinned sites shown inline. An empty-domain batch matches every site.
  const sites = document.createElement("div");
  sites.className = "conn-meta";
  sites.textContent = b.domains.length
    ? t("options.sitesPrefix", { sites: b.domains.join(", ") })
    : t("options.sitesAll");

  row.append(head, meta, sites);
  return row;
}

/** Render the loaded batches, one card per import (in import order). Each card
 *  lists the sites its bundle is pinned to inline, so a multi-domain batch shows
 *  once instead of once per site, and Remove drops exactly that one batch. */
function renderManualBatches(batches: ManualBatchSummary[]): void {
  localBatches.replaceChildren();
  if (!batches.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = t("options.noManualSpecs");
    localBatches.appendChild(empty);
    return;
  }
  for (const b of batches) localBatches.appendChild(batchRow(b));
}

async function refresh(): Promise<void> {
  const status = await sendToBackground<StatusResult>({ type: "GET_STATUS" });
  renderConnections(status.connections ?? []);
  renderManualBatches(status.manualBatches ?? []);
}

// Toolbar-click surface preference. The background watches this storage key and
// applies it (Chrome only); no message round-trip needed.
void getDefaultSurface().then((s) => {
  surface.value = s;
});
surface.addEventListener("change", () => {
  void setDefaultSurface(surface.value as DefaultSurface);
});

// Theme preference. Reflect the stored value, apply this page's own theme at
// startup, and on change persist + apply locally for instant feedback + broadcast
// to every tab's content script (Options has no single active content tab).
void getTheme().then((value) => {
  theme.value = value;
  applyTheme(document.documentElement, value);
});
watchThemeChanges();
theme.addEventListener("change", async () => {
  const next = theme.value as Theme;
  await setTheme(next);
  applyTheme(document.documentElement, next);
  await broadcastToTabs({ type: "SET_THEME", theme: next });
});

// UI-chrome language. "system" maps to stored null (follow the browser). On change
// persist, re-init i18n, re-render this page in place, and broadcast to all tabs.
uiLocale.addEventListener("change", async () => {
  const choice: UiLocale | null = uiLocale.value === "system" ? null : (uiLocale.value as UiLocale);
  await setUiLocale(choice);
  initI18n(resolveUiLocale(choice));
  await renderAll();
  await broadcastToTabs({ type: "SET_UI_LOCALE", locale: choice });
});

byId("add").addEventListener("click", async () => {
  const { url, error } = normalizeLocalUrl(baseUrl.value);
  const tok = token.value.trim();
  if (!url || !tok) {
    showResult(addResult, false, t("options.urlTokenRequired"));
    return;
  }
  if (error) {
    showResult(addResult, false, error);
    return;
  }
  const res = await sendToBackground<{ ok: boolean; project?: string | null; error?: string }>({
    type: "ADD_CONNECTION",
    baseUrl: url,
    token: tok,
    label: label.value.trim() || undefined,
    applyToAllSites: applyAll.checked,
  });
  // Never keep the secret in the field once submitted.
  token.value = "";
  if (res.ok) {
    showResult(addResult, true, t("options.added", { project: res.project ?? "project" }));
    baseUrl.value = "";
    label.value = "";
    applyAll.checked = false;
  } else {
    showResult(
      addResult,
      false,
      t("options.couldNotConnect", { error: res.error ?? "unknown error" }),
    );
  }
  await refresh();
});

/** Send a validated bundle as a NEW batch (append, never overwrite). Surfaces the
 *  cap error on rejection, a non-blocking duplicate warning otherwise, and
 *  refreshes the list. Returns whether the batch was added (so callers clear their
 *  input only on success). */
async function addBatch(
  bundle: SpecsResponse,
  source: "paste" | "files",
  fileNames?: string[],
): Promise<boolean> {
  const res = await sendToBackground<AddLocalBatchResult>({
    type: "ADD_LOCAL_BATCH",
    bundle,
    source,
    fileNames,
  });
  if (!res.ok) {
    showResult(localResult, false, res.error ?? t("options.couldNotAddBatch"));
    return false;
  }
  if (res.duplicateOf.length) {
    // Name each prior batch and, when known, how many spec ids overlap with it.
    const names = res.duplicateOf
      .map((d) =>
        d.overlapSpecIds
          ? `"${d.label}" (${t("options.sharedSpecs", { count: d.overlapSpecIds })})`
          : `"${d.label}"`,
      )
      .join(", ");
    showResult(localResult, true, t("options.loadedDuplicates", { total: res.specCount, names }));
  } else {
    showResult(localResult, true, t("options.loadedTotal", { count: res.specCount }));
  }
  await refresh();
  return true;
}

byId("loadLocal").addEventListener("click", async () => {
  const text = localSpecs.value.trim();
  if (!text) {
    showResult(localResult, false, t("options.pasteBundleFirst"));
    return;
  }
  // Validate client-side BEFORE pushing to the background (never cache unvalidated
  // input). The spec-schema validators are precompiled and CSP-safe.
  const { specs, errors } = parseLocalBundle(text);
  if (!specs) {
    showResult(localResult, false, t("options.invalidBundle", { errors: errors.join("\n- ") }));
    return;
  }
  if (await addBatch(specs, "paste")) localSpecs.value = "";
});

byId("loadFiles").addEventListener("click", async () => {
  const picked = Array.from(localFiles.files ?? []);
  if (picked.length === 0) {
    showResult(localResult, false, t("options.pickFiles"));
    return;
  }
  // Read all picked files, then assemble + validate via the shared parseLocalBundle path.
  const files = await Promise.all(
    picked.map(async (f) => ({ name: f.name, text: await f.text() })),
  );
  const { specs, errors } = parseLocalFiles(files);
  if (!specs) {
    showResult(localResult, false, t("options.invalidSelection", { errors: errors.join("\n- ") }));
    return;
  }
  const fileNames = picked.map((f) => f.name.split(/[/\\]/).pop() ?? f.name);
  if (await addBatch(specs, "files", fileNames)) localFiles.value = "";
});

byId("clearLocal").addEventListener("click", async () => {
  await sendToBackground({ type: "CLEAR_LOCAL_SPECS" });
  localSpecs.value = "";
  showResult(localResult, true, t("options.allCleared"));
  await refresh();
});

// Re-render everything that carries translated text: hydrate the static HTML, then
// re-run the imperative connection/batch rows. Called at startup and after a UI
// language change (Phase 5) so the page updates in place without a reload.
async function renderAll(): Promise<void> {
  hydrateI18n(document);
  await refresh();
}

// Resolve the UI-chrome language, reflect the control, then render. initI18n runs
// before the first render so every t() call uses the chosen language.
async function init(): Promise<void> {
  const stored = await getUiLocale();
  uiLocale.value = stored ?? "system";
  initI18n(resolveUiLocale(stored));
  await renderAll();
}
void init();
