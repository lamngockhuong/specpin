import type { MarkDoc, Viewport } from "@specpin/specshot-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarksLayer } from "../../src/canvas/marks-layer.js";

const viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };

const doc: MarkDoc = [
  { itemNo: "1", position: { startX: 10, startY: 10, endX: 50, endY: 40 } },
  { itemNo: "2", position: { startX: 60, startY: 60, endX: 100, endY: 90 }, label: "Button" },
];

describe("MarksLayer", () => {
  it("renders one box per doc item with its itemNo label", () => {
    render(<MarksLayer doc={doc} viewport={viewport} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark 2: Button" })).toBeInTheDocument();
  });

  it("renders no resize handles when nothing is selected", () => {
    const { container } = render(<MarksLayer doc={doc} viewport={viewport} />);
    expect(container.querySelectorAll(".handle")).toHaveLength(0);
  });

  it("renders the eight resize handles for the selected item only", () => {
    const { container } = render(
      <MarksLayer doc={doc} viewport={viewport} selectedItemNo="1" onHandlePointerDown={vi.fn()} />,
    );
    expect(container.querySelectorAll(".handle")).toHaveLength(8);
  });

  it("forwards pointer-down on a mark body with its itemNo", () => {
    const onMarkPointerDown = vi.fn();
    render(<MarksLayer doc={doc} viewport={viewport} onMarkPointerDown={onMarkPointerDown} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Mark 1" }));
    expect(onMarkPointerDown).toHaveBeenCalledWith("1", expect.anything());
  });

  it("forwards pointer-down on a resize handle with its itemNo and handle id", () => {
    const onHandlePointerDown = vi.fn();
    const { container } = render(
      <MarksLayer
        doc={doc}
        viewport={viewport}
        selectedItemNo="2"
        onHandlePointerDown={onHandlePointerDown}
      />,
    );
    const nwHandle = container.querySelector(".handle-nw");
    expect(nwHandle).not.toBeNull();
    if (nwHandle) fireEvent.pointerDown(nwHandle);
    expect(onHandlePointerDown).toHaveBeenCalledWith("2", "nw", expect.anything());
  });
});
