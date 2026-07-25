// Opt-in content-script navigation recorder for Track B auto-capture. Watches
// SPA route changes + full-page loads and, for each real navigation, derives a
// candidate screen-transition via B1's pure deriveTransition/generalizeUrl. DOM
// observation only here -- no storage, no messaging; the caller (content.ts)
// wires `onTransition` to a RECORD_CAPTURED_TRANSITION send and owns start/stop
// against the recordMode opt-in flag.
//
// Cross-world caveat: a content script runs in an isolated JS world, so
// monkey-patching `history.pushState`/`replaceState` here is NOT guaranteed to
// intercept the host page's OWN pushState calls (the exact limitation already
// documented on entrypoints/content.ts's onNavigate, which is why that code
// watches `location.href` instead of patching History). So this module never
// relies on the patch alone: popstate/hashchange (real DOM events, dispatched
// to every world watching this window) plus a MutationObserver treating "the
// DOM just changed" as "go check the URL again" are the signals that actually
// catch a same-document route push in a real browser. The patch is still
// applied (reversibly, satisfying the phase's explicit ask) -- it is cheap,
// harmless, and it is what a same-realm caller or the Navigation API path
// below hits directly. Where supported, the Navigation API's `navigate` event
// is a genuine event dispatch (not a function override) and so is preferred:
// it reaches this module even in the isolated-world case.

import type { CapturedScreenCandidate } from "../shared/messaging.js";
import { type CapturedTransition, deriveTransition } from "./derive-transition.js";
import { generalizeUrl } from "./url-generalize.js";

export type OnCapturedTransition = (
  transition: CapturedTransition,
  from: CapturedScreenCandidate,
  to: CapturedScreenCandidate,
) => void;

/** Loose shape of the experimental Navigation API's `navigate` event -- typed
 *  locally (not from lib.dom.d.ts, which may not declare it yet) so feature
 *  detection stays type-safe without an `any` escape. */
interface NavigateEventLike {
  destination?: { url?: string };
}
interface NavigationApiLike {
  addEventListener(type: "navigate", listener: (event: NavigateEventLike) => void): void;
  removeEventListener(type: "navigate", listener: (event: NavigateEventLike) => void): void;
}

/** Persists the last-seen URL across a full-page reload, scoped to this
 *  browsing context (tab) + origin by sessionStorage itself (not localStorage,
 *  which would leak across tabs). A fresh tab/profile has no entry, so its
 *  first observed navigation correctly has no `from` (accepted gap -- see the
 *  phase's cross-load risk note) rather than inheriting another tab's history. */
const PREV_URL_KEY = "specpin:navRecorder:prevUrl";

let active = false;
let onCaptured: OnCapturedTransition | null = null;
let originalPushState: History["pushState"] | null = null;
let originalReplaceState: History["replaceState"] | null = null;
let mutationObserver: MutationObserver | null = null;
let navigationApi: NavigationApiLike | null = null;
let onNavigateEvent: ((event: NavigateEventLike) => void) | null = null;

function readPrevUrl(): string | null {
  try {
    return sessionStorage.getItem(PREV_URL_KEY);
  } catch {
    return null; // storage disabled/blocked (private mode, sandboxed frame)
  }
}

function writePrevUrl(url: string): void {
  try {
    sessionStorage.setItem(PREV_URL_KEY, url);
  } catch {
    // Non-fatal: without persistence every navigation reads as "first nav" (no
    // `from`), so nothing is ever emitted -- a safe, silent degradation.
  }
}

/** Turn one generalized side of a navigation into a display candidate: a
 *  humanized name derived from the glob's literal segments, so a not-yet-
 *  existing Screen has something better than a bare id to show in the
 *  ghost-edge review (B3). */
function candidateFor(url: string): CapturedScreenCandidate {
  const { screenId, urlGlob } = generalizeUrl(url);
  return { id: screenId, urlGlob, name: humanize(screenId) };
}

function humanize(screenId: string): string {
  if (screenId === "root") return "Home";
  const words = screenId.split("-").filter(Boolean);
  if (words.length === 0) return screenId;
  return words.map((w) => (w === "star" ? "*" : (w[0] ?? "").toUpperCase() + w.slice(1))).join(" ");
}

/** Process one observed navigation target. Idempotent no-op when the URL did
 *  not actually change (a MutationObserver firing on an unrelated mutation, or
 *  a redundant signal from a second detection mechanism for the same nav). */
function handleUrlChange(nextUrl: string): void {
  const prevUrl = readPrevUrl();
  writePrevUrl(nextUrl);
  if (!prevUrl || prevUrl === nextUrl) return; // no `from` yet, or not a real change
  const transition = deriveTransition(prevUrl, nextUrl);
  if (!transition) return; // self-navigation (same generalized screen)
  onCaptured?.(transition, candidateFor(prevUrl), candidateFor(nextUrl));
}

function onLocationSignal(): void {
  handleUrlChange(location.href);
}

function getNavigationApi(): NavigationApiLike | null {
  const withNav = window as unknown as { navigation?: NavigationApiLike };
  return withNav.navigation ?? null;
}

/** Start observing navigation and deriving candidate transitions. Idempotent:
 *  calling this while already active is a no-op, so it can never double-patch
 *  History or attach a second listener set. Also checks the CURRENT url
 *  against whatever `prevUrl` is already persisted, so a full-page
 *  navigation/reload that swapped out the whole content-script instance still
 *  derives its edge (this is the "cross-load" case the phase calls out). */
export function startRecorder(onTransition: OnCapturedTransition): void {
  if (active) return;
  active = true;
  onCaptured = onTransition;

  // Store the raw (unbound) function references -- not a `.bind()` copy -- so
  // `stopRecorder` can restore `history.pushState` to something reference-equal
  // to what a caller captured beforehand (a test, or another patcher's restore
  // check). Invoked below via `.apply(history, ...)` instead.
  originalPushState = history.pushState;
  originalReplaceState = history.replaceState;
  history.pushState = ((...args: Parameters<History["pushState"]>) => {
    originalPushState?.apply(history, args);
    onLocationSignal();
  }) as History["pushState"];
  history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
    originalReplaceState?.apply(history, args);
    onLocationSignal();
  }) as History["replaceState"];

  window.addEventListener("popstate", onLocationSignal);
  window.addEventListener("hashchange", onLocationSignal);

  // A same-document route push the patch above can't observe cross-realm (see
  // the module doc comment) still mutates the DOM as the new route mounts; a
  // mutation is the one signal guaranteed to reach this isolated-world
  // observer, so treat it as "check the URL again" -- handleUrlChange's own
  // no-op guard absorbs mutations that are not a real navigation.
  mutationObserver = new MutationObserver(onLocationSignal);
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true });

  // Prefer the Navigation API where supported: `navigate` is a genuine event
  // dispatch (reaches this module even across the isolated-world boundary),
  // unlike the History patch above. `destination.url` is the committing target
  // (reading `location.href` inside this handler could still show the OLD url,
  // since the event fires before the navigation commits).
  navigationApi = getNavigationApi();
  if (navigationApi) {
    onNavigateEvent = (event) => {
      const nextUrl = event.destination?.url;
      if (typeof nextUrl === "string") handleUrlChange(nextUrl);
    };
    navigationApi.addEventListener("navigate", onNavigateEvent);
  }

  onLocationSignal();
}

/** Stop observing: restore the original History methods and remove every
 *  listener. Idempotent -- calling this twice, or before ever starting, is a
 *  safe no-op, so content.ts can call it unconditionally on a flag flip. */
export function stopRecorder(): void {
  if (!active) return;
  active = false;
  onCaptured = null;

  if (originalPushState) history.pushState = originalPushState;
  if (originalReplaceState) history.replaceState = originalReplaceState;
  originalPushState = null;
  originalReplaceState = null;

  window.removeEventListener("popstate", onLocationSignal);
  window.removeEventListener("hashchange", onLocationSignal);

  mutationObserver?.disconnect();
  mutationObserver = null;

  if (navigationApi && onNavigateEvent)
    navigationApi.removeEventListener("navigate", onNavigateEvent);
  navigationApi = null;
  onNavigateEvent = null;
}

/** Test/diagnostic-only: whether the recorder is currently attached. */
export function isRecorderActive(): boolean {
  return active;
}
