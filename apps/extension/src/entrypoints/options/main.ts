import { getConfig } from "../../shared/config.js";
import { sendToBackground, type TestConnectionResult } from "../../shared/messaging.js";

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
};
const baseUrl = byId("baseUrl") as HTMLInputElement;
const token = byId("token") as HTMLInputElement;
const result = byId("result");

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

void prefill();
