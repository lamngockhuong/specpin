import type { GuidesConfig, SpecsResponse, ViewsConfig } from "@specpin/api-client";
import { hydrateI18n, initI18n, resolveUiLocale, t, type UiLocale } from "../../i18n/index.js";
import { parseDomains } from "../../shared/add-project.js";
import {
  type DefaultSurface,
  getBadgeNumbering,
  getDefaultSurface,
  getTheme,
  getUiLocale,
  setBadgeNumbering,
  setDefaultSurface,
  setTheme,
  setUiLocale,
  type Theme,
} from "../../shared/config.js";
import { confirmDialog } from "../../shared/dialog.js";
import { downloadBytes } from "../../shared/download.js";
import {
  clearCorpus,
  type DriftEntry,
  deleteCorpusEntry,
  exportCorpusJson,
  getCorpus,
  getCorpusCount,
  getCorpusEnabled,
  setCorpusEnabled,
} from "../../shared/drift-corpus.js";
import { downloadExportBundles } from "../../shared/export-download.js";
import { guideRowElement } from "../../shared/guide-section.js";
import { ensureRemotePermission } from "../../shared/host-permission.js";
import { createIconButton } from "../../shared/icons.js";
import { localConnId } from "../../shared/local-id.js";
import { normalizeSidecarUrl } from "../../shared/local-url.js";
import {
  type AddLocalBatchResult,
  broadcastToTabs,
  type ConnectionStatus,
  type ExportBundle,
  type ManualBatchSummary,
  type StatusResult,
  sendToBackground,
} from "../../shared/messaging.js";
import { applyTheme, watchThemeChanges } from "../../shared/theme.js";
import { type NamedFile, parseLocalBundle, parseLocalFiles } from "../../sources/local-bundle.js";
import { readPickedFiles } from "../../sources/read-picked-files.js";
import { initOptionsNav } from "./nav.js";
import "../../shared/inter-font.css";
import "../../shared/tokens.gen.css";
import "../../shared/switch.css";
import "../../shared/link.css";
import "../../shared/guide-section.css";

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
const badgeNumbering = byId("badgeNumbering") as HTMLInputElement;
const uiLocale = byId("uiLocale") as HTMLSelectElement;
const corpusEnabled = byId("corpusEnabled") as HTMLInputElement;
const corpusCount = byId("corpusCount");
const corpusList = byId("corpusList");
const corpusResult = byId("corpusResult");

// Auto-hide result banners so they don't linger until the next action or a page
// reload (the earlier behaviour). Success clears sooner than errors, which the
// user may still need to read. A per-target timer is reset on each call so a
// fresh message is never wiped by a stale timer from a previous one.
const RESULT_HIDE_MS = { ok: 4000, err: 8000 };
const resultTimers = new WeakMap<HTMLElement, number>();

function showResult(target: HTMLElement, ok: boolean, text: string): void {
  target.className = ok ? "ok" : "err";
  target.textContent = text;
  // clearTimeout is a no-op for a missing/expired id, so no guard is needed.
  clearTimeout(resultTimers.get(target));
  const timer = window.setTimeout(
    () => {
      target.className = "";
      target.textContent = "";
      resultTimers.delete(target);
    },
    ok ? RESULT_HIDE_MS.ok : RESULT_HIDE_MS.err,
  );
  resultTimers.set(target, timer);
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
    if (!(await confirmDialog({ message: t("options.confirmRemoveConnection"), danger: true })))
      return;
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
  if (c.connected) row.append(teamViewsSection(c), teamGuidesSection(c));

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
    const { url: nextUrl, valid, isRemote } = normalizeSidecarUrl(url.value);
    if (!nextUrl) {
      showResult(result, false, t("options.urlRequired"));
      return;
    }
    if (!valid) {
      showResult(result, false, t(isRemote ? "options.urlErrorRemoteHttps" : "options.urlError"));
      return;
    }
    // Grant the optional host permission for a remote endpoint within this gesture
    // (no await precedes this) before the connection round-trip.
    const granted = await ensureRemotePermission(nextUrl, isRemote, () => {
      tokenInput.value = "";
      showResult(result, false, t("addProject.permissionDenied"));
    });
    if (!granted) return;
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

/** Per-connection team-guides management: list the connection's committed guides
 *  (.specs/guides.json) and delete them, without visiting a page. Authoring +
 *  reorder happen in the popup/side-panel editor (which has the page specs);
 *  Options is the list + delete surface, parallel to teamViewsSection. Guides
 *  load lazily on expand. */
function teamGuidesSection(c: ConnectionStatus): HTMLElement {
  const wrap = document.createElement("details");
  wrap.className = "team-views";
  const summary = document.createElement("summary");
  summary.textContent = t("options.teamGuidesSummary");
  wrap.appendChild(summary);

  const note = document.createElement("p");
  note.className = "muted";
  note.textContent = t("options.teamGuidesNote");
  const list = document.createElement("ul");
  list.className = "guides-list";
  const result = document.createElement("div");
  wrap.append(note, list, result);

  async function load(): Promise<void> {
    const config = await sendToBackground<GuidesConfig>({
      type: "GET_TEAM_GUIDES",
      connectionId: c.id,
    });
    renderList(config.guides);
  }

  function renderList(guides: GuidesConfig["guides"]): void {
    list.innerHTML = "";
    if (guides.length === 0) {
      const empty = document.createElement("li");
      empty.className = "muted";
      empty.textContent = t("options.noTeamGuides");
      list.appendChild(empty);
      return;
    }
    for (const guide of guides) {
      // Delete-only row (authoring/reorder live in the popup/side-panel editor);
      // reuse the shared row builder so the markup never drifts from the launch list.
      const li = guideRowElement(guide, {
        onDelete: async () => {
          const ok = await confirmDialog({
            message: t("guide.deleteConfirm", { name: guide.name }),
            danger: true,
          });
          if (!ok) return;
          const res = await sendToBackground<{ ok: boolean; error?: string }>({
            type: "DELETE_GUIDE",
            scope: "team",
            id: guide.id,
            targetId: c.id,
          });
          if (res.ok) await load();
          else showResult(result, false, t("guide.deleteFailed", { error: res.error ?? "error" }));
        },
      });
      list.appendChild(li);
    }
  }

  let loaded = false;
  wrap.addEventListener("toggle", () => {
    if (!wrap.open || loaded) return;
    loaded = true;
    void load();
  });
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
  row.className = b.enabled ? "conn" : "conn conn-disabled";

  const head = document.createElement("div");
  head.className = "conn-head";
  const title = document.createElement("div");
  title.className = "conn-title";
  const name = document.createElement("span");
  name.textContent = b.label;
  title.append(name);

  // Inline rename form, toggled by the Rename button (hidden until first opened).
  const renameForm = renameSection(b);

  const actions = document.createElement("div");
  actions.className = "conn-actions";

  // Per-batch on/off, mirroring the sidecar connection toggle. Disabling stops
  // this batch from serving any page (specs + guides + capture); the row stays so
  // it can be re-enabled.
  const toggle = document.createElement("label");
  toggle.className = "conn-toggle";
  toggle.title = b.enabled ? t("options.disableProject") : t("options.enableProject");
  const toggleBox = document.createElement("input");
  toggleBox.type = "checkbox";
  toggleBox.className = "switch";
  toggleBox.checked = b.enabled;
  toggleBox.addEventListener("change", async () => {
    await sendToBackground({
      type: "SET_LOCAL_BATCH_ENABLED",
      id: b.id,
      enabled: toggleBox.checked,
    });
    await refresh();
  });
  toggle.append(
    document.createTextNode(b.enabled ? t("options.enabled") : t("options.disabled")),
    toggleBox,
  );
  actions.append(toggle);

  // Export this batch as a <project>.specs.zip (reuses the Phase 4 utils).
  const exportBtn = document.createElement("button");
  exportBtn.className = "secondary";
  exportBtn.textContent = t("options.export");
  exportBtn.addEventListener("click", async () => {
    const bundles = await sendToBackground<ExportBundle[]>({
      type: "GET_EXPORT_BUNDLES",
      id: localConnId(b.id),
    });
    downloadExportBundles(bundles);
  });

  const rename = document.createElement("button");
  rename.className = "secondary";
  rename.textContent = t("options.rename");
  rename.addEventListener("click", () => {
    renameForm.hidden = !renameForm.hidden;
  });

  const remove = document.createElement("button");
  remove.className = "secondary";
  remove.textContent = t("options.remove");
  remove.addEventListener("click", async () => {
    if (!(await confirmDialog({ message: t("options.confirmRemoveBatch"), danger: true }))) return;
    await sendToBackground({ type: "REMOVE_LOCAL_BATCH", id: b.id });
    showResult(localResult, true, t("options.batchRemoved"));
    await refresh();
  });
  actions.append(exportBtn, rename, remove);
  head.append(title, actions);

  const meta = document.createElement("div");
  meta.className = "conn-meta";
  // Provenance: created-in-extension ("manual") reads "Local"; imports keep their
  // paste/files description.
  const how =
    b.source === "manual"
      ? t("options.sourceLocal")
      : b.source === "files"
        ? (b.fileNames?.join(", ") ?? t("options.sourceFiles"))
        : t("options.sourcePasted");
  // importedAt is 0 for legacy-migrated batches (unknown time); omit it then.
  const when = b.importedAt ? ` · ${new Date(b.importedAt).toLocaleString()}` : "";
  const details = `${b.project || t("options.untitled")} · ${t("options.specCount", {
    count: b.specCount,
  })} · ${how}${when}`;
  // A disabled batch serves no page; say so first (parallel to connectionRow).
  meta.textContent = b.enabled ? details : t("options.disabledState", { state: details });

  // Pinned sites shown inline. An empty-domain batch matches every site.
  const sites = document.createElement("div");
  sites.className = "conn-meta";
  sites.textContent = b.domains.length
    ? t("options.sitesPrefix", { sites: b.domains.join(", ") })
    : t("options.sitesAll");

  row.append(head, meta, sites, renameForm);
  return row;
}

/** Inline rename form for a local batch: change the project name and (optionally)
 *  its pinned sites. Saving routes through RENAME_LOCAL_PROJECT (privileged) and
 *  refreshes the list (which collapses the form). */
function renameSection(b: ManualBatchSummary): HTMLElement {
  const form = document.createElement("div");
  form.className = "conn-edit";
  form.hidden = true;

  const nameLabel = document.createElement("label");
  nameLabel.textContent = t("options.projectNameLabel");
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = b.project || b.label;

  const domainsLabel = document.createElement("label");
  domainsLabel.textContent = t("options.domainsLabel");
  const domainsInput = document.createElement("input");
  domainsInput.type = "text";
  domainsInput.value = b.domains.join(", ");

  const actions = document.createElement("div");
  actions.className = "conn-actions";
  const save = document.createElement("button");
  save.className = "secondary";
  save.textContent = t("options.saveChanges");
  const cancel = document.createElement("button");
  cancel.className = "secondary";
  cancel.textContent = t("common.cancel");
  actions.append(save, cancel);

  cancel.addEventListener("click", () => {
    form.hidden = true;
  });
  save.addEventListener("click", async () => {
    const project = nameInput.value.trim();
    if (!project) {
      showResult(localResult, false, t("addProject.projectRequired"));
      return;
    }
    const res = await sendToBackground<{ ok: boolean; error?: string }>({
      type: "RENAME_LOCAL_PROJECT",
      id: b.id,
      project,
      domains: parseDomains(domainsInput.value),
    });
    if (res.ok) {
      showResult(localResult, true, t("options.renamed", { project }));
      await refresh();
    } else {
      showResult(localResult, false, res.error ?? t("options.couldNotAddBatch"));
    }
  });

  form.append(nameLabel, nameInput, domainsLabel, domainsInput, actions);
  return form;
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

// Badge-numbering preference. Reflect the stored value, then on change persist +
// broadcast to every tab's content script so open pages re-render live (same path
// as the theme control above).
void getBadgeNumbering().then((value) => {
  badgeNumbering.checked = value;
});
badgeNumbering.addEventListener("change", async () => {
  await setBadgeNumbering(badgeNumbering.checked);
  await broadcastToTabs({ type: "SET_BADGE_NUMBERING", on: badgeNumbering.checked });
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
  const { url, valid, isRemote } = normalizeSidecarUrl(baseUrl.value);
  const tok = token.value.trim();
  if (!url || !tok) {
    showResult(addResult, false, t("options.urlTokenRequired"));
    return;
  }
  if (!valid) {
    showResult(addResult, false, t(isRemote ? "options.urlErrorRemoteHttps" : "options.urlError"));
    return;
  }
  // Request the optional host permission for a remote endpoint within this gesture
  // (no await precedes this) before connecting.
  const granted = await ensureRemotePermission(url, isRemote, () => {
    token.value = "";
    showResult(addResult, false, t("addProject.permissionDenied"));
  });
  if (!granted) return;
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
  fileGroups?: Record<string, string>,
): Promise<boolean> {
  const res = await sendToBackground<AddLocalBatchResult>({
    type: "ADD_LOCAL_BATCH",
    bundle,
    source,
    fileNames,
    fileGroups,
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
  } else if (res.idCollisions.length) {
    // Cross-batch spec-id overlap: only the first matching batch renders/edits
    // each id (specsForOrigin dedups first-wins). Non-blocking warning.
    showResult(
      localResult,
      true,
      t("options.loadedIdCollisions", {
        total: res.specCount,
        ids: res.idCollisions.join(", "),
      }),
    );
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
  const { specs, fileGroups, errors } = parseLocalBundle(text);
  if (!specs) {
    showResult(localResult, false, t("options.invalidBundle", { errors: errors.join("\n- ") }));
    return;
  }
  if (await addBatch(specs, "paste", undefined, fileGroups)) localSpecs.value = "";
});

byId("loadFiles").addEventListener("click", async () => {
  const picked = Array.from(localFiles.files ?? []);
  if (picked.length === 0) {
    showResult(localResult, false, t("options.pickFiles"));
    return;
  }
  // Read picks into named entries (a .zip export is expanded into its members),
  // then validate the whole set through the one shared parseLocalFiles path.
  let files: NamedFile[];
  try {
    files = await readPickedFiles(picked);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    showResult(localResult, false, t("options.invalidZip", { error }));
    return;
  }
  const { specs, fileGroups, errors } = parseLocalFiles(files);
  if (!specs) {
    showResult(localResult, false, t("options.invalidSelection", { errors: errors.join("\n- ") }));
    return;
  }
  const fileNames = files.map((f) => f.name.split(/[/\\]/).pop() ?? f.name);
  if (await addBatch(specs, "files", fileNames, fileGroups)) localFiles.value = "";
});

byId("clearLocal").addEventListener("click", async () => {
  if (!(await confirmDialog({ message: t("options.confirmClearLocal"), danger: true }))) return;
  await sendToBackground({ type: "CLEAR_LOCAL_SPECS" });
  localSpecs.value = "";
  showResult(localResult, true, t("options.allCleared"));
  await refresh();
});

// Reflect the local matching-corpus state: opt-in checkbox, live entry count, and
// the per-entry list (read once, reused for both count and list).
async function refreshCorpus(): Promise<void> {
  corpusEnabled.checked = await getCorpusEnabled();
  const entries = await getCorpus();
  corpusCount.textContent = t("options.corpusCount", { count: entries.length });
  renderCorpusList(entries);
}

/** One-line element hint from a fingerprint: tag plus its strongest locating
 *  signal (test-id > id > css selector). Values are redacted at write time. */
function fingerprintSummary(fp: DriftEntry["old"]): string {
  const anchor = fp.testId ? `[data-testid="${fp.testId}"]` : fp.id ? `#${fp.id}` : fp.cssSelector;
  return `${fp.tagName} · ${anchor}`;
}

/** Data-only meta line for a corpus row: for passive entries the spec id (so two
 *  drifts of the SAME spec are recognizable), then project, page path (when
 *  known), local time, and a kind-specific tail - re-pin: the prior match tier;
 *  auto-capture: which candidate the scorer would have picked (or abstained), of
 *  how many. Every value is a redacted fingerprint or local metadata. */
function corpusMetaText(entry: DriftEntry): string {
  const parts: string[] = [];
  // specId is the passive dedupe key: identical rows are the same spec captured
  // at different times, so surface it to tell them apart from a different spec.
  if (entry.kind === "passive") parts.push(t("options.corpusSpec", { id: entry.specId }));
  parts.push(entry.project || t("options.untitled"));
  if (entry.pageUrl) parts.push(entry.pageUrl);
  parts.push(new Date(entry.ts).toLocaleString());
  if (entry.kind === "supervised") {
    parts.push(
      t("options.corpusPrev", {
        strategy: entry.prevStrategy,
        confidence: entry.prevConfidence.toFixed(2),
      }),
    );
  } else {
    const count = entry.candidates.length;
    // chosenByScorer is a 0-based index (tentative guess); show it 1-based, or
    // note the scorer abstained. Distinguishes two snapshots whose DOM differed.
    parts.push(
      entry.chosenByScorer === undefined
        ? t("options.corpusScorerAbstained", { count })
        : t("options.corpusScorerPicked", { n: entry.chosenByScorer + 1, count }),
    );
  }
  return parts.join(" · ");
}

/** Build one corpus row with DOM nodes only (no innerHTML): a kind badge, an
 *  element summary, a delete button, and a meta line. Fingerprint values are
 *  redacted at write time and set via textContent, so a crafted page path or
 *  selector is never an injection sink (parallel to connectionRow/batchRow). */
function corpusRow(entry: DriftEntry): HTMLElement {
  const li = document.createElement("li");
  li.className = "corpus-item";

  const head = document.createElement("div");
  head.className = "corpus-head";

  const badge = document.createElement("span");
  badge.className = `corpus-kind corpus-kind-${entry.kind}`;
  badge.textContent =
    entry.kind === "supervised"
      ? t("options.corpusKindSupervised")
      : t("options.corpusKindPassive");
  head.appendChild(badge);

  // A "Correct" affirmation (new === old) is worth flagging apart from a re-pin.
  if (entry.kind === "supervised" && entry.confirmed) {
    const tag = document.createElement("span");
    tag.className = "corpus-tag";
    tag.textContent = t("options.corpusConfirmed");
    head.appendChild(tag);
  }

  const summary = document.createElement("span");
  summary.className = "corpus-summary";
  summary.textContent = fingerprintSummary(entry.old);
  head.appendChild(summary);

  // Full entry (already redacted at write time) as pretty JSON, collapsed by
  // default. This is where two same-spec snapshots actually differ: the old +
  // candidate fingerprints the scorer weighed. textContent, so never an HTML sink.
  const detail = document.createElement("pre");
  detail.className = "corpus-detail";
  detail.hidden = true;
  detail.textContent = JSON.stringify(entry, null, 2);

  const details = document.createElement("button");
  details.className = "secondary";
  details.textContent = t("options.corpusDetails");
  details.addEventListener("click", () => {
    detail.hidden = !detail.hidden;
  });
  head.appendChild(details);

  const del = createIconButton(document, "secondary", "trash", t("guide.delete"), async () => {
    if (!(await confirmDialog({ message: t("options.confirmDeleteCorpusEntry"), danger: true })))
      return;
    await deleteCorpusEntry(entry);
    await refreshCorpus();
    showResult(corpusResult, true, t("options.corpusEntryDeleted"));
  });
  head.appendChild(del);
  li.appendChild(head);

  const meta = document.createElement("div");
  meta.className = "corpus-meta";
  meta.textContent = corpusMetaText(entry);
  li.appendChild(meta);
  li.appendChild(detail);

  return li;
}

/** Render the stored corpus entries, newest first, one row each. Empty is left
 *  blank: the count line above already reads "0 entries stored." */
function renderCorpusList(entries: DriftEntry[]): void {
  corpusList.replaceChildren();
  if (entries.length === 0) return;
  const list = document.createElement("ul");
  list.className = "corpus-list";
  // Reverse a copy so the newest entry (appended last) shows first, without
  // mutating the caller's array.
  for (const entry of [...entries].reverse()) list.appendChild(corpusRow(entry));
  corpusList.appendChild(list);
}

corpusEnabled.addEventListener("change", async () => {
  await setCorpusEnabled(corpusEnabled.checked);
});

byId("corpusExport").addEventListener("click", async () => {
  const count = await getCorpusCount();
  if (count === 0) {
    showResult(corpusResult, false, t("options.corpusEmpty"));
    return;
  }
  const json = await exportCorpusJson();
  downloadBytes("specpin-drift-corpus.json", new TextEncoder().encode(json), "application/json");
  showResult(corpusResult, true, t("options.corpusExported", { count }));
});

byId("corpusClear").addEventListener("click", async () => {
  if (!(await confirmDialog({ message: t("options.confirmClearCorpus"), danger: true }))) return;
  await clearCorpus();
  await refreshCorpus();
  showResult(corpusResult, true, t("options.corpusCleared"));
});

// Re-render everything that carries translated text: hydrate the static HTML, then
// re-run the imperative connection/batch rows. Called at startup and after a UI
// language change (Phase 5) so the page updates in place without a reload.
async function renderAll(): Promise<void> {
  hydrateI18n(document);
  await refresh();
  await refreshCorpus();
}

// Resolve the UI-chrome language, reflect the control, then render. initI18n runs
// before the first render so every t() call uses the chosen language.
async function init(): Promise<void> {
  const stored = await getUiLocale();
  uiLocale.value = stored ?? "system";
  initI18n(resolveUiLocale(stored));
  await renderAll();
}
// Wire the sidebar-rail section switching before the async init so the correct
// pane shows immediately on load (panes are static markup; no data needed).
initOptionsNav();
void init();
