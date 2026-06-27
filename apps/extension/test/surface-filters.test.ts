import { beforeEach, describe, expect, it } from "vitest";
import { renderFilters } from "../src/shared/surface-renderers.js";
import type { FacetInventory, FacetItem } from "../src/shared/visibility.js";

// The Filter block must not show empty noise: it is hidden when Specpin is off or
// when there is nothing to filter on this page (no project / no specs), and the
// "This page" hide toggle only appears when there are specs to hide or the page
// is already hidden (so it stays reversible).

function setupDom(): HTMLElement {
  document.body.innerHTML = `<div id="filters"></div>`;
  return document.getElementById("filters") as HTMLElement;
}

const empty: FacetInventory = { tags: [], files: [], specs: [] };

function tag(label: string): FacetItem {
  return {
    key: `tag:${label}`,
    label,
    count: 1,
    visible: true,
    teamHidden: false,
    overridden: false,
  };
}

const withTags: FacetInventory = { tags: [tag("internal")], files: [], specs: [] };

const noop = (): void => {};
const baseOpts = { path: "/x", onToggle: noop, onReset: noop };

describe("renderFilters visibility gating", () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = setupDom();
  });

  it("hides the whole block when there is nothing to filter (no project / no specs)", () => {
    renderFilters(container, empty, { ...baseOpts, enabled: true, pageHidden: false });
    expect(container.hidden).toBe(true);
    expect(container.textContent).toBe("");
  });

  it("hides the whole block when Specpin is off, even with cached facets", () => {
    renderFilters(container, withTags, { ...baseOpts, enabled: false, pageHidden: false });
    expect(container.hidden).toBe(true);
  });

  it("shows facets and the This page toggle when specs exist", () => {
    renderFilters(container, withTags, { ...baseOpts, enabled: true, pageHidden: false });
    expect(container.hidden).toBe(false);
    expect(container.textContent).toContain("This page");
    expect(container.textContent).toContain("internal");
  });

  it("keeps the block when the page is already hidden so the toggle stays reversible", () => {
    renderFilters(container, empty, { ...baseOpts, enabled: true, pageHidden: true });
    expect(container.hidden).toBe(false);
    expect(container.textContent).toContain("This page");
  });

  it("does not show the This page toggle alone when no specs and not hidden", () => {
    renderFilters(container, empty, { ...baseOpts, enabled: true, pageHidden: false });
    expect(container.textContent).not.toContain("This page");
  });
});
