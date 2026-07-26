import { describe, expect, it } from "vitest";
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
