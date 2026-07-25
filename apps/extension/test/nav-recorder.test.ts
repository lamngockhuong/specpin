import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isRecorderActive, startRecorder, stopRecorder } from "../src/content/nav-recorder.js";

beforeEach(() => {
  stopRecorder();
  sessionStorage.clear();
});

afterEach(() => {
  stopRecorder();
});

describe("startRecorder", () => {
  it("skips the first navigation after enabling (no prior `from`)", () => {
    history.replaceState(null, "", "/start");
    const onTransition = vi.fn();
    startRecorder(onTransition);
    expect(onTransition).not.toHaveBeenCalled();
  });

  it("derives and emits on a pushState navigation", () => {
    history.replaceState(null, "", "/start");
    const onTransition = vi.fn();
    startRecorder(onTransition);
    history.pushState(null, "", "/next");
    expect(onTransition).toHaveBeenCalledTimes(1);
    const [transition, from, to] = onTransition.mock.calls[0] as [
      { from: string; to: string },
      { urlGlob: string; id: string },
      { urlGlob: string; id: string },
    ];
    expect(from.urlGlob).toBe("/start");
    expect(to.urlGlob).toBe("/next");
    expect(transition.from).toBe(from.id);
    expect(transition.to).toBe(to.id);
  });

  it("derives and emits on a replaceState navigation too", () => {
    history.replaceState(null, "", "/start");
    const onTransition = vi.fn();
    startRecorder(onTransition);
    history.replaceState(null, "", "/swapped");
    expect(onTransition).toHaveBeenCalledTimes(1);
  });

  it("does not emit for a self-navigation (query-only change on the same screen)", () => {
    history.replaceState(null, "", "/orders/1?tab=a");
    const onTransition = vi.fn();
    startRecorder(onTransition);
    history.pushState(null, "", "/orders/1?tab=b");
    expect(onTransition).not.toHaveBeenCalled();
  });

  it("also derives on a popstate event (back/forward), independent of the History patch", () => {
    history.replaceState(null, "", "/start");
    // Captured BEFORE startRecorder patches history.pushState, so calling it
    // directly bypasses the patch entirely -- isolating the popstate LISTENER
    // path from the patch path.
    const nativePushState = history.pushState.bind(history);
    const onTransition = vi.fn();
    startRecorder(onTransition);
    nativePushState(null, "", "/via-popstate");
    window.dispatchEvent(new Event("popstate"));
    expect(onTransition).toHaveBeenCalledTimes(1);
    const [, , to] = onTransition.mock.calls[0] as [unknown, unknown, { urlGlob: string }];
    expect(to.urlGlob).toBe("/via-popstate");
  });

  it("is idempotent: a second start while already active does not double-attach", () => {
    history.replaceState(null, "", "/start");
    const first = vi.fn();
    const second = vi.fn();
    startRecorder(first);
    startRecorder(second); // no-op: already active, keeps the first callback
    history.pushState(null, "", "/next");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("reports isRecorderActive() across the start/stop lifecycle", () => {
    expect(isRecorderActive()).toBe(false);
    startRecorder(() => {});
    expect(isRecorderActive()).toBe(true);
    stopRecorder();
    expect(isRecorderActive()).toBe(false);
  });
});

describe("stopRecorder", () => {
  it("restores the original History methods (patch is reversible)", () => {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    startRecorder(() => {});
    expect(history.pushState).not.toBe(originalPushState);
    expect(history.replaceState).not.toBe(originalReplaceState);
    stopRecorder();
    expect(history.pushState).toBe(originalPushState);
    expect(history.replaceState).toBe(originalReplaceState);
  });

  it("stops emitting after being called (listeners detached, no leak)", () => {
    history.replaceState(null, "", "/start");
    const onTransition = vi.fn();
    startRecorder(onTransition);
    history.pushState(null, "", "/mid"); // one real nav while active
    stopRecorder();
    history.pushState(null, "", "/after-stop");
    window.dispatchEvent(new Event("popstate"));
    expect(onTransition).toHaveBeenCalledTimes(1);
  });

  it("is a safe no-op before ever starting, and when called twice", () => {
    expect(() => stopRecorder()).not.toThrow();
    startRecorder(() => {});
    stopRecorder();
    expect(() => stopRecorder()).not.toThrow();
  });
});

describe("MutationObserver fallback", () => {
  it("still derives a same-document route push that bypasses the History patch", async () => {
    history.replaceState(null, "", "/start");
    // Simulates the documented cross-world limitation: a "page" navigation that
    // never goes through this module's patched pushState.
    const nativePushState = history.pushState.bind(history);
    const onTransition = vi.fn();
    startRecorder(onTransition);
    nativePushState(null, "", "/via-mutation");
    document.body.appendChild(document.createElement("div"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onTransition).toHaveBeenCalledTimes(1);
  });
});
