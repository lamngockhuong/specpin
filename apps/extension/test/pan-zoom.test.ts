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

// Regression: cursor-anchored wheel zoom drifted diagonally because it treated
// `clientX - rect.left` as user-space coordinates. The <svg> has a viewBox with
// width/height=100%, so screen px differ from user units by the viewBox scale
// AND a per-axis preserveAspectRatio letterbox offset -- which is why the drift
// looked diagonal. The fix maps the cursor through getScreenCTM to user space.
describe("attachPanZoom -- cursor-anchored wheel zoom (viewBox mapping)", () => {
  const SVG_NS_ = SVG_NS;

  // user->screen: screen = 0.5*user + (offset). Non-zero, asymmetric offset
  // (100 in x, 20 in y) models the letterbox; inverse takes screen -> user.
  function ctmSetup(kx = 0.5, ky = 0.5, ox = 100, oy = 20) {
    const svg = document.createElementNS(SVG_NS_, "svg") as SVGSVGElement;
    const target = document.createElementNS(SVG_NS_, "g") as SVGGElement;
    svg.appendChild(target);
    const inverse = {
      // screen -> user
      apply: (p: { x: number; y: number }) => ({ x: (p.x - ox) / kx, y: (p.y - oy) / ky }),
    };
    svg.getScreenCTM = (() => ({ inverse: () => inverse })) as unknown as typeof svg.getScreenCTM;
    svg.createSVGPoint = (() => {
      const pt = { x: 0, y: 0, matrixTransform: (m: typeof inverse) => m.apply(pt) };
      return pt;
    }) as unknown as typeof svg.createSVGPoint;
    attachPanZoom(svg, target);
    return { svg, target, kx, ky, ox, oy };
  }

  function parseTransform(t: string) {
    const m = t.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/);
    if (!m) throw new Error(`unparseable transform: ${t}`);
    return { tx: Number(m[1]), ty: Number(m[2]), scale: Number(m[3]) };
  }

  it("keeps the graph point under the cursor fixed (anchors in user space, not screen px)", () => {
    const { svg, target, kx, ky, ox, oy } = ctmSetup();
    const clientX = 300;
    const clientY = 200;
    // The user-space point the cursor sits over, per the CTM inverse.
    const anchorX = (clientX - ox) / kx; // (300-100)/0.5 = 400
    const anchorY = (clientY - oy) / ky; // (200-20)/0.5 = 360

    // happy-dom's WheelEvent init drops clientX/clientY, so pin them explicitly.
    const wheel = new WheelEvent("wheel", { deltaY: -100, cancelable: true });
    Object.defineProperty(wheel, "clientX", { value: clientX, configurable: true });
    Object.defineProperty(wheel, "clientY", { value: clientY, configurable: true });
    svg.dispatchEvent(wheel);

    const { tx, ty, scale } = parseTransform(target.style.transform);
    expect(scale).toBeGreaterThan(1); // zoomed in
    // Invariant: the anchored user point maps to the same local coord after zoom.
    expect(scale * anchorX + tx).toBeCloseTo(anchorX, 6);
    expect(scale * anchorY + ty).toBeCloseTo(anchorY, 6);
    // And it is genuinely the CTM-mapped anchor, not the raw screen point: the
    // invariant must NOT hold at the un-mapped (clientX, clientY).
    expect(scale * clientX + tx).not.toBeCloseTo(clientX, 6);
  });
});
