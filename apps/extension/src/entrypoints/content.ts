import { browser, defineContentScript } from "#imports";
import { captureFingerprint } from "@specpin/fingerprint-core";
import type { DisplayMode, Manifest } from "@specpin/spec-schema";
import type { SpecWithFile } from "@specpin/api-client";
import { renderSession, type RenderSession } from "../content/orchestrator.js";
import { CapturePicker } from "../content/capture-mode.js";
import { CaptureForm } from "../content/capture-form.js";
import { registerKeyboard } from "../content/keyboard.js";
import { IMPLEMENTED_MODES } from "../renderers/registry.js";
import {
  sendToBackground,
  type Message,
  type SaveSpecResult,
  type SpecsForOrigin,
} from "../shared/messaging.js";

function defaultFileName(): string {
  const seg = location.pathname.split("/").filter(Boolean)[0] ?? location.hostname.split(".")[0];
  const slug = (seg ?? "captured").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "captured"}.spec.json`;
}

// Read + write content script: render matched specs through the renderer
// registry, cycle display mode and toggle capture via the keyboard, and author
// new specs with the capture picker + form (write goes through the SW).
export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  async main() {
    let session: RenderSession | null = null;
    let manifest: Manifest | null = null;
    let specs: SpecWithFile[] = [];
    let enabled = true;
    let forcedMode: DisplayMode | null = null;

    const picker = new CapturePicker(document);
    const form = new CaptureForm(document);

    const rerender = () => {
      session?.destroy();
      session = enabled && specs.length ? renderSession(specs, manifest, document, forcedMode) : null;
    };

    async function refresh(): Promise<void> {
      let res: SpecsForOrigin;
      try {
        res = await sendToBackground<SpecsForOrigin>({
          type: "GET_SPECS_FOR_ORIGIN",
          origin: location.origin,
        });
      } catch {
        return; // background not ready
      }
      enabled = res.enabled;
      manifest = res.manifest;
      specs = res.specs;
      rerender();
    }

    function cycleMode(): void {
      const idx = forcedMode ? IMPLEMENTED_MODES.indexOf(forcedMode) : -1;
      forcedMode = IMPLEMENTED_MODES[(idx + 1) % IMPLEMENTED_MODES.length] ?? null;
      rerender();
    }

    function startCapture(): void {
      if (picker.isActive) {
        picker.stop();
        return;
      }
      picker.start((el) => {
        const fingerprint = captureFingerprint(el);
        form.open(fingerprint, {
          defaultFile: defaultFileName(),
          onSubmit: (file, spec) =>
            sendToBackground<SaveSpecResult>({ type: "SAVE_SPEC", file, spec }),
        });
      });
    }

    async function toggleEnabled(): Promise<void> {
      await sendToBackground({ type: "SET_ENABLED", enabled: !enabled });
      await refresh();
    }

    registerKeyboard(window, {
      onToggleEnabled: () => void toggleEnabled(),
      onCycleMode: cycleMode,
      onToggleCapture: startCapture,
    });

    browser.runtime.onMessage.addListener((raw) => {
      const message = raw as Message;
      switch (message?.type) {
        case "SPECS_CHANGED":
          void refresh();
          break;
        case "START_CAPTURE":
          startCapture();
          break;
        case "SET_DISPLAY_MODE":
          forcedMode = message.mode;
          rerender();
          break;
      }
    });

    await refresh();
  },
});
