import { anchorStrength, captureFingerprint, matchElement } from "@specpin/fingerprint-core";
import type { DisplayMode, ElementFingerprint, Manifest, Spec } from "@specpin/spec-schema";
import { browser, defineContentScript } from "#imports";
import { BulkCaptureForm, type BulkRowResult } from "../content/bulk-capture-form.js";
import { CaptureForm, cloneFields } from "../content/capture-form.js";
import { CapturePicker } from "../content/capture-mode.js";
import { suggestTitle } from "../content/capture-title.js";
import { findMatchedSpec, isSpecpinOwned } from "../content/context-target.js";
import { findGaps, stableGapKey } from "../content/coverage.js";
import { GuideController } from "../content/guide.js";
import { createHelpOverlay } from "../content/help-overlay.js";
import { highlightElement } from "../content/highlight.js";
import { registerKeyboard } from "../content/keyboard.js";
import { LOCALE_CHANGE_EVENT, pickLocale } from "../content/localize-spec.js";
import { type RenderSession, renderSession } from "../content/orchestrator.js";
import { resolveGuideSteps } from "../content/resolve-guide.js";
import { showToast } from "../content/toast.js";
import { initI18n, resolveUiLocale, t } from "../i18n/index.js";
import { CoverageOverlay } from "../renderers/coverage-overlay.js";
import { IMPLEMENTED_MODES } from "../renderers/registry.js";
import { TooltipRenderer } from "../renderers/tooltip.js";
import {
  addCoverageIgnore,
  getBadgeColor,
  getBadgeNumbering,
  getCoverageEnabled,
  getCoverageIgnore,
  getDisplayMode,
  getLauncherPosition,
  getLocale,
  getTheme,
  getUiLocale,
  type LauncherPosition,
  setCoverageEnabled,
  setDisplayMode,
  setLauncherPosition,
  setLocale,
} from "../shared/config.js";
import type { TaggedSpec } from "../shared/connection-types.js";
import { parseSpecLink } from "../shared/deep-link.js";
import { confirmDialog } from "../shared/dialog.js";
import { getCorpusEnabled } from "../shared/drift-corpus.js";
import { registerInterFont } from "../shared/inter-font.js";
import { isLocalConnectionId } from "../shared/local-id.js";
import {
  type CoverageCounts,
  type MatchReportEntry,
  type Message,
  type SaveSpecResult,
  type SpecsForOrigin,
  sendToBackground,
  type WriteTarget,
} from "../shared/messaging.js";
import { createShadowHost } from "../shared/shadow.js";
import { slugify } from "../shared/slug.js";
import type { Theme } from "../shared/theme.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";
import { EMPTY_VISIBILITY, pageScopeAllows, type VisibilityState } from "../shared/visibility.js";

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
    // Make the bundled Inter face available to the shadow-DOM renderers (best
    // effort; falls back to system-ui where the host CSP blocks the font).
    registerInterFont();

    let session: RenderSession | null = null;
    let manifest: Manifest | null = null;
    let specs: TaggedSpec[] = [];
    let enabled = true;
    // Local drift-corpus opt-in (default OFF), cached per refresh so the hot
    // rerender path stays synchronous. Gates passive candidate capture.
    let corpusEnabled = false;
    // On-page badge numbering opt-in (default OFF), cached per refresh so the hot
    // rerender path stays synchronous. Read at startup + updated by
    // SET_BADGE_NUMBERING broadcasts from the Options page.
    let badgeNumbering = false;
    // On-page badge color (null = default teal), cached per refresh like
    // badgeNumbering. Read at startup + updated by SET_BADGE_COLOR broadcasts.
    let badgeColor: string | null = null;
    // Coverage mode (Alt+Shift+U): ghost markers on undocumented interactive
    // elements. A content-script overlay layered on the live page, independent of
    // the spec render `session` (its own Shadow host). Off by default; the ignore
    // set is the personal, per-origin dismiss list, loaded when coverage turns on.
    let coverageEnabled = false;
    let coverageOverlay: CoverageOverlay | null = null;
    let coverageIgnore = new Set<string>();
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
    // Alt+Shift+N cursor over the matched-and-visible specs. The rendered
    // `session.matches` keys ARE that set (renderSession already applied the
    // visibility cascade + page scope), so no second filter is needed. -1 so the
    // first press flashes the first spec; reset on nav / spec-set change below so it
    // never points past the end.
    let cycleIndex = -1;

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
    const bulkForm = new BulkCaptureForm(document);

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
              deleteSpecFlow,
              {
                captureDrift: corpusEnabled,
                onConfirm: corpusEnabled ? confirmMatch : undefined,
                badgeNumbering,
                badgeColor,
                onClone: cloneSpecFlow,
              },
            )
          : null;
      // Passive corpus: hand any collected snapshots to the background single-writer
      // (opt-in gated upstream; empty unless corpusEnabled). Fire-and-forget.
      if (session?.drift.length) {
        void sendToBackground({ type: "RECORD_DRIFT_PASSIVE", entries: session.drift });
      }
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
      // The matched set changes across routes; reset the cycle cursor so it never
      // points past the end of the new route's specs.
      cycleIndex = -1;
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
        // The new route has a different interactive set; re-scan coverage on it.
        void renderCoverage();
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
      // A SPECS_CHANGED refresh can add/remove specs; reset the cycle cursor so it
      // never points past the end of the new matched set.
      cycleIndex = -1;
      visibility = res.visibility ?? EMPTY_VISIBILITY;
      // Prefer the background's cross-project locale union for this origin; fall
      // back to deriving from the single manifest.
      availableLocales = res.locales?.length ? res.locales : localesFor(manifest);
      // Re-resolve the active locale: stored choice, else the project default.
      locale = pickLocale(await getLocale(), manifest?.settings?.defaultLocale);
      // Cache the corpus opt-in so rerender (sync, hot) can gate passive capture.
      corpusEnabled = await getCorpusEnabled();
      rerender();
      // A spec add/remove changes the documented set, so re-scan coverage too.
      await renderCoverage();
    }

    // Alt+Shift+N: flash the next matched-and-visible spec's element, wrapping to
    // the first after the last. No-op when the page has no matched specs. Flash
    // only (no tooltip pin); reduced-motion is honored by highlightElement itself.
    function cycleSpec(): void {
      const ids = session ? [...session.matches.keys()] : [];
      if (ids.length === 0) return;
      cycleIndex = (cycleIndex + 1) % ids.length;
      const el = session?.matches.get(ids[cycleIndex] as string);
      if (el) highlight(el);
    }

    // The set of page elements a spec currently documents, matched live against
    // the DOM over the page-scoped specs (same identity rule as GET_MATCHED_IDS,
    // independent of the visibility cascade). Coverage subtracts this from the
    // interactive elements to find the gaps.
    function matchedElementSet(): Set<Element> {
      const set = new Set<Element>();
      for (const s of specs) {
        if (!pageScopeAllows(s.fingerprint.pageUrl, location.href)) continue;
        const m = matchElement(s.fingerprint, document);
        if (m.el) set.add(m.el);
      }
      return set;
    }

    // Tear down the ghost-marker overlay. One place so every teardown site (empty
    // origin, coverage turned off, theme swap) drops the same state in lock-step.
    function destroyCoverageOverlay(): void {
      coverageOverlay?.destroy();
      coverageOverlay = null;
    }

    // True when some project (connected sidecar or local) can receive a spec for
    // this origin. Coverage — on-page markers AND the popup/side-panel summary —
    // only makes sense where authoring is possible, so both surfaces gate on this
    // one predicate. `GET_WRITE_TARGETS` is the same origin gate capture uses; a
    // not-ready background reads as "no project" (a later refresh re-checks).
    async function originServesProject(): Promise<boolean> {
      try {
        return (await fetchWriteTargets()).length > 0;
      } catch {
        return false;
      }
    }

    // (Re)scan for gaps and paint the ghost-marker overlay. No-op when coverage is
    // off. Reuses the cached per-origin ignore set (loaded when coverage turned on
    // and updated by ignoreGap). Called on toggle, refresh (SPECS_CHANGED), and
    // navigation; scroll/resize only reposition (no re-scan).
    //
    // On a page no project serves there is nowhere to author into, so paint nothing
    // (and tear down any overlay carried over from a project page we navigated off).
    async function renderCoverage(): Promise<void> {
      if (!coverageEnabled) return;
      // The master switch (SET_ENABLED) hides every Specpin surface, ghost markers
      // included. Tear down any overlay left over from the enabled state so turning
      // Specpin off on the page drops the markers in lock-step with the spec badges.
      if (!enabled) {
        destroyCoverageOverlay();
        return;
      }
      if (!(await originServesProject())) {
        destroyCoverageOverlay();
        return;
      }
      const { gaps } = findGaps(document, matchedElementSet(), coverageIgnore);
      coverageOverlay ??= new CoverageOverlay(document);
      coverageOverlay.render(gaps, {
        theme,
        keyFor: stableGapKey,
        actions: { onCapture: captureGap, onIgnore: ignoreGap },
      });
    }

    // Author a spec on a gap element: reuse the single-capture form + write path.
    // Honors the single-authoring-flow guard (never over a running tour / open form).
    async function captureGap(el: Element): Promise<void> {
      if (!tryBeginAuthoring()) return;
      try {
        openCaptureFormForElement(el, await fetchWriteTargets());
      } catch {
        endCapture(); // background not ready — release the flow instead of freezing
      }
    }

    // Dismiss a gap: append its stable key to the personal, cross-machine ignore
    // list (storage.sync), then re-scan so the marker + count drop immediately.
    async function ignoreGap(_el: Element, key: string): Promise<void> {
      try {
        await addCoverageIgnore(location.origin, key);
      } catch {
        return; // malformed origin (e.g. about:) — nothing to persist
      }
      coverageIgnore.add(key);
      await renderCoverage();
      // Tell any open panel/popup the gap set shrank so "Capture all gaps (X)"
      // re-queries GET_COVERAGE; SPECS_CHANGED is wrong here (no spec changed).
      browser.runtime.sendMessage({ type: "COVERAGE_CHANGED" } satisfies Message).catch(() => {});
    }

    // Alt+Shift+U: flip coverage mode, persist it, and paint or tear down the
    // overlay. Loads the personal ignore list on turn-on so dismissed gaps stay
    // hidden. Independent of the spec render session (separate Shadow host).
    async function toggleCoverage(): Promise<void> {
      coverageEnabled = !coverageEnabled;
      await setCoverageEnabled(coverageEnabled);
      if (coverageEnabled) {
        coverageIgnore = new Set(await getCoverageIgnore(location.origin));
        await renderCoverage();
      } else {
        destroyCoverageOverlay();
      }
    }

    // Reposition markers on scroll/resize without a re-scan (cheap; the gap set is
    // unchanged). Debounced; a no-op when coverage is off.
    let coverageRepositionTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleCoverageReposition = (): void => {
      if (!coverageEnabled || !coverageOverlay || coverageRepositionTimer) return;
      coverageRepositionTimer = setTimeout(() => {
        coverageRepositionTimer = null;
        coverageOverlay?.reposition();
      }, 100);
    };

    // How long the deep-link resolver keeps retrying for a late-rendering element
    // before it gives up (bounded so it never spins on a truly-absent element).
    const DEEP_LINK_MAX_ATTEMPTS = 20;
    const DEEP_LINK_RETRY_MS = 150;
    // Bumped on each resolve so a newer hashchange supersedes an in-flight retry.
    let deepLinkToken = 0;
    // The last spec id we resolved, so a hashchange that leaves `specpin=<id>`
    // untouched (a hash-routed SPA mutating an unrelated fragment part) does not
    // re-flash the element or re-open the panel. Cleared when the hash no longer
    // carries a specpin, so navigating away from then back to a shared link
    // resolves again.
    let lastResolvedDeepLink: string | null = null;

    // Resolve a `#specpin=<id>` deep link: scroll+flash the target element AND open
    // its side-panel card. Called after the first render and on hashchange.
    function resolveDeepLink(): void {
      const id = parseSpecLink(location.href);
      if (!id) {
        lastResolvedDeepLink = null;
        return;
      }
      // Already handled this id on a prior hashchange: skip so an app-driven
      // fragment change doesn't re-trigger the flash / panel open.
      if (id === lastResolvedDeepLink) return;
      lastResolvedDeepLink = id;
      attemptDeepLink(id, 0, ++deepLinkToken);
    }

    // One resolution attempt. Specs fetch async and the element can render late, so
    // resolve against the live render's matches first, then a fresh match against
    // the current DOM (session may be mid-rebuild after a hash change), and retry
    // within a bounded window before giving up. Orphaned target (known spec, no
    // element) opens the card + a not-found toast (Validation S1); an unknown id is
    // a graceful no-op.
    function attemptDeepLink(id: string, attempt: number, token: number): void {
      if (token !== deepLinkToken) return; // superseded by a newer hashchange
      const spec = specs.find((s) => s.id === id);
      const el =
        session?.matches.get(id) ?? (spec ? matchElement(spec.fingerprint, document).el : null);
      if (el) {
        highlight(el);
        openInPanel(id);
        return;
      }
      if (attempt < DEEP_LINK_MAX_ATTEMPTS) {
        window.setTimeout(() => attemptDeepLink(id, attempt + 1, token), DEEP_LINK_RETRY_MS);
        return;
      }
      if (spec) {
        openInPanel(id);
        showToast(t("spec.linkElementMissing"), document, theme);
      }
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

    // Claim the single authoring/overlay flow (capture, bulk, clone). Returns false
    // (a no-op) when a capture/edit form is open or a guide tour is running, so one
    // authoring flow can never start on top of another. Pair with endCapture(). The
    // toggle-picker capture path (startCapture) has its own semantics and does not
    // use this.
    function tryBeginAuthoring(): boolean {
      if (captureActive || guideActive) return false;
      captureActive = true;
      return true;
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
    // Shared by the hover-pick flow (startCapture), the right-click "Pin spec to
    // this element" path (pinElement), and clone (via `opts.prefill`, which seeds a
    // create-mode form with the source spec's content). The caller owns the
    // captureActive flag. All routes share ONE SAVE_SPEC onSubmit so they cannot
    // drift.
    function openCaptureFormForElement(
      el: Element,
      targets: WriteTarget[],
      opts?: { prefill?: Spec; defaultFile?: string },
    ): void {
      const fingerprint = captureFingerprint(el);
      form.open(fingerprint, {
        defaultFile: opts?.defaultFile ?? defaultFileName(),
        locales: availableLocales,
        defaultLocale: manifest?.settings?.defaultLocale ?? locale,
        prefill: opts?.prefill,
        // Empty-only Title seed from the element; ignored in edit/clone paths.
        seedTitle: suggestTitle(fingerprint),
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
        { theme },
      );
    }

    // Open the bulk-capture form on a set of elements. Assumes the caller already
    // claimed the authoring flow (captureActive). Empty set → release + bail. One
    // shared file + target for the whole batch; specs save sequentially with a
    // per-row result (a mid-batch failure keeps the succeeded rows).
    async function openBulkForm(elements: Element[]): Promise<void> {
      if (elements.length === 0) {
        endCapture();
        return;
      }
      let targets: WriteTarget[];
      try {
        targets = await fetchWriteTargets();
      } catch {
        endCapture(); // background not ready — release the flow instead of freezing
        return;
      }
      bulkForm.open(elements, {
        defaultFile: defaultFileName(),
        defaultLocale: manifest?.settings?.defaultLocale ?? locale,
        targets,
        theme,
        onSubmitAll: async (specs, file, connectionId) => {
          const results: BulkRowResult[] = [];
          for (const spec of specs) {
            const res = await sendToBackground<SaveSpecResult>({
              type: "SAVE_SPEC",
              file,
              spec,
              connectionId,
            });
            results.push({ ok: res.ok, error: res.errors?.[0] });
          }
          // All rows saved → the form closes itself; release the authoring flow so
          // the SPECS_CHANGED refresh (which re-scans coverage) can rerender.
          if (results.every((r) => r.ok)) endCapture();
          return results;
        },
        onCancel: endCapture,
      });
    }

    // Manual bulk capture: multi-select elements on the page, then fill one shared
    // form. Additive to single capture; never over a running tour / open form.
    function startBulkCapture(): void {
      if (!tryBeginAuthoring()) return;
      picker.startMulti((els) => void openBulkForm(els), endCapture, { theme });
    }

    // "Capture all gaps" bridge from the coverage view: scan the current gaps fresh
    // (respecting the personal ignore list) and open the bulk form pre-loaded. The
    // pre-check avoids a needless scan; tryBeginAuthoring claims after the await
    // (re-checking the flag once the async scan settled).
    async function captureAllGaps(): Promise<void> {
      if (captureActive || guideActive) return;
      const ignore = new Set(await getCoverageIgnore(location.origin));
      const { gaps } = findGaps(document, matchedElementSet(), ignore);
      if (gaps.length === 0) return;
      if (!tryBeginAuthoring()) return;
      await openBulkForm(gaps);
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
        onDelete: deleteSpecFlow,
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
          { hud: "relink", theme },
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
      // How the stored fingerprint was matching just before the re-pin, so a
      // recorded drift pair carries the motivating (orphaned/fuzzy) state.
      const prevMatch = matchElement(spec.fingerprint, document);
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
          if (result.ok) {
            // Feed the local drift corpus: a re-pin gives ground truth (old ->
            // correct new fingerprint). Fire-and-forget; the background gates on
            // the opt-in flag and ignores content-only edits (no element change).
            void sendToBackground({
              type: "RECORD_DRIFT",
              old: spec.fingerprint,
              new: updated.fingerprint,
              pageUrl: updated.fingerprint.pageUrl ?? spec.fingerprint.pageUrl ?? null,
              prevStrategy: prevMatch.strategy,
              prevConfidence: prevMatch.confidence,
              project: spec.project,
            });
            endCapture();
          }
          return result;
        },
        onCancel: endCapture,
      });
    }

    // Clone a spec's content onto a NEW element: run the picker, capture a fresh
    // fingerprint, then open the capture form in CREATE mode prefilled from the
    // source (provenance reset to an unreviewed draft by cloneFields; the id
    // re-derives from the title on save). Reuses the picker + form + SAVE_SPEC —
    // no new write path. Gated on the source being writable (the surfaces only
    // offer Duplicate then, mirroring Edit).
    function cloneSpecFlow(sourceSpecId: string): void {
      const source = specs.find((s) => s.id === sourceSpecId);
      if (!source) return;
      if (!tryBeginAuthoring()) return;
      picker.start(
        (el) => {
          fetchWriteTargets().then(
            (targets) =>
              openCaptureFormForElement(el, targets, {
                prefill: cloneFields(source),
                defaultFile: source._file ?? defaultFileName(),
              }),
            // Background not ready: release the authoring flow instead of freezing.
            endCapture,
          );
        },
        endCapture,
        { hud: "clone", theme },
      );
    }

    // Confirm loop: affirm that a scored match resolved to the right element. Feeds
    // a supervised confirmation (new === old) into the local corpus. The background
    // gates on the opt-in flag; this is only wired when corpusEnabled anyway.
    function confirmMatch(specId: string): void {
      const spec = specs.find((s) => s.id === specId);
      if (!spec) return;
      const match = matchElement(spec.fingerprint, document);
      void sendToBackground({
        type: "RECORD_DRIFT",
        old: spec.fingerprint,
        new: spec.fingerprint,
        pageUrl: spec.fingerprint.pageUrl ?? null,
        prevStrategy: match.strategy,
        prevConfidence: match.confidence,
        project: spec.project,
        confirmed: true,
      });
    }

    // Delete a spec, addressed by id. Runs a destructive confirm in the page (in
    // its own token-bearing shadow host so the modal matches the theme), then
    // routes DELETE_SPEC by the spec's connectionId (manual:<batchId> for local).
    // Both the tooltip Delete button (via the render session) and the side panel
    // (via DELETE_SPEC_HERE) route here, so the confirm + origin routing happen in
    // the page context. On success the background broadcasts SPECS_CHANGED, which
    // refreshes + rerenders (tearing down the pinned tooltip for the removed spec).
    async function deleteSpecFlow(specId: string): Promise<void> {
      // One authoring flow at a time: skip while a capture/edit form is open, so a
      // confirm cannot race the form (mirror openEditForm).
      if (captureActive) return;
      const spec = specs.find((s) => s.id === specId);
      if (!spec) return;
      const { host, shadow } = createShadowHost(
        document,
        "specpin-confirm-host",
        SHADOW_PREAMBLE,
        theme,
      );
      // The Git-recovery hint only applies to sidecar specs (committed to
      // .specs/); a local spec lives in storage.local, so give it its own message.
      const confirmMessage = isLocalConnectionId(spec.connectionId ?? "")
        ? t("spec.deleteConfirmLocal")
        : t("spec.deleteConfirm");
      let ok: boolean;
      try {
        ok = await confirmDialog({
          message: confirmMessage,
          okLabel: t("common.delete"),
          danger: true,
          root: shadow,
        });
      } finally {
        host.remove();
      }
      if (!ok) return;
      const result = await sendToBackground<SaveSpecResult>({
        type: "DELETE_SPEC",
        id: spec.id,
        connectionId: spec.connectionId,
      });
      if (!result.ok) {
        // A conflict already reloaded + broadcast SPECS_CHANGED (the view refreshes
        // itself); tell the user why nothing was deleted rather than a raw error.
        const msg = result.conflict
          ? t("spec.deleteConflict")
          : t("spec.deleteFailed", { error: result.errors?.[0] ?? "" });
        showToast(msg, document, theme);
      }
    }

    async function toggleEnabled(): Promise<void> {
      await sendToBackground({ type: "SET_ENABLED", enabled: !enabled });
      await refresh();
    }

    const helpOverlay = createHelpOverlay(document);

    registerKeyboard(window, {
      onToggleEnabled: () => void toggleEnabled(),
      onCycleMode: cycleMode,
      onToggleCapture: () => void startCapture(),
      onToggleGuide: toggleGuide,
      onCycleSpec: cycleSpec,
      onToggleCoverage: () => void toggleCoverage(),
      onToggleHelp: () => helpOverlay.toggle(theme),
    });

    // Coverage markers are document-absolute, but sticky/reflowed elements shift;
    // reposition (no re-scan) on scroll/resize while coverage is on.
    window.addEventListener("scroll", scheduleCoverageReposition, true);
    window.addEventListener("resize", scheduleCoverageReposition);

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
    // A hashchange can also be a new `#specpin=<id>` deep link (shared or navigated
    // to in-app): resolve it to a flash + panel open. onNavigate's re-render and
    // this resolver both fire; the resolver's bounded retry rides out the re-render.
    window.addEventListener("hashchange", resolveDeepLink);
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
        case "START_BULK_CAPTURE":
          startBulkCapture();
          break;
        case "START_BULK_CAPTURE_GAPS":
          void captureAllGaps();
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
        case "CLONE_SPEC":
          cloneSpecFlow(message.specId);
          break;
        case "DELETE_SPEC_HERE":
          void deleteSpecFlow(message.specId);
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
          // The overlay bakes its theme at host creation, so recreate it to switch.
          if (coverageEnabled) {
            destroyCoverageOverlay();
            void renderCoverage();
          }
          break;
        case "SET_BADGE_NUMBERING":
          // Options already persisted the choice; re-render so on-page badges
          // switch between "S" and their reading-order number.
          badgeNumbering = message.on;
          rerender();
          break;
        case "SET_BADGE_COLOR":
          // Options already persisted the choice; re-render so on-page badges
          // repaint in the chosen color (or the default teal when null).
          badgeColor = message.color;
          rerender();
          break;
        case "SET_UI_LOCALE":
          // UI-chrome language changed in Options; re-init i18n and re-render so
          // renderers' chrome (badges, buttons, summaries) switches language.
          initI18n(resolveUiLocale(message.locale));
          rerender();
          // Marker action labels come from t(); repaint them in the new language.
          void renderCoverage();
          break;
        case "HIGHLIGHT_ELEMENT": {
          // Resolve the spec id against the current render's matches and frame it.
          const el = session?.matches.get(message.specId);
          if (el) highlight(el);
          break;
        }
        case "GET_MATCHED_IDS": {
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
          // Page scope is spec IDENTITY, not the visibility cascade: a spec pinned
          // on another route does not belong on this page, so exclude it here too
          // (keeps the "this page" list in step with what actually renders).
          //
          // The same single pass also builds `report`: one entry per page-scoped
          // spec carrying its match tier (matched flag, strategy, confidence,
          // anchor, needsReview) plus the stored-fingerprint anchor strength, so
          // the surfaces render match health (badges, orphaned list, fragile scan)
          // without a second match pass. `ids` stays the matched subset.
          if (!enabled) return Promise.resolve({ ids: [], report: [] });
          const report: MatchReportEntry[] = [];
          for (const s of specs) {
            if (!pageScopeAllows(s.fingerprint.pageUrl, location.href)) continue;
            const m = matchElement(s.fingerprint, document);
            report.push({
              id: s.id,
              matched: !!m.el,
              strategy: m.strategy,
              confidence: m.confidence,
              anchor: m.anchor,
              needsReview: m.needsReview,
              strength: anchorStrength(s.fingerprint),
            });
          }
          return Promise.resolve({
            ids: report.filter((e) => e.matched).map((e) => e.id),
            report,
          });
        }
        case "GET_COVERAGE": {
          // Scan the live DOM for undocumented interactive elements. Loads the
          // personal ignore list fresh so the count matches the on-page markers
          // even when coverage mode has not been toggled on this session. Returns
          // a Promise (the sendMessage response), like GET_MATCHED_IDS.
          return (async (): Promise<CoverageCounts | null> => {
            // The master switch hides every surface (mirrors GET_MATCHED_IDS): report
            // nothing so the popup/side-panel summary stays hidden while Specpin is
            // off, matching the on-page markers.
            if (!enabled) return null;
            // Same gate as the on-page overlay: with no project serving this origin
            // there is nowhere to author into, so report nothing — the surface hides
            // the summary, hint, and "Capture all gaps" button on a null result.
            if (!(await originServesProject())) return null;
            const ignore = new Set(await getCoverageIgnore(location.origin));
            const scan = findGaps(document, matchedElementSet(), ignore);
            return {
              interactive: scan.interactive,
              documented: scan.documented,
              gaps: scan.gaps.length,
              truncated: scan.truncated,
            };
          })();
        }
      }
    });

    // Restore the persisted display-mode override, forced theme, dragged pill
    // position, and UI-chrome language before the first render so renderers
    // translate and a reloaded page honors them instead of resetting. These reads
    // are independent, so fetch them concurrently (content init runs on every page).
    const [
      storedMode,
      storedTheme,
      storedUiLocale,
      storedLauncherPosition,
      storedBadgeNumbering,
      storedBadgeColor,
      storedCoverageEnabled,
    ] = await Promise.all([
      getDisplayMode(),
      getTheme(),
      getUiLocale(),
      getLauncherPosition(),
      getBadgeNumbering(),
      getBadgeColor(),
      getCoverageEnabled(),
    ]);
    forcedMode = storedMode;
    theme = storedTheme;
    launcherPosition = storedLauncherPosition;
    badgeNumbering = storedBadgeNumbering;
    badgeColor = storedBadgeColor;
    // Restore coverage mode so a reload keeps ghost markers on; load the personal
    // ignore list first so dismissed gaps stay hidden on the first scan.
    coverageEnabled = storedCoverageEnabled;
    if (coverageEnabled) coverageIgnore = new Set(await getCoverageIgnore(location.origin));
    initI18n(resolveUiLocale(storedUiLocale));
    await refresh();
    // Seed after the first render so a stray early mutation doesn't trigger a
    // redundant re-render for the URL we just rendered.
    lastRenderedUrl = location.href;
    // Resolve a `#specpin=<id>` deep link present on initial load (a shared link
    // opened cold). The bounded retry inside covers a late-rendering element.
    resolveDeepLink();
  },
});
