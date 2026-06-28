import { captureFingerprint } from "@specpin/fingerprint-core";
import type { DisplayMode, ElementFingerprint, Manifest } from "@specpin/spec-schema";
import { browser, defineContentScript } from "#imports";
import { CaptureForm } from "../content/capture-form.js";
import { CapturePicker } from "../content/capture-mode.js";
import { highlightElement } from "../content/highlight.js";
import { registerKeyboard } from "../content/keyboard.js";
import { LOCALE_CHANGE_EVENT, pickLocale } from "../content/localize-spec.js";
import { type RenderSession, renderSession } from "../content/orchestrator.js";
import { initI18n, resolveUiLocale } from "../i18n/index.js";
import { IMPLEMENTED_MODES } from "../renderers/registry.js";
import {
  getDisplayMode,
  getLocale,
  getTheme,
  getUiLocale,
  setDisplayMode,
  setLocale,
} from "../shared/config.js";
import { MANUAL_CONNECTION_ID, type TaggedSpec } from "../shared/connection-types.js";
import {
  type Message,
  type SaveSpecResult,
  type SpecsForOrigin,
  sendToBackground,
} from "../shared/messaging.js";
import type { Theme } from "../shared/theme.js";
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
    // Forced UI theme for the renderers' shadow hosts; read at startup and updated
    // by SET_THEME broadcasts from the Options page. "system" leaves hosts on the OS default.
    let theme: Theme = "system";

    // Tooltip pin "open in side panel": ask the background to open the panel
    // (best-effort) and highlight the spec card. Defined once and threaded into
    // every render session so renderers stay DOM-pure.
    const openInPanel = (specId: string): void => {
      void sendToBackground({ type: "OPEN_SPEC_IN_PANEL", specId });
    };
    // Scroll to and highlight a matched page element. Threaded into every render
    // session so the sidebar/modal renderers stay DOM-pure; also invoked directly
    // for the HIGHLIGHT_ELEMENT message from the popup / side panel.
    const highlight = (el: Element): void => highlightElement(el, document);
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
              highlight,
              openEditForm,
              theme,
            )
          : null;
    };

    const flushPendingRerender = () => {
      if (pendingRerender) {
        pendingRerender = false;
        rerender();
      }
    };

    // SPA route changes (React Router pushState) don't reload the page or fire
    // popstate, so without this the renderers stay pinned to the previous route's
    // (now unmounted) elements and never match the new route. A content script
    // runs in an isolated world, so we can't intercept the page's history.pushState;
    // instead we watch location.href across three signals and re-render on change.
    let lastRenderedUrl = location.href;
    let navTimer: ReturnType<typeof setTimeout> | null = null;
    const onNavigate = () => {
      if (location.href === lastRenderedUrl) return;
      lastRenderedUrl = location.href;
      // Tear down the previous route's renderers immediately so stale tooltips
      // don't linger over the new page during the debounce window (otherwise the
      // new view paints first, then old tooltips vanish, then new ones appear).
      // Skip while capturing/editing to keep the render-freeze invariant intact.
      if (!captureActive) {
        session?.destroy();
        session = null;
      }
      // Debounce only the re-render: the new view paints over several frames, so
      // render once the DOM settles and the new route's elements are mounted.
      if (navTimer) clearTimeout(navTimer);
      navTimer = setTimeout(() => {
        navTimer = null;
        rerender();
      }, 100);
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
      // Persist so the keyboard cycle survives reload and the popup/side-panel
      // picker reflects it (matches the SET_DISPLAY_MODE persistence there).
      void setDisplayMode(forcedMode);
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
            theme,
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

    // Run the capture picker and resolve a new fingerprint for a re-link (or null
    // if the user cancels). Used by the edit form's "Re-link element" action.
    function relinkElement(): Promise<ElementFingerprint | null> {
      return new Promise((resolve) => {
        picker.start(
          (el) => resolve(captureFingerprint(el)),
          () => resolve(null),
        );
      });
    }

    // Open the in-place edit form for a spec id. Both the tooltip Edit button
    // (via the render session) and the side panel (via EDIT_SPEC) route here, so
    // the form + picker always run in the page context. Manual specs are
    // read-only and never editable.
    function openEditForm(specId: string): void {
      // One authoring flow at a time: if a capture or another edit is already
      // open, ignore (re-opening form.open() would close the first and discard
      // its unsaved edits). Both surfaces' Edit buttons route here.
      if (captureActive) return;
      const spec = specs.find((s) => s.id === specId && s.connectionId !== MANUAL_CONNECTION_ID);
      if (!spec) return;
      // Freeze re-renders while editing so the spec's element is not re-rendered
      // out from under the form (RT-FM6, shared with capture).
      captureActive = true;
      form.open(spec.fingerprint, {
        defaultFile: spec._file ?? defaultFileName(),
        locales: availableLocales,
        defaultLocale: manifest?.settings?.defaultLocale ?? locale,
        initial: spec,
        theme,
        onRelink: relinkElement,
        onSubmit: async (_file, updated) => {
          const result = await sendToBackground<SaveSpecResult>({
            type: "UPDATE_SPEC",
            id: spec.id,
            spec: updated,
            connectionId: spec.connectionId,
          });
          if (result.ok) endCapture();
          return result;
        },
        onCancel: endCapture,
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

    // Detect client-side navigation: popstate (back/forward) + hashchange cover
    // history/hash routing instantly; the MutationObserver catches pushState,
    // whose following DOM swap fires mutations after location.href has updated.
    // The observer also fires on our own renderer host mounts (they append to
    // body), but onNavigate's URL-equality short-circuit absorbs those as a cheap
    // string compare, so the only re-render trigger is an actual URL change.
    window.addEventListener("popstate", onNavigate);
    window.addEventListener("hashchange", onNavigate);
    new MutationObserver(onNavigate).observe(document.body ?? document.documentElement, {
      childList: true,
      subtree: true,
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
        case "EDIT_SPEC":
          openEditForm(message.specId);
          break;
        case "SET_DISPLAY_MODE":
          forcedMode = message.mode;
          rerender();
          break;
        case "SET_LOCALE":
          // The popup already persisted the choice; just re-render with it.
          void applyLocale(message.locale, false);
          break;
        case "SET_THEME":
          // Options already persisted the choice; re-render so each renderer's
          // shadow host picks up the forced theme via data-theme.
          theme = message.theme;
          rerender();
          break;
        case "SET_UI_LOCALE":
          // UI-chrome language changed in Options; re-init i18n and re-render so
          // renderers' chrome (badges, buttons, summaries) switches language.
          initI18n(resolveUiLocale(message.locale));
          rerender();
          break;
        case "HIGHLIGHT_ELEMENT": {
          // Resolve the spec id against the current render's matches and frame it.
          const el = session?.matches.get(message.specId);
          if (el) highlight(el);
          break;
        }
      }
    });

    // Restore the persisted display-mode override and forced theme, and select
    // the UI-chrome language, before the first render so renderers translate and
    // a reloaded page honors both instead of resetting. These three reads are
    // independent, so fetch them concurrently (content init runs on every page).
    const [storedMode, storedTheme, storedUiLocale] = await Promise.all([
      getDisplayMode(),
      getTheme(),
      getUiLocale(),
    ]);
    forcedMode = storedMode;
    theme = storedTheme;
    initI18n(resolveUiLocale(storedUiLocale));
    await refresh();
    // Seed after the first render so a stray early mutation doesn't trigger a
    // redundant re-render for the URL we just rendered.
    lastRenderedUrl = location.href;
  },
});
