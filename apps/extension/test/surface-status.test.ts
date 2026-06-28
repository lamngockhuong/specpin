import { beforeEach, describe, expect, it } from "vitest";
import type { ManualBatchSummary } from "../src/shared/connection-types.js";
import type { ConnectionStatus, StatusResult } from "../src/shared/messaging.js";
import { renderProjects, renderStatus } from "../src/shared/surface-renderers.js";

// The header carries only the informational states (Not configured / No project
// for this page) and the page-total spec count; per-project connection health
// and naming live in the project list (renderProjects), origin-scoped so a
// project bound to another domain never appears on a page it does not serve.

function setupDom(): void {
  document.body.innerHTML = `
    <div class="row status"><span><span id="status-text"></span></span></div>
    <input id="enabled" type="checkbox" />
    <span id="count"></span>
    <ul id="projects"></ul>
  `;
}

function conn(partial: Partial<ConnectionStatus>): ConnectionStatus {
  return {
    id: partial.id ?? "id",
    label: partial.label,
    baseUrl: partial.baseUrl ?? "http://127.0.0.1:1",
    project: partial.project ?? null,
    connected: partial.connected ?? true,
    specCount: partial.specCount ?? 0,
    domains: partial.domains ?? [],
    matchesAllSites: partial.matchesAllSites ?? false,
    enabled: partial.enabled ?? true,
  };
}

function batch(partial: Partial<ManualBatchSummary>): ManualBatchSummary {
  return {
    id: partial.id ?? "manual:b1",
    label: partial.label ?? "Local",
    source: partial.source ?? "manual",
    project: partial.project ?? "Local Project",
    domains: partial.domains ?? [],
    specCount: partial.specCount ?? 1,
    importedAt: partial.importedAt ?? 0,
  };
}

function status(
  connections: ConnectionStatus[],
  manualBatches?: ManualBatchSummary[],
): StatusResult {
  return {
    configured: true,
    enabled: true,
    connections,
    manualBatches,
  };
}

const count = () => document.getElementById("count")?.textContent;
const statusText = () => document.getElementById("status-text")?.textContent;

const pnames = () => [...document.querySelectorAll("#projects .pname")].map((el) => el.textContent);
const pdots = () =>
  [...document.querySelectorAll("#projects .pdot")].map((el) => (el as HTMLElement).className);
const ptitles = () =>
  [...document.querySelectorAll("#projects .pdot")].map((el) => (el as HTMLElement).title);
const pcounts = () =>
  [...document.querySelectorAll("#projects .pcount")].map((el) => el.textContent);

describe("renderStatus header", () => {
  beforeEach(setupDom);

  it("shows the page-total spec count pill (scoped to the active origin)", () => {
    const a = conn({ id: "a", matchesAllSites: true, specCount: 4 });
    renderStatus(status([a]), "https://x.test", 5);
    expect(count()).toBe("5 specs");
  });

  // The text is blank in the serving cases; CSS (`.status:has(#status-text:empty)`)
  // collapses the row, so the renderer's job here is just to clear the text.
  it("blanks the status text when a project serves the page (the dots carry state)", () => {
    const a = conn({ id: "a", matchesAllSites: true, specCount: 1 });
    renderStatus(status([a]), "https://x.test", 1);
    expect(statusText()).toBe("");
  });

  it("blanks the status text on a Manual-only page", () => {
    const elsewhere = conn({ id: "elsewhere", domains: ["other.test"], connected: true });
    renderStatus(status([elsewhere]), "https://x.test", 3);
    expect(statusText()).toBe("");
  });

  it("shows 'No project for this page' when nothing serves the origin", () => {
    // The spec list owns the "No specs for this page" empty state; the header
    // names only the source gap, and the count clears.
    const elsewhere = conn({ id: "elsewhere", domains: ["other.test"], connected: true });
    renderStatus(status([elsewhere]), "https://x.test", 0);
    expect(statusText()).toBe("No project for this page");
    expect(count()).toBe("");
  });

  it("shows 'Not configured' when nothing is set up", () => {
    renderStatus({ configured: false, enabled: false }, "https://x.test", 0);
    expect(statusText()).toBe("Not configured");
  });
});

describe("renderProjects origin scoping", () => {
  beforeEach(setupDom);

  it("lists the project serving the active origin, not a project bound elsewhere", () => {
    const acme = conn({
      id: "acme",
      project: "Acme CRM Demo",
      label: "Acme CRM Demo",
      domains: ["localhost:3000"],
      specCount: 4,
    });
    const wsm = conn({
      id: "wsm",
      project: "WSM",
      label: "WSM",
      domains: [],
      matchesAllSites: true,
      specCount: 1,
    });
    // Active tab is wsm.sun-asterisk.vn: Acme (localhost domains) does not serve it.
    renderProjects(status([acme, wsm]), "https://wsm.sun-asterisk.vn");
    expect(pnames()).toEqual(["WSM"]);
  });

  it("stays empty when no project serves the origin", () => {
    const acme = conn({ id: "acme", domains: ["localhost:3000"], specCount: 4 });
    renderProjects(status([acme]), "https://other.example");
    expect(pnames()).toEqual([]);
  });

  it("lists a single serving project (it carries its own dot now)", () => {
    const a = conn({
      id: "a",
      project: "Solo",
      label: "Solo",
      matchesAllSites: true,
      specCount: 2,
    });
    renderProjects(status([a]), "https://x.test");
    expect(pnames()).toEqual(["Solo"]);
    expect(pcounts()).toEqual(["2"]);
  });

  it("lists every serving project when several match", () => {
    const a = conn({ id: "a", project: "A", label: "A", matchesAllSites: true, specCount: 2 });
    const b = conn({ id: "b", project: "B", label: "B", matchesAllSites: true, specCount: 3 });
    renderProjects(status([a, b]), "https://anything.test");
    expect(pnames()).toEqual(["A", "B"]);
  });

  it("excludes a disabled connection from the list", () => {
    const off = conn({
      id: "off",
      project: "Off",
      label: "Off",
      matchesAllSites: true,
      connected: true,
      specCount: 2,
      enabled: false,
    });
    renderProjects(status([off]), "https://x.test");
    expect(pnames()).toEqual([]);
  });
});

describe("renderProjects per-project status dot", () => {
  beforeEach(setupDom);

  it("marks a connected sidecar with the ok dot and a Connected title", () => {
    const a = conn({ id: "a", label: "Up", matchesAllSites: true, connected: true });
    renderProjects(status([a]), "https://x.test");
    expect(pdots()).toEqual(["pdot ok"]);
    expect(ptitles()).toEqual(["Connected (sidecar)"]);
  });

  it("marks a disconnected sidecar with the err dot and a Disconnected title", () => {
    const a = conn({ id: "a", label: "Down", matchesAllSites: true, connected: false });
    renderProjects(status([a]), "https://x.test");
    expect(pdots()).toEqual(["pdot err"]);
    expect(ptitles()).toEqual(["Disconnected (sidecar)"]);
  });
});

describe("renderProjects lists Manual projects", () => {
  beforeEach(setupDom);

  it("lists a serving sidecar and a serving Manual project together", () => {
    const sidecar = conn({ id: "s", project: "Sidecar", label: "Sidecar", matchesAllSites: true });
    const local = batch({ project: "Local", specCount: 2, domains: [] });
    renderProjects(status([sidecar], [local]), "https://x.test");
    expect(pnames()).toEqual(["Sidecar", "Local"]);
  });

  it("marks a Manual project as available (ok dot, Manual title)", () => {
    const local = batch({ project: "Local", specCount: 2, domains: [] });
    renderProjects(status([], [local]), "https://x.test");
    expect(pnames()).toEqual(["Local"]);
    expect(pdots()).toEqual(["pdot ok"]);
    expect(ptitles()).toEqual(["Connected (manual)"]);
  });

  it("ignores an empty Manual project (a write target with no specs yet)", () => {
    const local = batch({ project: "Empty Local", specCount: 0, domains: [] });
    renderProjects(status([], [local]), "https://x.test");
    expect(pnames()).toEqual([]);
  });

  it("ignores a Manual project whose domains do not match the page", () => {
    const local = batch({ project: "Other", specCount: 2, domains: ["other.test"] });
    renderProjects(status([], [local]), "https://x.test");
    expect(pnames()).toEqual([]);
  });
});
