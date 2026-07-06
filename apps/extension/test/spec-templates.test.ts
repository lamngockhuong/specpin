import { describe, expect, it } from "vitest";
import {
  applyTemplate,
  SPEC_TEMPLATES,
  type TemplateFields,
} from "../src/content/spec-templates.js";

// A translate stub: echoes the key so assertions can see which key resolved
// (stands in for the localized body without loading the i18n table).
const echo = (key: string) => `TX:${key}`;

const empty: TemplateFields = { tags: [], businessRules: [], status: null };

describe("SPEC_TEMPLATES registry", () => {
  it("has the fixed built-in set with unique ids", () => {
    const ids = SPEC_TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(["form-validation", "api-error", "auth-flow"]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("applyTemplate (fill-empty)", () => {
  it("fills empty tags, rules, and status from the template", () => {
    const out = applyTemplate(empty, "form-validation", echo);
    expect(out.tags).toEqual(["validation"]);
    expect(out.status).toBe("draft");
    expect(out.businessRules).toEqual([
      "TX:template.formValidation.rule1",
      "TX:template.formValidation.rule2",
    ]);
  });

  it("never overwrites user-entered fields", () => {
    const current: TemplateFields = {
      tags: ["mine"],
      businessRules: ["my rule"],
      status: "approved",
    };
    const out = applyTemplate(current, "form-validation", echo);
    expect(out.tags).toEqual(["mine"]);
    expect(out.businessRules).toEqual(["my rule"]);
    expect(out.status).toBe("approved");
  });

  it("treats whitespace-only rules as empty and fills them", () => {
    const out = applyTemplate({ tags: [], businessRules: ["  "], status: null }, "api-error", echo);
    expect(out.businessRules).toEqual(["TX:template.apiError.rule1", "TX:template.apiError.rule2"]);
  });

  it("is a no-op for an unknown template id", () => {
    const out = applyTemplate(empty, "does-not-exist", echo);
    expect(out).toEqual(empty);
  });
});
