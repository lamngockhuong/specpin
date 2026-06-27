import { captureFingerprint } from "@specpin/fingerprint-core";
import type { DisplayMode, Manifest } from "@specpin/spec-schema";
import { browser, defineContentScript } from "#imports";
import { CaptureForm } from "../content/capture-form.js";
import { CapturePicker } from "../content/capture-mode.js";
import { registerKeyboard } from "../content/keyboard.js";
import { LOCALE_CHANGE_EVENT, pickLocale } from "../content/localize-spec.js";
import { type RenderSession, renderSession } from "../content/orchestrator.js";
import { IMPLEMENTED_MODES } from "../renderers/registry.js";
import { getLocale, setLocale } from "../shared/config.js";
import { MANUAL_CONNECTION_ID, type TaggedSpec } from "../shared/connection-types.js";
import {
  type Message,
  type SaveSpecResult,
  type SpecsForOrigin,
  sendToBackground,
} from "../shared/messaging.js";
import { EMPTY_VISIBILITY, type VisibilityState } from "../shared/visibility.js";

function defaultFileName(): string {
  const seg = location.pathname.split("/").filter(Boolean)[0] ?? location.hostname.split(".")[0];
  const slug = (seg ?? "captured")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
    let specs: TaggedSpec[] = [];
    let enabled = true;
    let forcedMode: DisplayMode | null = null;
    let locale = "en";
    let availableLocales: string[] = [];
    let visibility: VisibilityState = EMPTY_VISIBILITY;

    // Tooltip pin "open in side panel": ask the background to open the panel
    // (best-effort) and highlight the spec card. Defined once and threaded into
    // every render session so renderers stay DOM-pure.
    const openInPanel = (specId: string): void => {
      void sendToBackground({ type: "OPEN_SPEC_IN_PANEL", specId });
    };
    // RT-FM6: a re-render must not run while the user is mid-capture; queue it
    // and apply on capture exit instead.
    let captureActive = false;
    let pendingRerender = false;

    const picker = new CapturePicker(document);
    const form = new CaptureForm(document);

    const localesFor = (m: Manifest | null): string[] => {
      const declared = m?.settings?.locales;
      if (declared?.length) return declared;
      const def = m?.settings?.defaultLocale;
      return def ? [def] : [];
    };

    const rerender = () => {
      if (captureActive) {
        pendingRerender = true;
        return;
      }
      session?.destroy();
      session =
        enabled && specs.length
          ? renderSession(
              specs,
              manifest,
              document,
              forcedMode,
              locale,
              availableLocales,
              visibility,
              location.href,
              openInPanel,
            )
          : null;
    };

    const flushPendingRerender = () => {
      if (pendingRerender) {
        pendingRerender = false;
        rerender();
      }
    };

    async function applyLocale(next: string, persist: boolean): Promise<void> {
      locale = next;
      if (persist) await setLocale(next);
      rerender();
    }

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
      visibility = res.visibility ?? EMPTY_VISIBILITY;
      // Prefer the background's cross-project locale union for this origin; fall
      // back to deriving from the single manifest.
      availableLocales = res.locales?.length ? res.locales : localesFor(manifest);
      // Re-resolve the active locale: stored choice, else the project default.
      locale = pickLocale(await getLocale(), manifest?.settings?.defaultLocale);
      rerender();
    }

    function cycleMode(): void {
      const idx = forcedMode ? IMPLEMENTED_MODES.indexOf(forcedMode) : -1;
      forcedMode = IMPLEMENTED_MODES[(idx + 1) % IMPLEMENTED_MODES.length] ?? null;
      rerender();
    }

    function endCapture(): void {
      captureActive = false;
      flushPendingRerender();
    }

    function startCapture(): void {
      if (picker.isActive) {
        picker.stop();
        endCapture();
        return;
      }
      captureActive = true;
      // Distinct sidecar projects serving this page, for the target picker when
      // more than one matches (Manual specs are read-only, excluded).
      const targets = [
        ...new Map(
          specs
            .filter((s) => s.connectionId !== MANUAL_CONNECTION_ID)
            .map((s) => [s.connectionId, { id: s.connectionId, project: s.project }]),
        ).values(),
      ];
      picker.start(
        (el) => {
          const fingerprint = captureFingerprint(el);
          form.open(fingerprint, {
            defaultFile: defaultFileName(),
            locales: availableLocales,
            defaultLocale: manifest?.settings?.defaultLocale ?? locale,
            targets,
            onSubmit: async (file, spec, connectionId) => {
              const result = await sendToBackground<SaveSpecResult>({
                type: "SAVE_SPEC",
                file,
                spec,
                connectionId,
              });
              if (result.ok) endCapture();
              return result;
            },
            onCancel: endCapture,
          });
        },
        // Picker dismissed (Escape) before any element was picked: release the
        // capture flag so re-rendering is not frozen (RT-FM6 exit path).
        endCapture,
      );
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

    // The sidebar's in-panel language selector dispatches this DOM event; apply
    // it like a popup-driven change and persist so the popup picker mirrors it.
    document.addEventListener(LOCALE_CHANGE_EVENT, (e) => {
      const next = (e as CustomEvent<string>).detail;
      if (typeof next === "string" && next) void applyLocale(next, true);
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
        case "SET_LOCALE":
          // The popup already persisted the choice; just re-render with it.
          void applyLocale(message.locale, false);
          break;
      }
    });

    await refresh();
  },
});
