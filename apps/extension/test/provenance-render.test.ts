import type { Spec } from "@specpin/spec-schema";
import { afterEach, describe, expect, it } from "vitest";
import { SidebarRenderer } from "../src/renderers/sidebar.js";
import {
  DEFAULT_STALENESS_THRESHOLD_DAYS,
  formatRelativeTime,
  isStale,
  linkedTestsHtml,
  provenanceLinksHtml,
  provenanceSectionHtml,
  resolveStalenessThreshold,
  reviewedInfoHtml,
  statusBadgeHtml,
} from "../src/shared/provenance.js";
import { must } from "./test-utils.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-03T00:00:00Z");

/** Minimal spec with no provenance fields (the backward-compat baseline). */
function baseSpec(): Spec {
  return {
    id: "login",
    title: { en: "Login button" },
    description: { en: "submits the login form" },
    businessRules: [{ en: "Lock after 5 failures" }],
    tags: ["auth"],
    fingerprint: {
      cssSelector: "button",
      xpath: "",
      domPath: [],
      tagName: "button",
      attributes: {},
      positionHint: { index: 0, siblingCount: 1 },
    },
  };
}

describe("resolveStalenessThreshold", () => {
  it("passes a valid value through", () => {
    expect(resolveStalenessThreshold(30)).toBe(30);
  });
  it("clamps to [1, 3650]", () => {
    expect(resolveStalenessThreshold(0)).toBe(1);
    expect(resolveStalenessThreshold(-5)).toBe(1);
    expect(resolveStalenessThreshold(999_999)).toBe(3650);
  });
  it("defaults to 90 for absent / non-finite / non-number", () => {
    expect(resolveStalenessThreshold(undefined)).toBe(DEFAULT_STALENESS_THRESHOLD_DAYS);
    expect(resolveStalenessThreshold("90")).toBe(90);
    expect(resolveStalenessThreshold(Number.NaN)).toBe(90);
    expect(resolveStalenessThreshold(Number.POSITIVE_INFINITY)).toBe(90);
  });
});

describe("isStale", () => {
  it("is false at/under the threshold and true past it", () => {
    expect(isStale(NOW - 89 * DAY, NOW, 90)).toBe(false);
    expect(isStale(NOW - 90 * DAY, NOW, 90)).toBe(false); // exactly at boundary
    expect(isStale(NOW - 91 * DAY, NOW, 90)).toBe(true);
  });
  it("treats a future review (clock skew) as fresh", () => {
    expect(isStale(NOW + 5 * DAY, NOW, 90)).toBe(false);
  });
});

describe("formatRelativeTime", () => {
  it("formats a past timestamp in the largest whole unit", () => {
    expect(formatRelativeTime(NOW - 3 * DAY, NOW, "en")).toBe("3 days ago");
    expect(formatRelativeTime(NOW - 400 * DAY, NOW, "en")).toBe("last year");
  });
  it("reports 'now' for sub-minute and future (skew)", () => {
    expect(formatRelativeTime(NOW - 5000, NOW, "en")).toBe("now");
    expect(formatRelativeTime(NOW + 10 * DAY, NOW, "en")).toBe("now");
  });
});

describe("statusBadgeHtml", () => {
  it("renders the tier chip for each status", () => {
    expect(statusBadgeHtml("draft")).toContain("prov-status-draft");
    expect(statusBadgeHtml("approved")).toContain("prov-status-approved");
    expect(statusBadgeHtml("deprecated")).toContain("prov-status-deprecated");
  });
  it("renders nothing when status is absent", () => {
    expect(statusBadgeHtml(undefined)).toBe("");
  });
});

describe("provenanceLinksHtml — link safety", () => {
  it("emits a new-tab anchor with rel=noopener noreferrer for an http(s) link", () => {
    const html = provenanceLinksHtml([{ label: "Ticket", url: "https://x.example/1" }]);
    expect(html).toContain('href="https://x.example/1"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });
  it("drops a javascript: URL to a non-linked label (no href)", () => {
    const html = provenanceLinksHtml([{ label: "Click", url: "javascript:alert(1)" }]);
    expect(html).toContain("prov-link-broken");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("javascript:");
  });
  it("escapes an HTML-bearing label", () => {
    const html = provenanceLinksHtml([
      { label: "<img src=x onerror=alert(1)>", url: "https://x.example" },
    ]);
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
  it("HTML-escapes an ampersand in an otherwise-valid URL", () => {
    const html = provenanceLinksHtml([{ label: "T", url: "https://x.example/?a=1&b=2" }]);
    expect(html).toContain("a=1&amp;b=2");
    expect(html).not.toMatch(/a=1&b=2/);
  });
  it("renders nothing for empty/absent links", () => {
    expect(provenanceLinksHtml(undefined)).toBe("");
    expect(provenanceLinksHtml([])).toBe("");
  });
});

describe("linkedTestsHtml — declarative wording", () => {
  it("renders a linked-tests disclosure, never 'verified'/'passed'", () => {
    const html = linkedTestsHtml(["tests/a.spec.ts", "src/b.test.tsx"]);
    expect(html).toContain("Linked tests (2)");
    expect(html.toLowerCase()).not.toContain("verified");
    expect(html.toLowerCase()).not.toContain("passed");
  });
  it("trims and drops empty paths, and escapes each path", () => {
    const html = linkedTestsHtml(["  tests/a.ts  ", "", "  ", "<x>"]);
    expect(html).toContain("Linked tests (2)");
    expect(html).toContain("<li>tests/a.ts</li>");
    expect(html).toContain("&lt;x&gt;");
  });
  it("renders nothing for empty/absent verifiedBy", () => {
    expect(linkedTestsHtml(undefined)).toBe("");
    expect(linkedTestsHtml([" ", ""])).toBe("");
  });
});

describe("reviewedInfoHtml", () => {
  const meta = (over: Record<string, unknown>) => ({
    createdBy: "manual",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    source: "manual" as const,
    ...over,
  });
  it("shows relative time and flags stale past the threshold", () => {
    const r = reviewedInfoHtml(
      meta({ reviewedAt: new Date(NOW - 100 * DAY).toISOString() }),
      90,
      NOW,
      "en",
    );
    expect(r.isStale).toBe(true);
    expect(r.html).toContain("is-stale");
    expect(r.html).toContain("prov-stale");
  });
  it("is not stale within the threshold", () => {
    const r = reviewedInfoHtml(
      meta({ reviewedAt: new Date(NOW - 10 * DAY).toISOString() }),
      90,
      NOW,
      "en",
    );
    expect(r.isStale).toBe(false);
    expect(r.html).not.toContain("prov-stale");
  });
  it("appends and escapes reviewedBy", () => {
    const r = reviewedInfoHtml(
      meta({ reviewedAt: new Date(NOW - 1 * DAY).toISOString(), reviewedBy: "<b>x</b>" }),
      90,
      NOW,
      "en",
    );
    expect(r.html).toContain("&lt;b&gt;x");
    expect(r.html).not.toContain("<b>x</b>");
  });
  it("never throws and returns empty for absent meta / reviewedAt / bad date", () => {
    expect(reviewedInfoHtml(undefined, 90, NOW).html).toBe("");
    expect(reviewedInfoHtml(meta({}), 90, NOW).html).toBe("");
    expect(reviewedInfoHtml(meta({ reviewedAt: "not a date" }), 90, NOW).html).toBe("");
  });
});

describe("provenanceSectionHtml — backward compatibility", () => {
  it("returns empty string for a spec with no provenance fields", () => {
    expect(provenanceSectionHtml(baseSpec(), { nowMs: NOW })).toBe("");
  });
  it("emits a .prov block when any field is present", () => {
    const spec = { ...baseSpec(), status: "approved" as const };
    expect(provenanceSectionHtml(spec, { nowMs: NOW })).toContain('class="prov"');
  });
  it("uses the 90-day default threshold when none is passed", () => {
    const spec = {
      ...baseSpec(),
      meta: {
        createdBy: "manual",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        source: "manual" as const,
        reviewedAt: new Date(NOW - 100 * DAY).toISOString(),
      },
    };
    expect(provenanceSectionHtml(spec, { nowMs: NOW })).toContain("prov-stale");
  });
});

describe("Sidebar renderer integration", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.getElementById("specpin-sidebar-host")?.remove();
  });

  const shadow = (): ShadowRoot =>
    must(must(document.getElementById("specpin-sidebar-host")).shadowRoot);

  it("adds no provenance block for a spec without provenance (regression)", () => {
    document.body.innerHTML = `<button>Login</button>`;
    const target = must(document.querySelector("button"));
    const r = new SidebarRenderer(document);
    r.render(baseSpec(), target, { confidence: 1, needsReview: false });
    expect(shadow().querySelector(".prov")).toBeNull();
    r.destroy();
  });

  it("renders status, links, linked tests and reviewed for a provenance-bearing spec", () => {
    document.body.innerHTML = `<button>Login</button>`;
    const target = must(document.querySelector("button"));
    const spec: Spec = {
      ...baseSpec(),
      status: "approved",
      links: [{ label: "Ticket", url: "https://x.example/1" }],
      verifiedBy: ["tests/login.spec.ts"],
      meta: {
        createdBy: "manual",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        source: "manual",
        reviewedAt: new Date(NOW - 2 * DAY).toISOString(),
        reviewedBy: "manual",
      },
    };
    const r = new SidebarRenderer(document);
    r.render(spec, target, { confidence: 1, needsReview: false, stalenessThresholdDays: 90 });
    const prov = must(shadow().querySelector(".prov"));
    expect(prov.querySelector(".prov-status-approved")).toBeTruthy();
    const anchor = must(prov.querySelector("a.prov-link")) as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe("https://x.example/1");
    expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(prov.querySelector(".linked-tests")?.textContent).toContain("Linked tests (1)");
    expect(prov.querySelector(".prov-reviewed")).toBeTruthy();
    r.destroy();
  });
});
