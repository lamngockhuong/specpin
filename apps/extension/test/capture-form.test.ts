import type { ElementFingerprint, Spec } from "@specpin/spec-schema";
import { validateSpec } from "@specpin/spec-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSpec,
  type CaptureFields,
  CaptureForm,
  mergeLocalized,
} from "../src/content/capture-form.js";
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

const fields: CaptureFields = {
  byLocale: {
    en: {
      title: "Login Button",
      description: "Submits the login form",
      businessRules: ["Lock after 5 failures", ""],
    },
  },
  defaultLocale: "en",
  tags: ["auth", " critical "],
  preferredDisplayMode: "sidebar",
};

describe("buildSpec", () => {
  it("produces a schema-valid spec", () => {
    const spec = buildSpec(fields, fingerprint, "2026-06-25T08:00:00Z", "ab12cd");
    expect(validateSpec(spec).valid).toBe(true);
  });

  it("sets manual provenance and timestamps", () => {
    const spec = buildSpec(fields, fingerprint, "2026-06-25T08:00:00Z", "ab12cd");
    expect(spec.meta?.source).toBe("manual");
    expect(spec.meta?.createdAt).toBe("2026-06-25T08:00:00Z");
    expect(spec.meta?.updatedAt).toBe("2026-06-25T08:00:00Z");
  });

  it("slugifies the default-locale title into the id and trims/filters lists", () => {
    const spec = buildSpec(fields, fingerprint, "2026-06-25T08:00:00Z", "ab12cd");
    expect(spec.id).toBe("login-button-ab12cd");
    expect(spec.title).toEqual({ en: "Login Button" });
    expect(spec.businessRules).toEqual([{ en: "Lock after 5 failures" }]);
    expect(spec.tags).toEqual(["auth", "critical"]);
    expect(spec.preferredDisplayMode).toBe("sidebar");
  });

  it("falls back to a non-empty id when the title is symbols only", () => {
    const symbolFields: CaptureFields = {
      ...fields,
      byLocale: { en: { ...fields.byLocale.en, title: "!!!" } },
    };
    const spec = buildSpec(symbolFields, fingerprint, "2026-06-25T08:00:00Z", "x1");
    expect(spec.id).toBe("spec-x1");
    expect(validateSpec(spec).valid).toBe(true);
  });

  it("collects every locale's title/description and pairs rules by line", () => {
    const multi: CaptureFields = {
      byLocale: {
        en: { title: "Login", description: "Submits", businessRules: ["Lock account"] },
        vi: { title: "Đăng nhập", description: "Gửi biểu mẫu", businessRules: ["Khoá tài khoản"] },
      },
      defaultLocale: "en",
      tags: [],
    };
    const spec = buildSpec(multi, fingerprint, "2026-06-25T08:00:00Z", "m1");
    expect(spec.title).toEqual({ en: "Login", vi: "Đăng nhập" });
    expect(spec.description).toEqual({ en: "Submits", vi: "Gửi biểu mẫu" });
    expect(spec.businessRules).toEqual([{ en: "Lock account", vi: "Khoá tài khoản" }]);
    expect(validateSpec(spec).valid).toBe(true);
  });

  it("adding a third locale keeps the existing ones intact", () => {
    const three: CaptureFields = {
      byLocale: {
        en: { title: "Login", description: "Submits", businessRules: [] },
        vi: { title: "Đăng nhập", description: "Gửi", businessRules: [] },
        ja: { title: "ログイン", description: "送信", businessRules: [] },
      },
      defaultLocale: "en",
      tags: [],
    };
    const spec = buildSpec(three, fingerprint, "2026-06-25T08:00:00Z", "t1");
    expect(spec.title).toEqual({ en: "Login", vi: "Đăng nhập", ja: "ログイン" });
    expect(validateSpec(spec).valid).toBe(true);
  });

  it("editing preserves id + provenance and only bumps updatedAt", () => {
    const existing: Spec = {
      id: "login-original-id",
      title: { en: "Old" },
      description: { en: "Old desc" },
      fingerprint,
      meta: {
        createdBy: "alice",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        source: "ai-generated",
      },
    };
    const spec = buildSpec(fields, fingerprint, "2026-06-25T08:00:00Z", "newsuffix", existing);
    expect(spec.id).toBe("login-original-id");
    expect(spec.meta?.createdBy).toBe("alice");
    expect(spec.meta?.createdAt).toBe("2026-01-01T00:00:00Z");
    expect(spec.meta?.source).toBe("ai-generated");
    expect(spec.meta?.updatedAt).toBe("2026-06-25T08:00:00Z");
    // Edited content still applies.
    expect(spec.title).toEqual({ en: "Login Button" });
    expect(validateSpec(spec).valid).toBe(true);
  });

  it("without an existing spec, mints a fresh id + manual provenance (unchanged)", () => {
    const spec = buildSpec(fields, fingerprint, "2026-06-25T08:00:00Z", "ab12cd");
    expect(spec.id).toBe("login-button-ab12cd");
    expect(spec.meta?.source).toBe("manual");
  });
});

describe("CaptureForm edit mode", () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  const existing: Spec = {
    id: "login-submit-btn",
    title: { en: "Login button", vi: "Nút đăng nhập" },
    description: { en: "Submits the login form", vi: "Gửi biểu mẫu" },
    businessRules: [{ en: "Lock after 5 failures", vi: "Khoá sau 5 lần" }],
    tags: ["auth", "critical"],
    preferredDisplayMode: "sidebar",
    fingerprint,
    meta: {
      createdBy: "alice",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      source: "manual",
    },
  };

  function shadowOf(): ShadowRoot {
    return must(must(document.getElementById("specpin-capture-host")).shadowRoot);
  }

  const submitMock = () =>
    vi.fn(async (_file: string, _spec: Spec, _connectionId?: string) => ({ ok: true }));

  /** Open the form in edit mode with sensible defaults; overrides win. Returns the shadow root. */
  function openEdit(overrides: Partial<Parameters<CaptureForm["open"]>[1]> = {}): ShadowRoot {
    new CaptureForm(document).open(fingerprint, {
      defaultFile: "login.spec.json",
      locales: ["en", "vi"],
      defaultLocale: "en",
      initial: existing,
      onRelink: async () => null,
      onSubmit: async () => ({ ok: true }),
      ...overrides,
    });
    return shadowOf();
  }

  const click = (shadow: ShadowRoot, sel: string) =>
    must(shadow.querySelector(sel)).dispatchEvent(new Event("click", { bubbles: true }));

  afterEach(() => {
    document.getElementById("specpin-capture-host")?.remove();
    document.body.innerHTML = "";
  });

  it("renders edit chrome, prefills fields, and hides file/target", () => {
    const shadow = openEdit();
    expect(must(shadow.querySelector("h3")).textContent).toBe("Edit spec");
    expect((must(shadow.querySelector("#sp-title")) as HTMLInputElement).value).toBe(
      "Login button",
    );
    expect((must(shadow.querySelector("#sp-tags")) as HTMLInputElement).value).toBe(
      "auth, critical",
    );
    expect((must(shadow.querySelector("#sp-mode")) as HTMLSelectElement).value).toBe("sidebar");
    expect(shadow.querySelector("#sp-file")).toBeNull();
    expect(shadow.querySelector("#sp-target")).toBeNull();
    expect(must(shadow.querySelector("#sp-save")).textContent).toBe("Save changes");
  });

  it("save submits the same id with edited content and no connectionId", async () => {
    const onSubmit = submitMock();
    const shadow = openEdit({ onSubmit });
    (must(shadow.querySelector("#sp-title")) as HTMLInputElement).value = "Sign-in button";
    click(shadow, "#sp-save");
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [file, spec, connectionId] = onSubmit.mock.calls[0];
    expect(file).toBe("");
    expect(connectionId).toBeUndefined();
    expect(spec.id).toBe("login-submit-btn");
    expect(spec.title.en).toBe("Sign-in button");
    expect(spec.meta?.createdAt).toBe("2026-01-01T00:00:00Z");
  });

  it("re-link replaces the fingerprint on save and keeps field edits", async () => {
    const newFingerprint: ElementFingerprint = {
      cssSelector: "nav button.signin",
      xpath: "/nav/button",
      domPath: ["nav", "button"],
      tagName: "button",
      attributes: {},
      positionHint: { index: 1, siblingCount: 3 },
      testId: "signin",
    };
    const onSubmit = submitMock();
    const shadow = openEdit({ onSubmit, onRelink: async () => newFingerprint });
    click(shadow, "#sp-relink");
    await flush();
    expect(must(shadow.querySelector(".relink-note")).classList.contains("show")).toBe(true);
    click(shadow, "#sp-save");
    await flush();
    const [, spec] = onSubmit.mock.calls[0];
    expect(spec.fingerprint.cssSelector).toBe("nav button.signin");
    expect(spec.fingerprint.testId).toBe("signin");
  });

  it("re-link cancel (null) keeps the original fingerprint", async () => {
    const onSubmit = submitMock();
    const shadow = openEdit({ onSubmit, onRelink: async () => null });
    click(shadow, "#sp-relink");
    await flush();
    click(shadow, "#sp-save");
    await flush();
    const [, spec] = onSubmit.mock.calls[0];
    expect(spec.fingerprint.cssSelector).toBe("form.login button");
  });
});

describe("CaptureForm capture targets (Phase 2)", () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  function shadowOf(): ShadowRoot {
    return must(must(document.getElementById("specpin-capture-host")).shadowRoot);
  }

  const submitMock = () =>
    vi.fn(async (_file: string, _spec: Spec, _connectionId?: string) => ({ ok: true }));

  /** Open capture mode (no `initial`) with the given targets. */
  function openCapture(
    targets: { id: string; project: string; kind: "sidecar" | "local" }[],
    onSubmit = submitMock(),
  ): { shadow: ShadowRoot; onSubmit: ReturnType<typeof submitMock> } {
    new CaptureForm(document).open(fingerprint, {
      defaultFile: "page.spec.json",
      locales: ["en"],
      defaultLocale: "en",
      targets,
      onSubmit,
    });
    const shadow = shadowOf();
    (must(shadow.querySelector("#sp-title")) as HTMLInputElement).value = "Title";
    (must(shadow.querySelector("#sp-desc")) as HTMLTextAreaElement).value = "Desc";
    return { shadow, onSubmit };
  }

  const click = (shadow: ShadowRoot, sel: string) =>
    must(shadow.querySelector(sel)).dispatchEvent(new Event("click", { bubbles: true }));

  afterEach(() => {
    document.getElementById("specpin-capture-host")?.remove();
    document.body.innerHTML = "";
  });

  it("a lone local target is submitted by id even with no picker shown", async () => {
    const { shadow, onSubmit } = openCapture([{ id: "manual:b1", project: "CRM", kind: "local" }]);
    // No picker for a single target.
    expect(shadow.querySelector("#sp-target")).toBeNull();
    click(shadow, "#sp-save");
    await flush();
    const [, , connectionId] = onSubmit.mock.calls[0];
    expect(connectionId).toBe("manual:b1");
  });

  it("shows a picker labelled by kind when several targets serve the page", () => {
    const { shadow } = openCapture([
      { id: "uuid-1", project: "My Sidecar", kind: "sidecar" },
      { id: "manual:b1", project: "CRM", kind: "local" },
    ]);
    const sel = must(shadow.querySelector("#sp-target")) as HTMLSelectElement;
    const labels = Array.from(sel.options).map((o) => o.textContent);
    expect(labels).toEqual(["My Sidecar (sidecar)", "CRM (local)"]);
  });

  it("disables capture (explains, no submit) when no project serves the page", async () => {
    const { shadow, onSubmit } = openCapture([]);
    click(shadow, "#sp-save");
    await flush();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("mergeLocalized", () => {
  it("adds a locale without dropping existing ones", () => {
    expect(mergeLocalized({ en: "Login" }, "vi", "Đăng nhập")).toEqual({
      en: "Login",
      vi: "Đăng nhập",
    });
  });

  it("removes a locale when its value is blank", () => {
    expect(mergeLocalized({ en: "Login", vi: "x" }, "vi", "  ")).toEqual({ en: "Login" });
  });
});
