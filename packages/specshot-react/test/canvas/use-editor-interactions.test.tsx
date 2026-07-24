import type { MarkAction, MarkDoc } from "@specpin/specshot-core";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Dispatch } from "react";
import { describe, expect, it, vi } from "vitest";
import { type Tool, useEditorInteractions } from "../../src/canvas/use-editor-interactions.js";

// The container has no real layout under happy-dom (clientWidth/Height report
// 0), so the real fitToContainer would collapse the viewport to a near-zero
// scale on mount. Pin it to an identity viewport so gesture math below is
// exercised against known, stable numbers — fitToContainer itself is unit
// tested in @specpin/specshot-core.
vi.mock("@specpin/specshot-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@specpin/specshot-core")>();
  return { ...actual, fitToContainer: () => ({ scale: 1, offsetX: 0, offsetY: 0 }) };
});

interface HarnessProps {
  doc: MarkDoc;
  dispatch: Dispatch<MarkAction>;
  tool: Tool;
  onSelect?: (itemNo: string | null) => void;
}

function Harness({ doc, dispatch, tool, onSelect = () => {} }: HarnessProps) {
  const {
    containerRef,
    viewport,
    onWheel,
    onCanvasPointerDown,
    onMarkPointerDown,
    onHandlePointerDown,
  } = useEditorInteractions({ doc, dispatch, imageWidth: 200, imageHeight: 200, tool, onSelect });

  return (
    <div>
      <span data-testid="scale">{viewport.scale}</span>
      <span data-testid="offset">
        {viewport.offsetX},{viewport.offsetY}
      </span>
      <div
        ref={containerRef}
        data-testid="canvas"
        onWheel={onWheel}
        onPointerDown={onCanvasPointerDown}
      />
      <button type="button" data-testid="mark-1" onPointerDown={(e) => onMarkPointerDown("1", e)}>
        mark-1
      </button>
      <button
        type="button"
        data-testid="handle-se"
        onPointerDown={(e) => onHandlePointerDown("1", "se", e)}
      >
        handle-se
      </button>
    </div>
  );
}

const oneItemDoc: MarkDoc = [
  { itemNo: "1", position: { startX: 10, startY: 10, endX: 30, endY: 30 } },
];

describe("useEditorInteractions", () => {
  it("starts with an identity viewport", () => {
    render(<Harness doc={[]} dispatch={vi.fn()} tool="select" />);
    expect(screen.getByTestId("scale")).toHaveTextContent("1");
  });

  it("add tool: a drag past the 3px threshold dispatches an add action", () => {
    const dispatch = vi.fn();
    render(<Harness doc={[]} dispatch={dispatch} tool="add" />);
    const canvas = screen.getByTestId("canvas");
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(window, { clientX: 60, clientY: 60 });
    fireEvent.pointerUp(window);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "add", position: expect.any(Object) }),
    );
  });

  it("add tool: a tiny drag (<=3px) does not dispatch an add action", () => {
    const dispatch = vi.fn();
    render(<Harness doc={[]} dispatch={dispatch} tool="add" />);
    const canvas = screen.getByTestId("canvas");
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(window, { clientX: 11, clientY: 11 });
    fireEvent.pointerUp(window);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("select tool: pointer-down on empty canvas clears selection and pans the viewport", () => {
    const onSelect = vi.fn();
    render(<Harness doc={[]} dispatch={vi.fn()} tool="select" onSelect={onSelect} />);
    const canvas = screen.getByTestId("canvas");
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, button: 0 });
    expect(onSelect).toHaveBeenCalledWith(null);
    fireEvent.pointerMove(window, { clientX: 30, clientY: 20 });
    fireEvent.pointerUp(window);
    expect(screen.getByTestId("offset")).toHaveTextContent("20,10");
  });

  it("drags a mark: pointer-down + move dispatches a move action with the delta applied", () => {
    const dispatch = vi.fn();
    render(<Harness doc={oneItemDoc} dispatch={dispatch} tool="select" />);
    fireEvent.pointerDown(screen.getByTestId("mark-1"), { clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(window, { clientX: 15, clientY: 25 });
    expect(dispatch).toHaveBeenCalledWith({
      type: "move",
      itemNo: "1",
      position: { startX: 15, startY: 25, endX: 35, endY: 45 },
    });
    fireEvent.pointerUp(window);
  });

  it("resizes a mark: pointer-down on a handle + move dispatches a resize action", () => {
    const dispatch = vi.fn();
    render(<Harness doc={oneItemDoc} dispatch={dispatch} tool="select" />);
    fireEvent.pointerDown(screen.getByTestId("handle-se"), { clientX: 30, clientY: 30, button: 0 });
    fireEvent.pointerMove(window, { clientX: 50, clientY: 50 });
    expect(dispatch).toHaveBeenCalledWith({
      type: "resize",
      itemNo: "1",
      position: { startX: 10, startY: 10, endX: 50, endY: 50 },
    });
    fireEvent.pointerUp(window);
  });

  it("wheel zoom keeps the scale within [MIN_SCALE, MAX_SCALE]", () => {
    render(<Harness doc={[]} dispatch={vi.fn()} tool="select" />);
    const canvas = screen.getByTestId("canvas");
    fireEvent.wheel(canvas, { deltaY: -100, clientX: 0, clientY: 0 });
    const scale = Number(screen.getByTestId("scale").textContent);
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThanOrEqual(20);
  });
});
