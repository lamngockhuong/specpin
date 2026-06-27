import { beforeEach, describe, expect, it } from "vitest";
import type { ConnectionStatus, StatusResult } from "../src/shared/messaging.js";
import { renderStatus } from "../src/shared/surface-renderers.js";

// Header (project name + spec count) must be scoped to the active tab's origin,
// not the global first-connected project / cross-project total. Regression for a
// project being named on a page it does not serve.

function setupDom(): void {
  document.body.innerHTML = `
    <span id="status-dot"></span>
    <span id="status-text"></span>
    <input id="enabled" type="checkbox" />
    <span id="project"></span>
    <span id="count"></span>
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

function status(connections: ConnectionStatus[]): StatusResult {
  return {
    configured: true,
    enabled: true,
    connections,
  };
}

const project = () => document.getElementById("project")?.textContent;
const count = () => document.getElementById("count")?.textContent;
const statusText = () => document.getElementById("status-text")?.textContent;
const dotClass = () => document.getElementById("status-dot")?.className;

describe("renderStatus origin scoping", () => {
  beforeEach(setupDom);

  it("names the project serving the active origin, not the global first-connected one", () => {
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
    renderStatus(status([acme, wsm]), "https://wsm.sun-asterisk.vn", 1);
    expect(project()).toBe("WSM");
    expect(count()).toBe("1 specs");
  });

  it("leaves the header blank when no connection serves the origin", () => {
    const acme = conn({
      id: "acme",
      project: "Acme CRM Demo",
      label: "Acme CRM Demo",
      domains: ["localhost:3000"],
      specCount: 4,
    });
    renderStatus(status([acme]), "https://other.example", 0);
    expect(project()).toBe("");
    expect(count()).toBe("");
  });

  it("blanks the header project when 2+ projects serve the origin (the list names them)", () => {
    const a = conn({ id: "a", project: "A", label: "A", matchesAllSites: true, specCount: 2 });
    const b = conn({ id: "b", project: "B", label: "B", matchesAllSites: true, specCount: 3 });
    renderStatus(status([a, b]), "https://anything.test", 5);
    expect(project()).toBe("");
    expect(count()).toBe("5 specs");
  });
});

describe("renderStatus connection health (origin-scoped)", () => {
  beforeEach(setupDom);

  const allSites = (id: string, connected: boolean) =>
    conn({ id, project: id, label: id, matchesAllSites: true, connected, specCount: 1 });

  it("shows Connected when every serving sidecar is up", () => {
    renderStatus(status([allSites("a", true), allSites("b", true)]), "https://x.test", 2);
    expect(statusText()).toBe("Connected (sidecar)");
    expect(dotClass()).toBe("dot ok");
  });

  it("shows a degraded Partially connected (n/m) when some serving sidecars are down", () => {
    renderStatus(status([allSites("a", true), allSites("b", false)]), "https://x.test", 1);
    expect(statusText()).toBe("Partially connected (1/2)");
    expect(dotClass()).toBe("dot warn");
  });

  it("names the source as Disconnected (sidecar) when all serving sidecars are down", () => {
    renderStatus(status([allSites("a", false), allSites("b", false)]), "https://x.test", 0);
    expect(statusText()).toBe("Disconnected (sidecar)");
    expect(dotClass()).toBe("dot off");
  });

  it("ignores connections that do not serve the active origin", () => {
    // A down sidecar pinned to another domain must not degrade this page.
    const here = conn({ id: "here", matchesAllSites: true, connected: true, specCount: 1 });
    const elsewhere = conn({ id: "elsewhere", domains: ["other.test"], connected: false });
    renderStatus(status([here, elsewhere]), "https://x.test", 1);
    expect(statusText()).toBe("Connected (sidecar)");
    expect(dotClass()).toBe("dot ok");
  });

  it("excludes a disabled connection from the serving set", () => {
    // A disabled project serves no page even though it matches the origin: the
    // header must not name it and health must not count it.
    const off = conn({
      id: "off",
      project: "Off",
      label: "Off",
      matchesAllSites: true,
      connected: true,
      specCount: 2,
      enabled: false,
    });
    renderStatus(status([off]), "https://x.test", 0);
    expect(statusText()).toBe("No project for this page");
    expect(project()).toBe("");
  });

  it("reports Connected (manual) when no sidecar serves the page but specs render", () => {
    const elsewhere = conn({ id: "elsewhere", domains: ["other.test"], connected: true });
    renderStatus(status([elsewhere]), "https://x.test", 3);
    expect(statusText()).toBe("Connected (manual)");
    expect(dotClass()).toBe("dot ok");
  });

  it("reports no project (not 'no specs') for a configured page that nothing serves", () => {
    // The spec list owns the "No specs for this page" empty state; the header
    // must not duplicate it.
    const elsewhere = conn({ id: "elsewhere", domains: ["other.test"], connected: true });
    renderStatus(status([elsewhere]), "https://x.test", 0);
    expect(statusText()).toBe("No project for this page");
    expect(dotClass()).toBe("dot");
  });

  it("reports Not configured when nothing is set up", () => {
    renderStatus({ configured: false, enabled: false }, "https://x.test", 0);
    expect(statusText()).toBe("Not configured");
  });
});
