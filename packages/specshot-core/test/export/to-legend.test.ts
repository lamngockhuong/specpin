import { describe, expect, it } from "vitest";
import { markDocToLegend, NO_LABEL } from "../../src/export/to-legend.js";
import type { MarkDoc } from "../../src/model/mark-doc.js";

const p = { startX: 0, startY: 0, endX: 10, endY: 10 };

describe("markDocToLegend", () => {
  it("emits one line per mark in itemNo order", () => {
    const doc: MarkDoc = [
      { itemNo: "2", position: p, label: "Sidebar" },
      { itemNo: "1", position: p, label: "Navbar" },
      { itemNo: "1.1", position: p, label: "Logo" },
    ];
    expect(markDocToLegend(doc)).toBe("- 1. Navbar\n- 1.1. Logo\n- 2. Sidebar");
  });

  it("falls back to a placeholder for empty labels", () => {
    const doc: MarkDoc = [{ itemNo: "1", position: p }];
    expect(markDocToLegend(doc)).toBe(`- 1. ${NO_LABEL}`);
  });

  it("trims whitespace-only labels (treats as empty)", () => {
    const doc: MarkDoc = [{ itemNo: "1", position: p, label: "   " }];
    expect(markDocToLegend(doc)).toBe(`- 1. ${NO_LABEL}`);
  });

  it("orders 6.10 after 6.9", () => {
    const doc: MarkDoc = [
      { itemNo: "6.10", position: p, label: "ten" },
      { itemNo: "6.9", position: p, label: "nine" },
    ];
    expect(markDocToLegend(doc)).toBe("- 6.9. nine\n- 6.10. ten");
  });

  it("handles large docs (100+ items)", () => {
    const items: MarkDoc = Array.from({ length: 100 }, (_, i) => ({
      itemNo: String(i + 1),
      position: p,
      label: `Item ${i + 1}`,
    }));
    const legend = markDocToLegend(items);
    const lines = legend.split("\n");
    expect(lines).toHaveLength(100);
    expect(lines[0]).toBe("- 1. Item 1");
    expect(lines[99]).toBe("- 100. Item 100");
  });

  it("preserves mixed-depth hierarchical ordering (6.1, 6.10, 6.1.1)", () => {
    const doc: MarkDoc = [
      { itemNo: "6.1.1", position: p, label: "deep" },
      { itemNo: "6.10", position: p, label: "two-digit" },
      { itemNo: "6.1", position: p, label: "child" },
      { itemNo: "6", position: p, label: "parent" },
    ];
    const legend = markDocToLegend(doc);
    const lines = legend.split("\n");
    expect(lines[0]).toContain("6.");
    expect(lines[1]).toContain("6.1.");
    expect(lines[2]).toContain("6.1.1.");
    expect(lines[3]).toContain("6.10.");
  });

  it("preserves special characters and Vietnamese in labels", () => {
    const doc: MarkDoc = [
      { itemNo: "1", position: p, label: 'Nút "Đăng nhập" (Sign in)' },
      { itemNo: "2", position: p, label: "Thanh tìm kiếm™" },
    ];
    const legend = markDocToLegend(doc);
    expect(legend).toContain('Nút "Đăng nhập" (Sign in)');
    expect(legend).toContain("Thanh tìm kiếm™");
  });

  it("handles empty doc gracefully", () => {
    const legend = markDocToLegend([]);
    expect(legend).toBe("");
  });
});
