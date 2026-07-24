import type { MarkDoc } from "@specpin/specshot-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItemListPanel } from "../../src/ui/item-list-panel.js";

const doc: MarkDoc = [
  { itemNo: "2", position: { startX: 0, startY: 0, endX: 10, endY: 10 } },
  { itemNo: "1", position: { startX: 0, startY: 0, endX: 10, endY: 10 }, label: "Header" },
];

describe("ItemListPanel", () => {
  it("shows the empty message when the doc has no marks", () => {
    render(
      <ItemListPanel
        doc={[]}
        selectedItemNo={null}
        onSelect={vi.fn()}
        onSetLabel={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/no marks yet/i)).toBeInTheDocument();
  });

  it("lists marks sorted by itemNo, not insertion order", () => {
    const { container } = render(
      <ItemListPanel
        doc={doc}
        selectedItemNo={null}
        onSelect={vi.fn()}
        onSetLabel={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const itemNos = [...container.querySelectorAll(".item-no")].map((el) => el.textContent);
    expect(itemNos).toEqual(["1", "2"]);
  });

  it("selects a row on click", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <ItemListPanel
        doc={doc}
        selectedItemNo={null}
        onSelect={onSelect}
        onSetLabel={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const secondRow = container.querySelectorAll(".item-list li")[1] as HTMLElement;
    fireEvent.click(secondRow);
    expect(onSelect).toHaveBeenCalledWith("2");
  });

  it("edits a label without triggering row selection", () => {
    const onSetLabel = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <ItemListPanel
        doc={doc}
        selectedItemNo={null}
        onSelect={onSelect}
        onSetLabel={onSetLabel}
        onDelete={vi.fn()}
      />,
    );
    const firstRowInput = container.querySelector(".item-list li .item-label") as HTMLInputElement;
    fireEvent.change(firstRowInput, { target: { value: "New label" } });
    expect(onSetLabel).toHaveBeenCalledWith("1", "New label");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("deletes a row without triggering selection", () => {
    const onDelete = vi.fn();
    const onSelect = vi.fn();
    render(
      <ItemListPanel
        doc={doc}
        selectedItemNo={null}
        onSelect={onSelect}
        onSetLabel={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getAllByTitle("Delete")[0] as HTMLElement);
    expect(onDelete).toHaveBeenCalledWith("1");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
