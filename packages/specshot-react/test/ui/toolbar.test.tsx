import type { ImageSource, MarkDoc } from "@specpin/specshot-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toolbar } from "../../src/ui/toolbar.js";

vi.mock("@specpin/specshot-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@specpin/specshot-core")>();
  return {
    ...actual,
    exportJson: vi.fn(),
    exportSvg: vi.fn(),
    exportLegend: vi.fn(),
  };
});

const { exportJson, exportSvg, exportLegend } = await import("@specpin/specshot-core");

const source: ImageSource = {
  bitmapUrl: "blob:fake",
  width: 100,
  height: 100,
  kind: "raster",
  name: "shot.png",
};

const doc: MarkDoc = [{ itemNo: "1", position: { startX: 0, startY: 0, endX: 10, endY: 10 } }];

function baseProps() {
  return {
    source: null as ImageSource | null,
    doc: [] as MarkDoc,
    tool: "select" as const,
    reindexMode: "hierarchical" as const,
    onLoadImage: vi.fn(),
    onImportJson: vi.fn(),
    onDetectSvg: vi.fn(),
    onSetTool: vi.fn(),
    onReindex: vi.fn(),
    onSetReindexMode: vi.fn(),
  };
}

describe("Toolbar", () => {
  it("disables image-dependent actions when there is no source", () => {
    render(<Toolbar {...baseProps()} />);
    expect(screen.getByText("Import JSON")).toBeDisabled();
    expect(screen.getByText("Select")).toBeDisabled();
    expect(screen.getByText("Add box")).toBeDisabled();
    expect(screen.getByText("JSON")).toBeDisabled();
  });

  it("enables the reindex control only when there are marks", () => {
    render(<Toolbar {...baseProps()} source={source} doc={doc} />);
    expect(screen.getByText("Reindex")).not.toBeDisabled();
  });

  it("calls exportJson/exportSvg/exportLegend from specshot-core with the current doc + name", () => {
    render(<Toolbar {...baseProps()} source={source} doc={doc} />);
    fireEvent.click(screen.getByText("JSON"));
    expect(exportJson).toHaveBeenCalledWith(doc, "shot.png");
    fireEvent.click(screen.getByText("SVG"));
    expect(exportSvg).toHaveBeenCalledWith(source, doc);
    fireEvent.click(screen.getByText("Legend"));
    expect(exportLegend).toHaveBeenCalledWith(doc, "shot.png");
  });

  it("disables PNG export when no onExportPng handler is supplied, and wires it when present", () => {
    const { rerender } = render(<Toolbar {...baseProps()} source={source} doc={doc} />);
    expect(screen.getByText("PNG")).toBeDisabled();

    const onExportPng = vi.fn();
    rerender(<Toolbar {...baseProps()} source={source} doc={doc} onExportPng={onExportPng} />);
    fireEvent.click(screen.getByText("PNG"));
    expect(onExportPng).toHaveBeenCalledWith(source, doc);
  });

  it("only enables Detect from SVG for an svg source", () => {
    render(<Toolbar {...baseProps()} source={source} doc={doc} />);
    expect(screen.getByText("Detect from SVG")).toBeDisabled();
    render(<Toolbar {...baseProps()} source={{ ...source, kind: "svg" }} doc={doc} />);
    expect(screen.getAllByText("Detect from SVG")[1]).not.toBeDisabled();
  });

  it("forwards tool selection", () => {
    const onSetTool = vi.fn();
    render(<Toolbar {...baseProps()} source={source} doc={doc} onSetTool={onSetTool} />);
    fireEvent.click(screen.getByText("Add box"));
    expect(onSetTool).toHaveBeenCalledWith("add");
  });
});
