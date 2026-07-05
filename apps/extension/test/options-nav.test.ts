import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initOptionsNav } from "../src/entrypoints/options/nav.js";
import { must } from "./test-utils.js";

// Minimal skeleton of the options page: the rail items, the Spec pane with its
// segmented control and two sub-panes, plus one other pane. Only the hooks
// nav.ts reads (classes, ids, data-attrs) are present.
function mount(): void {
  document.body.innerHTML = `
    <nav>
      <button class="nav-item" data-pane="spec"></button>
      <button class="nav-item" data-pane="appearance"></button>
    </nav>
    <section class="pane" id="pane-spec">
      <div class="seg" role="tablist">
        <button class="seg-btn" data-spec-tab="live" aria-selected="true" tabindex="0"></button>
        <button class="seg-btn" data-spec-tab="manual" aria-selected="false" tabindex="-1"></button>
      </div>
      <div class="subpane" id="spec-live"></div>
      <div class="subpane" id="spec-manual"></div>
    </section>
    <section class="pane" id="pane-appearance"></section>`;
}

const pane = (id: string) => must(document.getElementById(id));
const segBtn = (tab: string) =>
  must(document.querySelector<HTMLElement>(`.seg-btn[data-spec-tab="${tab}"]`));
const navItem = (p: string) =>
  must(document.querySelector<HTMLElement>(`.nav-item[data-pane="${p}"]`));

function key(el: Element, k: string): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
}

beforeEach(() => {
  location.hash = "";
  mount();
});

afterEach(() => {
  document.body.innerHTML = "";
  location.hash = "";
});

describe("options nav routing", () => {
  it("defaults to the Spec pane on the live sub-tab when the hash is empty", () => {
    initOptionsNav();
    expect(pane("pane-spec").classList.contains("active")).toBe(true);
    expect(pane("spec-live").classList.contains("active")).toBe(true);
    expect(pane("spec-manual").classList.contains("active")).toBe(false);
    expect(navItem("spec").getAttribute("aria-current")).toBe("page");
  });

  it("selects the manual sub-tab from #spec/manual", () => {
    location.hash = "#spec/manual";
    initOptionsNav();
    expect(pane("spec-manual").classList.contains("active")).toBe(true);
    expect(pane("spec-live").classList.contains("active")).toBe(false);
    expect(segBtn("manual").getAttribute("aria-selected")).toBe("true");
    expect(segBtn("live").getAttribute("aria-selected")).toBe("false");
  });

  it("bare #spec falls back to the live sub-tab", () => {
    location.hash = "#spec";
    initOptionsNav();
    expect(pane("spec-live").classList.contains("active")).toBe(true);
  });

  it("routes to a non-spec pane and clears its sub-tab state", () => {
    location.hash = "#appearance";
    initOptionsNav();
    expect(pane("pane-appearance").classList.contains("active")).toBe(true);
    expect(pane("pane-spec").classList.contains("active")).toBe(false);
    expect(navItem("appearance").getAttribute("aria-current")).toBe("page");
    expect(navItem("spec").hasAttribute("aria-current")).toBe(false);
  });

  it("falls back to Spec/live for an unknown hash (incl. dropped legacy #manual)", () => {
    location.hash = "#manual";
    initOptionsNav();
    expect(pane("pane-spec").classList.contains("active")).toBe(true);
    expect(pane("spec-live").classList.contains("active")).toBe(true);
  });

  it("maintains roving tabindex so only the selected tab is in the Tab order", () => {
    location.hash = "#spec/manual";
    initOptionsNav();
    expect(segBtn("manual").tabIndex).toBe(0);
    expect(segBtn("live").tabIndex).toBe(-1);
  });

  it("a seg-button click points the hash at that sub-tab", () => {
    initOptionsNav();
    segBtn("manual").click();
    expect(location.hash).toBe("#spec/manual");
  });

  it("a rail click points the hash at that pane", () => {
    initOptionsNav();
    navItem("appearance").click();
    expect(location.hash).toBe("#appearance");
  });

  it("reacts to hashchange after load", () => {
    initOptionsNav();
    location.hash = "#spec/manual";
    window.dispatchEvent(new Event("hashchange"));
    expect(pane("spec-manual").classList.contains("active")).toBe(true);
  });

  it("moves selection with arrow keys and wraps at the ends", () => {
    initOptionsNav();
    key(segBtn("live"), "ArrowRight");
    expect(location.hash).toBe("#spec/manual");
    key(segBtn("manual"), "ArrowRight");
    expect(location.hash).toBe("#spec/live"); // wrapped
    key(segBtn("live"), "End");
    expect(location.hash).toBe("#spec/manual");
    key(segBtn("manual"), "Home");
    expect(location.hash).toBe("#spec/live");
  });
});
