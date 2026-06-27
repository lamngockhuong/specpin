import { describe, expect, it } from "vitest";
import type { TaggedSpec } from "../src/shared/connection-types.js";
import { specMatchesQuery } from "../src/shared/surface-data.js";

/** Minimal TaggedSpec for the query predicate (only the matched fields matter). */
function spec(partial: {
  title?: Record<string, string>;
  description?: Record<string, string>;
  file?: string;
  tags?: string[];
}): TaggedSpec {
  return {
    id: "s",
    title: partial.title ?? { en: "Login button" },
    description: partial.description ?? { en: "Submits the form" },
    tags: partial.tags,
    _file: partial.file ?? "login.spec.json",
    connectionId: "c",
    project: "P",
  } as unknown as TaggedSpec;
}

describe("specMatchesQuery", () => {
  it("matches everything on a blank or whitespace query", () => {
    expect(specMatchesQuery(spec({}), "", "en", "en")).toBe(true);
    expect(specMatchesQuery(spec({}), "   ", "en", "en")).toBe(true);
  });

  it("matches the localized title case-insensitively", () => {
    expect(specMatchesQuery(spec({ title: { en: "Login button" } }), "LOGIN", "en", "en")).toBe(
      true,
    );
    expect(specMatchesQuery(spec({ title: { en: "Login button" } }), "logout", "en", "en")).toBe(
      false,
    );
  });

  it("resolves the title in the active locale before matching", () => {
    const s = spec({ title: { en: "Login", vi: "Đăng nhập" } });
    expect(specMatchesQuery(s, "đăng", "vi", "en")).toBe(true);
    expect(specMatchesQuery(s, "đăng", "en", "en")).toBe(false);
  });

  it("matches the file path and tags", () => {
    expect(specMatchesQuery(spec({ file: "checkout.spec.json" }), "checkout", "en", "en")).toBe(
      true,
    );
    expect(specMatchesQuery(spec({ tags: ["auth", "critical"] }), "critical", "en", "en")).toBe(
      true,
    );
  });

  it("matches the description only when includeBody is set", () => {
    const s = spec({ title: { en: "Btn" }, description: { en: "Submits the order" } });
    expect(specMatchesQuery(s, "order", "en", "en")).toBe(false);
    expect(specMatchesQuery(s, "order", "en", "en", true)).toBe(true);
  });
});
