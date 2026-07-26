import { describe, expect, it, vi } from "vitest";
import { attachPanZoom } from "../src/graph/pan-zoom.js";

// Covers the button-zoom API the on-canvas graph toolbar drives (zoomBy / reset).
// jsdom's getBoundingClientRect reports a zero-sized rect, so the center anchor
// is (0,0) here -- which keeps the translate at 0 and lets us assert the scale
// factor cleanly. The cursor-anchored wheel path is exercised via real events
// elsewhere; this pins the programmatic controller surface.

const SVG_NS = "http://www.w3.org/2000/svg";

function setup() {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  const target = document.createElementNS(SVG_NS, "g") as SVGGElement;
  svg.appendChild(target);
  return { target, controller: attachPanZoom(svg, target) };
}

describe("attachPanZoom -- button zoom controller", () => {
  it("zoomBy multiplies the current scale", () => {
    const { target, controller } = setup();
    controller.zoomBy(1.2);
    expect(target.style.transform).toContain("scale(1.2)");
  });

  it("zoomBy compounds across calls", () => {
    const { target, controller } = setup();
    controller.zoomBy(1.5);
    controller.zoomBy(2);
    expect(target.style.transform).toContain("scale(3)");
  });

  it("clamps zoom-out to the minimum scale", () => {
    const { target, controller } = setup();
    // MIN_SCALE is 0.1; a huge shrink must not drive the scale to zero/negative.
    controller.zoomBy(0.0001);
    expect(target.style.transform).toContain("scale(0.1)");
  });

  it("reset returns to the identity transform", () => {
    const { target, controller } = setup();
    controller.zoomBy(2);
    controller.reset();
    expect(target.style.transform).toBe("translate(0px, 0px) scale(1)");
  });
});

// Regression: capturing the pointer on pointerdown made the browser retarget
// the ensuing `click` to the <svg> surface, so node/edge <g> click handlers
// never fired -- silently breaking selection in the graph (but not the table,
// which has no pan-zoom). A plain press-release (no real travel) must NOT
// capture, so the click reaches the node/edge underneath; only a drag past the
// threshold captures + pans.
describe("attachPanZoom -- click vs drag", () => {
  function pressReleaseSetup() {
    const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    const target = document.createElementNS(SVG_NS, "g") as SVGGElement;
    svg.appendChild(target);
    // Stub the capture APIs so the assertions work regardless of the DOM env's
    // pointer-capture support, and so hasPointerCapture reflects our calls.
    const captured = new Set<number>();
    svg.setPointerCapture = vi.fn((id: number) => void captured.add(id));
    svg.releasePointerCapture = vi.fn((id: number) => void captured.delete(id));
    svg.hasPointerCapture = ((id: number) => captured.has(id)) as typeof svg.hasPointerCapture;
    attachPanZoom(svg, target);
    return { svg, target };
  }

  function pointer(type: string, x: number, y: number): PointerEvent {
    return new PointerEvent(type, { pointerId: 1, button: 0, clientX: x, clientY: y });
  }

  it("a press-release with no movement never captures the pointer (click passes through)", () => {
    const { svg, target } = pressReleaseSetup();
    svg.dispatchEvent(pointer("pointerdown", 100, 100));
    svg.dispatchEvent(pointer("pointerup", 100, 100));
    expect(svg.setPointerCapture).not.toHaveBeenCalled();
    // No pan applied for a click-sized interaction.
    expect(target.style.transform).toBe("translate(0px, 0px) scale(1)");
  });

  it("a sub-threshold jitter still stays a click (no capture, no pan)", () => {
    const { svg, target } = pressReleaseSetup();
    svg.dispatchEvent(pointer("pointerdown", 100, 100));
    svg.dispatchEvent(pointer("pointermove", 101, 102)); // < DRAG_THRESHOLD (3px)
    svg.dispatchEvent(pointer("pointerup", 101, 102));
    expect(svg.setPointerCapture).not.toHaveBeenCalled();
    expect(target.style.transform).toBe("translate(0px, 0px) scale(1)");
  });

  it("a drag past the threshold captures and pans", () => {
    const { svg, target } = pressReleaseSetup();
    svg.dispatchEvent(pointer("pointerdown", 100, 100));
    svg.dispatchEvent(pointer("pointermove", 120, 100)); // crosses threshold -> capture
    svg.dispatchEvent(pointer("pointermove", 140, 110)); // pans by (20,10)
    expect(svg.setPointerCapture).toHaveBeenCalledWith(1);
    expect(target.style.transform).toBe("translate(20px, 10px) scale(1)");
  });
});
