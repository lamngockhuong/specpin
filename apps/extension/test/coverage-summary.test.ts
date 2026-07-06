import { beforeEach, describe, expect, it } from "vitest";
import { initI18n } from "../src/i18n/index.js";
import type { CoverageCounts } from "../src/shared/messaging.js";
import { renderCoverageSummary } from "../src/shared/surface-renderers.js";

const counts = (over: Partial<CoverageCounts> = {}): CoverageCounts => ({
  interactive: 10,
  documented: 6,
  gaps: 4,
  truncated: false,
  ...over,
});

let container: HTMLElement;
beforeEach(() => {
  initI18n("en");
  document.body.innerHTML = `<div id="coverage" hidden></div>`;
  container = document.getElementById("coverage") as HTMLElement;
});

describe("renderCoverageSummary", () => {
  it("shows the interactive/documented/gaps counts when enabled", () => {
    renderCoverageSummary(container, counts(), true);
    expect(container.hidden).toBe(false);
    const line = container.querySelector(".coverage-line")?.textContent ?? "";
    expect(line).toContain("10");
    expect(line).toContain("6");
    expect(line).toContain("4");
  });

  it("hides when Specpin is off", () => {
    renderCoverageSummary(container, counts(), false);
    expect(container.hidden).toBe(true);
    expect(container.children.length).toBe(0);
  });

  it("hides when coverage is unknown (no content script)", () => {
    renderCoverageSummary(container, null, true);
    expect(container.hidden).toBe(true);
  });

  it("hides when the page has no interactive elements", () => {
    renderCoverageSummary(container, counts({ interactive: 0, documented: 0, gaps: 0 }), true);
    expect(container.hidden).toBe(true);
  });
});
