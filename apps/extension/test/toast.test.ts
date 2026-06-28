import { afterEach, describe, expect, it, vi } from "vitest";
import { showToast } from "../src/content/toast.js";

afterEach(() => {
  document.getElementById("specpin-toast-host")?.remove();
  vi.useRealTimers();
});

describe("showToast", () => {
  it("renders the message in its own shadow host", () => {
    showToast("No spec on this element.");
    const host = document.getElementById("specpin-toast-host");
    expect(host).not.toBeNull();
    expect(host?.shadowRoot?.querySelector(".toast")?.textContent).toBe("No spec on this element.");
  });

  it("replaces the current pill instead of stacking", () => {
    showToast("first");
    showToast("second");
    expect(document.querySelectorAll("#specpin-toast-host").length).toBe(1);
    const host = document.getElementById("specpin-toast-host");
    expect(host?.shadowRoot?.querySelector(".toast")?.textContent).toBe("second");
  });

  it("self-cleans after it fades", () => {
    vi.useFakeTimers();
    showToast("bye");
    expect(document.getElementById("specpin-toast-host")).not.toBeNull();
    vi.advanceTimersByTime(2200 + 220 + 10);
    expect(document.getElementById("specpin-toast-host")).toBeNull();
  });
});
