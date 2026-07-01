import { captureFingerprint, matchElement } from "@specpin/fingerprint-core";
import type { DisplayMode, ElementFingerprint, Manifest } from "@specpin/spec-schema";
import { browser, defineContentScript } from "#imports";
import { CaptureForm } from "../content/capture-form.js";
import { CapturePicker } from "../content/capture-mode.js";
import { findMatchedSpec, isSpecpinOwned } from "../content/context-target.js";
import { GuideController } from "../content/guide.js";
import { highlightElement } from "../content/highlight.js";
import { registerKeyboard } from "../content/keyboard.js";
import { LOCALE_CHANGE_EVENT, pickLocale } from "../content/localize-spec.js";
import { type RenderSession, renderSession } from "../content/orchestrator.js";
import { resolveGuideSteps } from "../content/resolve-guide.js";
import { showToast } from "../content/toast.js";
import { initI18n, resolveUiLocale, t } from "../i18n/index.js";
import { IMPLEMENTED_MODES } from "../renderers/registry.js";
import { TooltipRenderer } from "../renderers/tooltip.js";
import {
  getDisplayMode,
  getLauncherPosition,
  getLocale,
  getTheme,
  getUiLocale,
  type LauncherPosition,
  setDisplayMode,
  setLauncherPosition,
  setLocale,
} from "../shared/config.js";
import type { TaggedSpec } from "../shared/connection-types.js";
import {
  type Message,
  type SaveSpecResult,
  type SpecsForOrigin,
  sendToBackground,
  type WriteTarget,
} from "../shared/messaging.js";
import { slugify } from "../shared/slug.js";
import type { Theme } from "../shared/theme.js";
import { EMPTY_VISIBILITY, type VisibilityState } from "../shared/visibility.js";

function defaultFileName(): string {
  const seg = location.pathname.split("/").filter(Boolean)[0] ?? location.hostname.split(".")[0];
  const slug = slugify(seg ?? "captured");
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
    // Modes the user dismissed for this page session. The dismissed surface renders
    // as the floating relaunch pill instead of its panel; the flag survives
    // re-renders / SPA navigation (in-memory only, resets on full reload). Cleared
    // when the user explicitly picks a mode (picker / Alt+Shift+M).
    const dismissedModes = new Set<DisplayMode>();
    // Where the user dragged the relaunch pill, or null for the default corner.
    // Read once at startup; updated in place on drag (no re-render needed).
    let launcherPosition: LauncherPosition | null = null;
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
    // Guide-mode tour. `guideActive` gates rerender() exactly like captureActive
    // (RT-C3): a background SPECS_CHANGED/theme/mode/locale must not rebuild a
    // render session on top of the running tour. The controller is created lazily
    // and reused across launches.
    let guide: GuideController | null = null;
    let guideActive = false;
    // The element under the last right-click, for the context-menu "Pin spec to
    // this element" / "Show spec here" actions (the background's onClicked never
    // carries the DOM element). Null when the click landed on Specpin's own UI.
    let lastRightClicked: Element | null = null;
    // On-demand tooltip for "Show spec here" when the spec renders in a non-tooltip
    // mode (sidebar/modal), so it has no badge to reveal. Its own host id keeps it
    // from clashing with the session's tooltip renderer.
    let revealTooltip: TooltipRenderer | null = null;
    const clearReveal = (): void => {
      revealTooltip?.destroy();
      revealTooltip = null;
    };

    const picker = new CapturePicker(document);
    const form = new CaptureForm(document);

    const localesFor = (m: Manifest | null): string[] => {
      const declared = m?.settings?.locales;
      if (declared?.length) return declared;
      const def = m?.settings?.defaultLocale;
      return def ? [def] : [];
    };

    const rerender = () => {
      // Freeze re-renders while capturing OR while a guide tour is running, so a
      // background event (SPECS_CHANGED / theme / mode / locale) cannot rebuild a
      // tooltip/sidebar session on top of the live overlay (RT-C3 / RT-FM6).
      if (captureActive || guideActive) {
        pendingRerender = true;
        return;
      }
      clearReveal();
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
              {
                modes: dismissedModes,
                onToggle: setDismissed,
                position: launcherPosition,
                onMove: moveLauncher,
              },
            )
          : null;
    };

    // Persist a dismiss/reopen for a whole display mode, then re-render. A function
    // declaration (like openEditForm) so rerender above can reference it.
    function setDismissed(mode: DisplayMode, dismissed: boolean): void {
      if (dismissed) dismissedModes.add(mode);
      else dismissedModes.delete(mode);
      rerender();
    }

    // Persist a user-dragged pill position. No re-render: the pill already moved on
    // screen; we only record the spot so the next mount restores it.
    function moveLauncher(pos: LauncherPosition): void {
      launcherPosition = pos;
      void setLauncherPosition(pos);
    }

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
      // A route change can unmount the tour's target element. Hard-stop the guide
      // (it restores the session via onExit) before re-rendering the new route.
      if (guideActive) guide?.stop();
      // Tear down the previous route's renderers immediately so stale tooltips
      // don't linger over the new page during the debounce window (otherwise the
      // new view paints first, then old tooltips vanish, then new ones appear).
      // Skip while capturing/editing to keep the render-freeze invariant intact.
      if (!captureActive) {
        clearReveal();
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
      // Explicitly choosing a mode is a "show me this" intent: clear dismissals so
      // the chosen surface is visible (also the guaranteed un-dismiss escape hatch).
      dismissedModes.clear();
      // Persist so the keyboard cycle survives reload and the popup/side-panel
      // picker reflects it (matches the SET_DISPLAY_MODE persistence there).
      void setDisplayMode(forcedMode);
      rerender();
    }

    function endCapture(): void {
      captureActive = false;
      flushPendingRerender();
    }

    // Launch a guide tour. The single launch path for both START_GUIDE (from the
    // popup/side panel) and the keyboard shortcut (RT-M5): it refuses while a
    // capture/edit is open OR a guide already runs, suspends the render session,
    // resolves the steps against the current page specs (default order when none
    // are given, RT-H4), and starts the controller. On exit (Done/Skip/Esc OR a
    // hard-stop) `guideActive` clears and the suspended session is restored via the
    // single flushPendingRerender primitive (RT-FM6) - never a hand-rolled rerender.
    function launchGuide(steps: string[] | undefined, name: string): void {
      if (captureActive || guideActive) return;
      const { steps: resolved } = resolveGuideSteps(steps, specs, document);
      if (resolved.length === 0) {
        showToast(t("guide.elementMissing"), document, theme);
        return;
      }
      guideActive = true;
      // Suspend the active render session so its tooltip/sidebar/modal does not sit
      // over the tour; flushPendingRerender rebuilds it on exit.
      clearReveal();
      session?.destroy();
      session = null;
      guide ??= new GuideController();
      guide.start(resolved, {
        guideName: name,
        locale,
        defaultLocale: manifest?.settings?.defaultLocale,
        theme,
        pageOrigin: location.origin,
        doc: document,
        onExit: () => {
          guideActive = false;
          flushPendingRerender();
        },
      });
    }

    // Keyboard toggle (Alt+Shift+G): stop a running tour, else launch the default
    // guide (all matched specs in default order). The message path (START_GUIDE)
    // launches a specific curated guide instead.
    function toggleGuide(): void {
      if (guideActive) {
        guide?.stop();
        return;
      }
      launchGuide(undefined, t("guide.defaultName"));
    }

    // Resolve the writable projects (sidecar + local) serving this page. The
    // background resolves them so EMPTY local projects (which specsForOrigin omits)
    // are included and each target is labelled by kind. The form asks which to
    // save into when more than one matches.
    function fetchWriteTargets(): Promise<WriteTarget[]> {
      return sendToBackground<WriteTarget[]>({
        type: "GET_WRITE_TARGETS",
        origin: window.location.origin,
      });
    }

    // Open the capture form on a specific element (fingerprint + form wiring).
    // Shared by the hover-pick flow (startCapture) and the right-click "Pin spec
    // to this element" path (pinElement). The caller owns the captureActive flag.
    function openCaptureFormForElement(el: Element, targets: WriteTarget[]): void {
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
    }

    async function startCapture(): Promise<void> {
      // One authoring/overlay flow at a time: never start capture over a running
      // tour (the Alt+Shift chords stay global while a guide owns Left/Right/Esc).
      if (guideActive) return;
      if (picker.isActive) {
        picker.stop();
        endCapture();
        return;
      }
      captureActive = true;
      const targets = await fetchWriteTargets();
      picker.start(
        (el) => openCaptureFormForElement(el, targets),
        // Picker dismissed (Escape) before any element was picked: release the
        // capture flag so re-rendering is not frozen (RT-FM6 exit path).
        endCapture,
      );
    }

    // Right-click "Pin spec to this element": capture the element recorded on the
    // last contextmenu event directly, skipping hover-pick. Honors the single-
    // authoring-flow guard; no-op when nothing valid was recorded.
    async function pinElement(): Promise<void> {
      if (captureActive || guideActive || !lastRightClicked) return;
      captureActive = true;
      const targets = await fetchWriteTargets();
      openCaptureFormForElement(lastRightClicked, targets);
    }

    // Right-click "Show spec here": frame the rendered spec matched to the last
    // right-clicked element (or its nearest matched ancestor). No-op if none.
    function showSpecHere(): void {
      if (!lastRightClicked) return;
      const hit = session ? findMatchedSpec(lastRightClicked, session.matches) : null;
      // Tell the user when nothing here has a spec, so a no-op never reads as a
      // broken action.
      if (!hit) {
        showToast(t("contextMenu.noSpecHere"), document, theme);
        return;
      }
      clearReveal();
      // Frame + scroll to the element, then show the spec's content.
      highlight(hit.el);
      // If the spec already renders as a tooltip, pin its existing tip. Otherwise
      // (sidebar/modal mode -> no badge) show it in an on-demand tooltip so the
      // action reveals the spec regardless of its configured display mode.
      for (const renderer of session?.renderers ?? []) {
        if (renderer.revealSpec?.(hit.specId)) return;
      }
      revealSpecAsTooltip(hit.specId, hit.el);
    }

    // Render one spec into a dedicated tooltip (own host id) and pin it open. Used
    // by "Show spec here" for specs whose configured mode is not tooltip.
    function revealSpecAsTooltip(specId: string, el: Element): void {
      const spec = specs.find((s) => s.id === specId);
      if (!spec) return;
      const multiProject = new Set(specs.map((s) => s.project).filter(Boolean)).size > 1;
      revealTooltip = new TooltipRenderer(document, "specpin-reveal-host", false);
      revealTooltip.render(spec, el, {
        confidence: 1,
        needsReview: false,
        locale,
        defaultLocale: manifest?.settings?.defaultLocale,
        project: spec.project,
        showProject: multiProject,
        onOpenInPanel: openInPanel,
        onEdit: openEditForm,
        editable: Boolean(spec.writable),
        theme,
      });
      revealTooltip.revealSpec(specId);
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
    // the form + picker always run in the page context. Sidecar AND local specs
    // are editable; the write routes by the spec's connectionId.
    function openEditForm(specId: string): void {
      // One authoring flow at a time: if a capture or another edit is already
      // open, ignore (re-opening form.open() would close the first and discard
      // its unsaved edits). Both surfaces' Edit buttons route here.
      if (captureActive) return;
      // Both sidecar and local specs are editable; the UPDATE_SPEC carries the
      // spec's connectionId (manual:<batchId> for local), which routes the write.
      const spec = specs.find((s) => s.id === specId);
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
      onToggleCapture: () => void startCapture(),
      onToggleGuide: toggleGuide,
    });

    // Record the right-clicked element for the context-menu actions. Capture phase
    // so it runs before the menu opens. Specpin's own UI lives in `specpin-*`
    // shadow hosts (events retarget to the host at document level); skip those so
    // pin/show never act on our tooltip/sidebar/form.
    document.addEventListener(
      "contextmenu",
      (e) => {
        const target = e.target as Element | null;
        lastRightClicked = target && !isSpecpinOwned(target) ? target : null;
      },
      true,
    );

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
          // RT-H6: a mid-tour spec change (a teammate's SSE edit can delete/alter
          // a step's spec, stranding a captured element) hard-stops the guide and
          // restores the session before the page re-queries its specs.
          if (guideActive) guide?.stop();
          void refresh();
          break;
        case "START_CAPTURE":
          void startCapture();
          break;
        case "START_GUIDE":
          launchGuide(message.steps, message.name);
          break;
        case "PIN_ELEMENT":
          void pinElement();
          break;
        case "SHOW_SPEC_HERE":
          showSpecHere();
          break;
        case "EDIT_SPEC":
          openEditForm(message.specId);
          break;
        case "SET_DISPLAY_MODE":
          forcedMode = message.mode;
          // Picking a mode in the popup/side-panel is an explicit "show me this":
          // clear any dismissal so the chosen surface appears.
          dismissedModes.clear();
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
        case "GET_MATCHED_IDS":
          // Report which specs resolve to an element on this page so the popup /
          // side panel can scope its list to "this page". "On this page" means the
          // element is PRESENT, independent of the visibility cascade (team/personal
          // hide + tag filters) - that is an orthogonal axis the surfaces show as
          // greying + the eye toggle. So match over ALL page specs, not the rendered
          // (visible-only) `session.matches` subset, or a hidden-but-present spec
          // would drop out of the list and lose its un-hide control. Matching live
          // against the current DOM also keeps this correct mid-SPA-nav (no reliance
          // on `session` being rebuilt). Returning a value (a Promise) makes this the
          // sendMessage response; other cases return undefined (fire-and-forget).
          return Promise.resolve({
            ids: enabled
              ? specs.filter((s) => matchElement(s.fingerprint, document).el).map((s) => s.id)
              : [],
          });
      }
    });

    // Restore the persisted display-mode override, forced theme, dragged pill
    // position, and UI-chrome language before the first render so renderers
    // translate and a reloaded page honors them instead of resetting. These reads
    // are independent, so fetch them concurrently (content init runs on every page).
    const [storedMode, storedTheme, storedUiLocale, storedLauncherPosition] = await Promise.all([
      getDisplayMode(),
      getTheme(),
      getUiLocale(),
      getLauncherPosition(),
    ]);
    forcedMode = storedMode;
    theme = storedTheme;
    launcherPosition = storedLauncherPosition;
    initI18n(resolveUiLocale(storedUiLocale));
    await refresh();
    // Seed after the first render so a stray early mutation doesn't trigger a
    // redundant re-render for the URL we just rendered.
    lastRenderedUrl = location.href;
  },
});
