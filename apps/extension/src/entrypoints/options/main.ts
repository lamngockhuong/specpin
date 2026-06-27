import {
  type ConnectionStatus,
  type SetLocalSpecsResult,
  type StatusResult,
  sendToBackground,
} from "../../shared/messaging.js";
import { parseLocalBundle } from "../../sources/local-bundle.js";
import "../../shared/tokens.gen.css";

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
const localResult = byId("localResult");

// The sidecar binds localhost only; reject anything else before sending.
const LOCAL_URL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

function showResult(target: HTMLElement, ok: boolean, text: string): void {
  target.className = ok ? "ok" : "err";
  target.textContent = text;
}

/** Build one connection row with DOM nodes (no innerHTML) so project/label/
 *  domain values are never an injection sink. The token is never rendered. */
function connectionRow(c: ConnectionStatus): HTMLElement {
  const row = document.createElement("div");
  row.className = "conn";

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
  const reconnect = document.createElement("button");
  reconnect.className = "secondary";
  reconnect.textContent = "Reconnect";
  reconnect.addEventListener("click", async () => {
    await sendToBackground({ type: "RECONNECT", id: c.id });
    await refresh();
  });
  const remove = document.createElement("button");
  remove.className = "secondary";
  remove.textContent = "Remove";
  remove.addEventListener("click", async () => {
    await sendToBackground({ type: "REMOVE_CONNECTION", id: c.id });
    await refresh();
  });
  actions.append(reconnect, remove);
  head.append(title, actions);

  const meta = document.createElement("div");
  meta.className = "conn-meta";
  const state = c.connected ? "connected" : c.error ? `error: ${c.error}` : "disconnected";
  const domains = c.domains.length ? c.domains.join(", ") : "no domains pinned";
  meta.textContent = `${c.baseUrl} · ${state} · ${c.specCount} spec(s) · ${domains}`;

  row.append(head, meta);

  // Empty-domains projects are inactive until the user opts in (RT-SA1).
  if (c.domains.length === 0) {
    const warn = document.createElement("div");
    warn.className = "warn";
    const text = document.createElement("div");
    text.textContent = c.matchesAllSites
      ? "This project pins no domains; its specs show on every site you visit."
      : "This project pins no domains, so it is inactive. Enabling the option below shows its specs on every site you visit.";
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
    optLabel.append(opt, document.createTextNode(" Apply to all sites"));
    warn.append(text, optLabel);
    row.append(warn);
  }

  return row;
}

function renderConnections(list: ConnectionStatus[]): void {
  connections.replaceChildren();
  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No projects yet. Add one below.";
    connections.appendChild(empty);
    return;
  }
  for (const c of list) connections.appendChild(connectionRow(c));
}

async function refresh(): Promise<void> {
  const status = await sendToBackground<StatusResult>({ type: "GET_STATUS" });
  renderConnections(status.connections ?? []);
}

byId("add").addEventListener("click", async () => {
  const url = baseUrl.value.trim().replace(/\/+$/, "");
  const tok = token.value.trim();
  if (!url || !tok) {
    showResult(addResult, false, "Both URL and token are required.");
    return;
  }
  if (!LOCAL_URL.test(url)) {
    showResult(addResult, false, "URL must be http://127.0.0.1:PORT or http://localhost:PORT.");
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
    showResult(addResult, true, `Added "${res.project ?? "project"}".`);
    baseUrl.value = "";
    label.value = "";
    applyAll.checked = false;
  } else {
    showResult(addResult, false, `Could not connect: ${res.error ?? "unknown error"}`);
  }
  await refresh();
});

byId("loadLocal").addEventListener("click", async () => {
  const text = localSpecs.value.trim();
  if (!text) {
    showResult(localResult, false, "Paste a bundle first.");
    return;
  }
  // Validate client-side BEFORE pushing to the background (never cache unvalidated
  // input). The spec-schema validators are precompiled and CSP-safe.
  const { specs, errors } = parseLocalBundle(text);
  if (!specs) {
    showResult(localResult, false, `Invalid bundle:\n- ${errors.join("\n- ")}`);
    return;
  }
  const res = await sendToBackground<SetLocalSpecsResult>({
    type: "SET_LOCAL_SPECS",
    specs,
    seq: Date.now(),
  });
  showResult(localResult, res.ok, `Loaded ${res.specCount} spec(s) from manual import.`);
  await refresh();
});

byId("clearLocal").addEventListener("click", async () => {
  await sendToBackground<SetLocalSpecsResult>({
    type: "SET_LOCAL_SPECS",
    specs: null,
    seq: Date.now(),
  });
  localSpecs.value = "";
  showResult(localResult, true, "Manual specs cleared.");
  await refresh();
});

void refresh();
