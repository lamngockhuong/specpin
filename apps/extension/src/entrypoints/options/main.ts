import { getConfig } from "../../shared/config.js";
import {
  type SetLocalSpecsResult,
  sendToBackground,
  type TestConnectionResult,
} from "../../shared/messaging.js";
import { parseLocalBundle } from "../../sources/local-bundle.js";
import "../../shared/tokens.gen.css";

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
};
const baseUrl = byId("baseUrl") as HTMLInputElement;
const token = byId("token") as HTMLInputElement;
const result = byId("result");
const localSpecs = byId("localSpecs") as HTMLTextAreaElement;
const localResult = byId("localResult");

async function prefill(): Promise<void> {
  const config = await getConfig();
  if (config) {
    baseUrl.value = config.baseUrl;
    token.value = config.token;
  }
}

function showResult(ok: boolean, text: string): void {
  result.className = ok ? "ok" : "err";
  result.textContent = text;
}

function showLocalResult(ok: boolean, text: string): void {
  localResult.className = ok ? "ok" : "err";
  localResult.textContent = text;
}

byId("save").addEventListener("click", async () => {
  const url = baseUrl.value.trim().replace(/\/+$/, "");
  const tok = token.value.trim();
  if (!url || !tok) {
    showResult(false, "Both URL and token are required.");
    return;
  }
  // SAVE_CONFIG persists, reconfigures the background client, and tests health.
  const res = await sendToBackground<TestConnectionResult>({
    type: "SAVE_CONFIG",
    baseUrl: url,
    token: tok,
  });
  if (res.ok) {
    showResult(true, `Connected to "${res.project ?? "sidecar"}". Settings saved.`);
  } else {
    showResult(false, `Connection failed: ${res.error ?? "unknown error"}`);
  }
});

byId("loadLocal").addEventListener("click", async () => {
  const text = localSpecs.value.trim();
  if (!text) {
    showLocalResult(false, "Paste a bundle first.");
    return;
  }
  // Validate client-side BEFORE pushing to the background (never cache unvalidated
  // input). The spec-schema validators are precompiled and CSP-safe.
  const { specs, errors } = parseLocalBundle(text);
  if (!specs) {
    showLocalResult(false, `Invalid bundle:\n- ${errors.join("\n- ")}`);
    return;
  }
  const res = await sendToBackground<SetLocalSpecsResult>({
    type: "SET_LOCAL_SPECS",
    specs,
    seq: Date.now(),
  });
  showLocalResult(res.ok, `Loaded ${res.specCount} spec(s) from manual import.`);
});

byId("clearLocal").addEventListener("click", async () => {
  await sendToBackground<SetLocalSpecsResult>({
    type: "SET_LOCAL_SPECS",
    specs: null,
    seq: Date.now(),
  });
  localSpecs.value = "";
  showLocalResult(true, "Manual specs cleared.");
});

void prefill();
