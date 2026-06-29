import { afterEach, describe, expect, it } from "vitest";
import { anyDialogOpen, confirmDialog, promptDialog } from "../src/shared/dialog.js";
import { must } from "./test-utils.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

function backdrop(): HTMLElement {
  return must(document.querySelector(".sp-dlg-backdrop")) as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = "";
  document.head.querySelector("style[data-sp-dialog]")?.remove();
  // No dialog should outlive its test (would bleed the shared open-set across files).
  expect(anyDialogOpen()).toBe(false);
});

describe("promptDialog", () => {
  it("resolves the trimmed input value on confirm", async () => {
    const p = promptDialog({ message: "Code?" });
    (must(document.querySelector(".sp-dlg-input")) as HTMLInputElement).value = "  ja  ";
    must(backdrop().querySelector(".sp-dlg-btn.primary")).dispatchEvent(
      new Event("click", { bubbles: true }),
    );
    expect(await p).toBe("ja");
  });

  it("resolves null on cancel", async () => {
    const p = promptDialog({ message: "Code?" });
    must(backdrop().querySelector(".sp-dlg-btn:not(.primary)")).dispatchEvent(
      new Event("click", { bubbles: true }),
    );
    expect(await p).toBeNull();
  });

  it("seeds the initial value and placeholder", async () => {
    const p = promptDialog({ message: "URL?", initial: "https://x", placeholder: "https://" });
    const input = must(document.querySelector(".sp-dlg-input")) as HTMLInputElement;
    expect(input.value).toBe("https://x");
    expect(input.placeholder).toBe("https://");
    must(backdrop().querySelector(".sp-dlg-btn:not(.primary)")).dispatchEvent(
      new Event("click", { bubbles: true }),
    );
    await p;
  });
});

describe("confirmDialog", () => {
  it("resolves true on confirm and false on cancel", async () => {
    const ok = confirmDialog({ message: "Sure?" });
    must(backdrop().querySelector(".sp-dlg-btn.primary")).dispatchEvent(
      new Event("click", { bubbles: true }),
    );
    expect(await ok).toBe(true);

    const no = confirmDialog({ message: "Sure?" });
    must(backdrop().querySelector(".sp-dlg-btn:not(.primary)")).dispatchEvent(
      new Event("click", { bubbles: true }),
    );
    expect(await no).toBe(false);
  });

  it("styles the confirm button as danger when requested", async () => {
    const p = confirmDialog({ message: "Delete?", danger: true });
    expect(backdrop().querySelector(".sp-dlg-btn.danger")).not.toBeNull();
    must(backdrop().querySelector(".sp-dlg-btn.danger")).dispatchEvent(
      new Event("click", { bubbles: true }),
    );
    await p;
  });
});

describe("anyDialogOpen", () => {
  it("is true only while a dialog is mounted", async () => {
    expect(anyDialogOpen()).toBe(false);
    const p = confirmDialog({ message: "?" });
    expect(anyDialogOpen()).toBe(true);
    must(backdrop().querySelector(".sp-dlg-btn.primary")).dispatchEvent(
      new Event("click", { bubbles: true }),
    );
    await p;
    expect(anyDialogOpen()).toBe(false);
  });

  it("Escape closes the dialog and resolves cancel", async () => {
    const p = promptDialog({ message: "?" });
    expect(anyDialogOpen()).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(await p).toBeNull();
    expect(anyDialogOpen()).toBe(false);
    await flush();
  });

  it("self-heals when its host is torn down without resolving", async () => {
    // A dialog mounted into a shadow root whose host is then removed (e.g. the
    // capture form re-opens) must not wedge `anyDialogOpen()` forever.
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const p = promptDialog({ message: "?", root: shadow });
    expect(anyDialogOpen()).toBe(true);
    host.remove(); // detaches the dialog backdrop without resolving the promise
    expect(anyDialogOpen()).toBe(false); // pruned + cancelled
    expect(await p).toBeNull();
  });
});
