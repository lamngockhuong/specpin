import type { ImageSource, MarkDoc } from "@specpin/specshot-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorCanvas } from "../../src/canvas/editor-canvas.js";

const source: ImageSource = {
  bitmapUrl: "blob:fake",
  width: 200,
  height: 100,
  kind: "raster",
  name: "shot.png",
};

const doc: MarkDoc = [{ itemNo: "1", position: { startX: 10, startY: 10, endX: 40, endY: 40 } }];

describe("EditorCanvas", () => {
  it("renders the source image and one mark per doc item", () => {
    render(
      <EditorCanvas
        source={source}
        doc={doc}
        dispatch={vi.fn()}
        selectedItemNo={null}
        onSelect={vi.fn()}
        tool="select"
      />,
    );
    expect(screen.getByAltText("shot.png")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("adds the tool-add class to the canvas when the add tool is active", () => {
    const { container } = render(
      <EditorCanvas
        source={source}
        doc={doc}
        dispatch={vi.fn()}
        selectedItemNo={null}
        onSelect={vi.fn()}
        tool="add"
      />,
    );
    expect(container.querySelector(".canvas.tool-add")).not.toBeNull();
  });

  it("the Fit button re-fits the viewport without throwing", () => {
    render(
      <EditorCanvas
        source={source}
        doc={doc}
        dispatch={vi.fn()}
        selectedItemNo={null}
        onSelect={vi.fn()}
        tool="select"
      />,
    );
    fireEvent.click(screen.getByTitle("Fit to screen"));
    expect(screen.getByText(/%$/)).toBeInTheDocument();
  });
});
