import type { ElementFingerprint, Spec } from "@specpin/spec-schema";
import { validateSpec } from "@specpin/spec-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSpec, type CaptureFields, CaptureForm } from "../src/content/capture-form.js";
import { must } from "./test-utils.js";

const fingerprint: ElementFingerprint = {
  cssSelector: "form.login button",
  xpath: "/form/button",
  domPath: ["form", "button"],
  tagName: "button",
  attributes: { type: "submit" },
  positionHint: { index: 0, siblingCount: 1 },
  testId: "login-submit",
};

function fieldsWith(over: Partial<CaptureFields> = {}): CaptureFields {
  return {
    byLocale: { en: { title: "Login", description: "Submits", businessRules: [] } },
    defaultLocale: "en",
    tags: [],
    ...over,
  };
}

function existingSpec(over: Partial<Spec> = {}): Spec {
  return {
    id: "login-btn",
    title: { en: "Login" },
    description: { en: "Submits" },
    fingerprint,
    meta: {
      createdBy: "agent",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      source: "manual",
    },
    ...over,
  };
}

describe("buildSpec — provenance authoring", () => {
  it("precondition: validateSpec accepts a fully provenance-bearing spec", () => {
    const spec = buildSpec(
      fieldsWith({
        links: [{ label: "Ticket", url: "https://x.example/1" }],
        verifiedBy: ["tests/login.spec.ts"],
        status: "approved",
      }),
      fingerprint,
      "2026-06-25T08:00:00Z",
      "ab12cd",
    );
    expect(validateSpec(spec).valid).toBe(true);
  });

  it("(a) round-trips links/verifiedBy/status and omits empty ones", () => {
    const spec = buildSpec(
      fieldsWith({
        links: [
          { label: "Ticket", url: "https://x.example/1" },
          { label: "", url: "" }, // dropped
          { label: "no url", url: "  " }, // dropped
        ],
        verifiedBy: ["tests/a.ts", "  ", ""],
        status: "draft",
      }),
      fingerprint,
      "2026-06-25T08:00:00Z",
      "s1",
    );
    expect(spec.links).toEqual([{ label: "Ticket", url: "https://x.example/1" }]);
    expect(spec.verifiedBy).toEqual(["tests/a.ts"]);
    expect(spec.status).toBe("draft");
  });

  it("(a) omits provenance keys entirely when all empty", () => {
    const spec = buildSpec(
      fieldsWith({ links: [], verifiedBy: ["", "  "], status: null }),
      fingerprint,
      "2026-06-25T08:00:00Z",
      "s2",
    );
    expect(spec.links).toBeUndefined();
    expect(spec.verifiedBy).toBeUndefined();
    expect(spec.status).toBeUndefined();
  });

  it("(b) editing carries provenance from the form fields", () => {
    const spec = buildSpec(
      fieldsWith({ links: [{ label: "T", url: "https://x.example" }], status: "approved" }),
      fingerprint,
      "2026-06-25T08:00:00Z",
      "s3",
      existingSpec({ status: "draft" }),
    );
    expect(spec.status).toBe("approved");
    expect(spec.links).toEqual([{ label: "T", url: "https://x.example" }]);
  });

  it("(c) clearing links in edit mode deletes the key (no preserve-prior)", () => {
    const spec = buildSpec(
      fieldsWith({ links: [] }), // form emptied
      fingerprint,
      "2026-06-25T08:00:00Z",
      "s4",
      existingSpec({ links: [{ label: "Old", url: "https://old.example" }] }),
    );
    expect(spec.links).toBeUndefined();
  });

  it("(d) Mark-reviewed stamps a valid ISO reviewedAt + reviewer and keeps other meta", () => {
    const spec = buildSpec(
      fieldsWith({}),
      fingerprint,
      "2026-06-25T08:00:00Z",
      "s5",
      existingSpec(),
      { at: "2026-07-03T10:00:00.000Z", by: "manual" },
    );
    expect(spec.meta?.reviewedAt).toBe("2026-07-03T10:00:00.000Z");
    expect(Number.isNaN(Date.parse(spec.meta?.reviewedAt ?? ""))).toBe(false);
    expect(spec.meta?.reviewedBy).toBe("manual");
    expect(spec.meta?.createdBy).toBe("agent");
    expect(spec.meta?.createdAt).toBe("2026-01-01T00:00:00Z");
    expect(validateSpec(spec).valid).toBe(true);
  });

  it("(e) an unrelated edit preserves a prior review stamp (meta spread, not clobber)", () => {
    const reviewed = existingSpec({
      meta: {
        createdBy: "agent",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-02-01T00:00:00Z",
        source: "manual",
        reviewedAt: "2026-06-30T00:00:00Z",
        reviewedBy: "manual",
      },
    });
    // Edit the description only (no review param).
    const spec = buildSpec(
      fieldsWith({
        byLocale: { en: { title: "Login", description: "New desc", businessRules: [] } },
      }),
      fingerprint,
      "2026-07-03T00:00:00Z",
      "s6",
      reviewed,
    );
    expect(spec.meta?.reviewedAt).toBe("2026-06-30T00:00:00Z");
    expect(spec.meta?.reviewedBy).toBe("manual");
    expect(spec.meta?.updatedAt).toBe("2026-07-03T00:00:00Z");
  });
});

describe("CaptureForm — provenance authoring + Mark reviewed", () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  function shadowOf(): ShadowRoot {
    return must(must(document.getElementById("specpin-capture-host")).shadowRoot);
  }
  const click = (shadow: ShadowRoot, sel: string) =>
    must(shadow.querySelector(sel)).dispatchEvent(new Event("click", { bubbles: true }));

  const reviewedExisting: Spec = existingSpec({
    status: "approved",
    links: [{ label: "Ticket", url: "https://x.example/1" }],
    verifiedBy: ["tests/login.spec.ts"],
    meta: {
      createdBy: "agent",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      source: "manual",
      reviewedAt: "2026-06-30T00:00:00Z",
      reviewedBy: "agent",
    },
  });

  function openEdit(onSubmit: Parameters<CaptureForm["open"]>[1]["onSubmit"]): ShadowRoot {
    new CaptureForm(document).open(fingerprint, {
      defaultFile: "login.spec.json",
      locales: ["en"],
      defaultLocale: "en",
      initial: reviewedExisting,
      onSubmit,
    });
    return shadowOf();
  }

  afterEach(() => {
    document.getElementById("specpin-capture-host")?.remove();
    document.body.innerHTML = "";
  });

  it("prefills status/verifiedBy/links and the non-PII reviewer default", () => {
    const shadow = openEdit(async () => ({ ok: true }));
    expect((must(shadow.querySelector("#sp-status")) as HTMLSelectElement).value).toBe("approved");
    expect((must(shadow.querySelector("#sp-verifiedby")) as HTMLTextAreaElement).value).toBe(
      "tests/login.spec.ts",
    );
    expect(shadow.querySelectorAll(".link-row").length).toBe(1);
    expect((must(shadow.querySelector(".link-label")) as HTMLInputElement).value).toBe("Ticket");
    expect((must(shadow.querySelector("#sp-reviewed-by")) as HTMLInputElement).value).toBe("agent");
  });

  it("Add link then Save round-trips a new link", async () => {
    const onSubmit = vi.fn(async (_file: string, _spec: Spec, _connectionId?: string) => ({
      ok: true,
    }));
    const shadow = openEdit(onSubmit);
    click(shadow, "#sp-add-link");
    const rows = shadow.querySelectorAll(".link-row");
    const last = rows[rows.length - 1];
    (last.querySelector(".link-label") as HTMLInputElement).value = "Design";
    (last.querySelector(".link-url") as HTMLInputElement).value = "https://docs.example";
    click(shadow, "#sp-save");
    await flush();
    const [, spec] = onSubmit.mock.calls[0];
    expect(spec.links).toContainEqual({ label: "Design", url: "https://docs.example" });
  });

  it("Mark reviewed stamps meta.reviewedAt now + reviewer and submits", async () => {
    const onSubmit = vi.fn(async (_file: string, _spec: Spec, _connectionId?: string) => ({
      ok: true,
    }));
    const shadow = openEdit(onSubmit);
    const before = Date.now();
    click(shadow, "#sp-mark-reviewed");
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [, spec] = onSubmit.mock.calls[0];
    const stamped = Date.parse(spec.meta?.reviewedAt ?? "");
    expect(Number.isNaN(stamped)).toBe(false);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(spec.meta?.reviewedBy).toBe("agent");
    // Unrelated fields untouched.
    expect(spec.meta?.createdAt).toBe("2026-01-01T00:00:00Z");
    expect(spec.status).toBe("approved");
  });

  it("Mark reviewed surfaces a 409 conflict instead of assuming success", async () => {
    const onSubmit = vi.fn(async (_file: string, _spec: Spec, _connectionId?: string) => ({
      ok: false,
      conflict: true,
    }));
    const shadow = openEdit(onSubmit);
    click(shadow, "#sp-mark-reviewed");
    await flush();
    const errors = must(shadow.querySelector(".errors"));
    expect(errors.classList.contains("show")).toBe(true);
    // Form stays open (not closed on conflict).
    expect(document.getElementById("specpin-capture-host")).not.toBeNull();
  });
});
