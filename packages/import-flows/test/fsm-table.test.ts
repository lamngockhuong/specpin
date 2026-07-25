import { validateFlows } from "@specpin/spec-schema";
import { describe, expect, it } from "vitest";
import { extractFsmTable } from "../src/adapters/fsm-table.js";

const ARRAY_SOURCE = `
export const DEAL_TRANSITIONS = [
  { from: "draft", to: "negotiation", trigger: "Start negotiation" },
  { from: "negotiation", to: "won", trigger: "Mark won", role: "admin" },
  { from: "negotiation", to: "lost", trigger: "Mark lost" },
  { from: "draft", to: "lost", trigger: "Cancel", guard: "no owner assigned" },
];
`;

describe("extractFsmTable — array-of-edges form", () => {
  it("derives states in first-appearance order with inferred kind", () => {
    const { states, warnings } = extractFsmTable({
      sourceText: ARRAY_SOURCE,
      exportName: "DEAL_TRANSITIONS",
    });
    expect(warnings).toEqual([]);
    expect(states.map((s) => s.id)).toEqual(["draft", "negotiation", "won", "lost"]);
    expect(states.find((s) => s.id === "draft")?.kind).toBe("initial"); // never a `to`
    expect(states.find((s) => s.id === "negotiation")?.kind).toBe("normal");
    expect(states.find((s) => s.id === "won")?.kind).toBe("terminal"); // never a `from`
    expect(states.find((s) => s.id === "lost")?.kind).toBe("terminal");
    expect(states.every((s) => s.label.en === s.id)).toBe(true);
  });

  it("derives transitions with slug ids, LocalizedString trigger, source: imported", () => {
    const { transitions } = extractFsmTable({
      sourceText: ARRAY_SOURCE,
      exportName: "DEAL_TRANSITIONS",
    });
    expect(transitions).toHaveLength(4);
    const startNegotiation = transitions.find((t) => t.from === "draft" && t.to === "negotiation");
    expect(startNegotiation).toMatchObject({
      id: "draft-start-negotiation-negotiation",
      trigger: { en: "Start negotiation" },
      source: "imported",
    });
    const markWon = transitions.find((t) => t.to === "won");
    expect(markWon).toMatchObject({ role: "admin", source: "imported" });
    const cancel = transitions.find((t) => t.trigger.en === "Cancel");
    expect(cancel).toMatchObject({ guard: "no owner assigned" });
  });

  it("produces a Flow that validateFlows accepts", () => {
    const { states, transitions } = extractFsmTable({
      sourceText: ARRAY_SOURCE,
      exportName: "DEAL_TRANSITIONS",
    });
    const result = validateFlows({
      version: "1.0",
      flows: [{ id: "deal-status", object: { en: "Deal" }, states, transitions }],
    });
    expect(result.valid).toBe(true);
  });

  it("dedupes colliding transition ids with a numeric suffix", () => {
    const source = `
      export const T = [
        { from: "a", to: "b", trigger: "go" },
        { from: "a", to: "b", trigger: "go" },
      ];
    `;
    const { transitions } = extractFsmTable({ sourceText: source, exportName: "T" });
    expect(transitions.map((t) => t.id)).toEqual(["a-go-b", "a-go-b-2"]);
  });

  it("warns and skips non-object array entries instead of throwing", () => {
    const source = `
      export const T = [
        { from: "a", to: "b", trigger: "go" },
        "not-an-object",
        42,
      ];
    `;
    const { transitions, warnings } = extractFsmTable({ sourceText: source, exportName: "T" });
    expect(transitions).toHaveLength(1);
    expect(warnings.some((w) => w.includes("skipped 2 non-object"))).toBe(true);
  });

  it("warns and skips edges missing a required field", () => {
    const source = `
      export const T = [
        { from: "a", to: "b", trigger: "go" },
        { from: "a", trigger: "go" },
      ];
    `;
    const { transitions, warnings } = extractFsmTable({ sourceText: source, exportName: "T" });
    expect(transitions).toHaveLength(1);
    expect(warnings.some((w) => w.includes('missing required "from"/"to"/"trigger"'))).toBe(true);
  });
});

describe("extractFsmTable — record form", () => {
  it("derives edges from { fromState: { trigger: toState } }", () => {
    const source = `
      export const T = {
        draft: { submit: "pending" },
        pending: { approve: "approved", reject: "rejected" },
      };
    `;
    const { states, transitions, warnings } = extractFsmTable({
      sourceText: source,
      exportName: "T",
    });
    expect(warnings).toEqual([]);
    expect(states.map((s) => s.id)).toEqual(["draft", "pending", "approved", "rejected"]);
    expect(transitions).toHaveLength(3);
    expect(transitions.find((t) => t.trigger.en === "submit")).toMatchObject({
      from: "draft",
      to: "pending",
      source: "imported",
    });
  });
});

describe("extractFsmTable — malformed/empty input", () => {
  it("warns (does not throw) when the export is not found", () => {
    const { states, transitions, warnings } = extractFsmTable({
      sourceText: "export const OTHER = [];",
      exportName: "MISSING",
    });
    expect(states).toEqual([]);
    expect(transitions).toEqual([]);
    expect(warnings.some((w) => w.includes('export "MISSING" not found'))).toBe(true);
  });

  it("warns when no export name is given", () => {
    const { warnings } = extractFsmTable({ sourceText: "export const T = [];" });
    expect(warnings.some((w) => w.includes("requires an export name"))).toBe(true);
  });

  it("warns when the export is an empty array", () => {
    const { warnings } = extractFsmTable({ sourceText: "export const T = [];", exportName: "T" });
    expect(warnings.some((w) => w.includes("no usable edges"))).toBe(true);
  });

  it("warns when the export is neither array nor record", () => {
    const { warnings } = extractFsmTable({ sourceText: "export const T = 42;", exportName: "T" });
    expect(warnings.some((w) => w.includes("neither an array-of-edges nor a record"))).toBe(true);
  });

  it("is deterministic: re-running on identical input yields byte-identical output", () => {
    const first = extractFsmTable({ sourceText: ARRAY_SOURCE, exportName: "DEAL_TRANSITIONS" });
    const second = extractFsmTable({ sourceText: ARRAY_SOURCE, exportName: "DEAL_TRANSITIONS" });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
