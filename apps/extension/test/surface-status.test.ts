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
  };
}

function status(connections: ConnectionStatus[]): StatusResult {
  return {
    configured: true,
    connected: true,
    enabled: true,
    activeSource: "sidecar",
    connections,
  };
}

const project = () => document.getElementById("project")?.textContent;
const count = () => document.getElementById("count")?.textContent;

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
