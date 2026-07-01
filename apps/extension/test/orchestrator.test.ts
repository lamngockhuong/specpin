import type { ElementFingerprint, Spec } from "@specpin/spec-schema";
import { afterEach, describe, expect, it } from "vitest";
import { renderSession } from "../src/content/orchestrator.js";
import { originMatchesDomains } from "../src/shared/origin-match.js";

/** A fingerprint that resolves uniquely to the lone <button> on the page, so two
 *  specs with different pageUrl scopes both *could* match the same element (the
 *  cross-screen collision this fix prevents). */
function buttonFingerprint(pageUrl: string | null): ElementFingerprint {
  return {
    testId: null,
    ariaLabel: null,
    id: null,
    cssSelector: "button.search",
    xpath: "//button",
    domPath: ["button"],
    tagName: "button",
    textContent: "検索",
    attributes: {},
    nearbyLabels: [],
    positionHint: { index: 0, siblingCount: 1 },
    pageUrl,
  };
}

function spec(id: string, pageUrl: string | null): Spec {
  return {
    id,
    title: { en: id },
    description: { en: "x" },
    businessRules: [],
    tags: [],
    fingerprint: buttonFingerprint(pageUrl),
    meta: {
      createdBy: "t",
      createdAt: "2026-06-25T08:00:00Z",
      updatedAt: "2026-06-25T08:00:00Z",
      source: "manual",
    },
  };
}

describe("originMatchesDomains", () => {
  it("matches when domains empty (any origin)", () => {
    expect(originMatchesDomains("http://localhost:3000", [])).toBe(true);
  });
  it("matches host against configured domains", () => {
    expect(originMatchesDomains("http://localhost:3000", ["localhost:3000"])).toBe(true);
    expect(originMatchesDomains("https://app.acme.io", ["app.acme.io"])).toBe(true);
  });
  it("rejects an unrelated origin", () => {
    expect(originMatchesDomains("https://evil.com", ["app.acme.io"])).toBe(false);
  });

  it("matches true subdomains but rejects look-alikes and path/query injection", () => {
    expect(originMatchesDomains("https://app.acme.io", ["acme.io"])).toBe(true);
    expect(originMatchesDomains("https://evil-acme.io", ["acme.io"])).toBe(false);
    expect(originMatchesDomains("https://acme.io.attacker.com", ["acme.io"])).toBe(false);
    expect(originMatchesDomains("https://attacker.com/?x=acme.io", ["acme.io"])).toBe(false);
  });
});

describe("renderSession page scope", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    for (const n of document.querySelectorAll("[id^='specpin-']")) n.remove();
  });

  const url = "https://app.acme.io/service-admin/business-offices";

  it("renders only specs scoped to the current page, dropping other screens' specs", () => {
    document.body.innerHTML = `<button class="search">検索</button>`;
    const here = spec("here", "/service-admin/business-offices");
    const otherScreen = spec("other-screen", "/service-admin/users");
    const s = renderSession(
      [here, otherScreen],
      null,
      document,
      "tooltip",
      "en",
      ["en"],
      undefined,
      url,
    );
    expect(s.stats.rendered).toBe(1);
    expect(s.matches.has("here")).toBe(true);
    expect(s.matches.has("other-screen")).toBe(false);
    s.destroy();
  });

  it("keeps legacy specs with no pageUrl matching on any page", () => {
    document.body.innerHTML = `<button class="search">検索</button>`;
    const legacy = spec("legacy", null);
    const s = renderSession([legacy], null, document, "tooltip", "en", ["en"], undefined, url);
    expect(s.stats.rendered).toBe(1);
    s.destroy();
  });
});
