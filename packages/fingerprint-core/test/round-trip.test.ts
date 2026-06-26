import { afterEach, describe, expect, it } from "vitest";
import { captureFingerprint } from "../src/capture.js";
import { matchElement } from "../src/match.js";
import { must } from "./test-utils.js";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("capture -> match round trip", () => {
  it("anchored element round-trips at confidence 1.0", () => {
    document.body.innerHTML = `<form class="login"><button data-testid="login-submit" type="submit">Login</button></form>`;
    const el = must(document.querySelector("button"));
    const r = matchElement(captureFingerprint(el), document);
    expect(r.confidence).toBe(1.0);
    expect(r.strategy).toBe("exact");
    expect(r.el).toBe(el);
  });

  it("anchorless element round-trips via cssSelector at confidence 0.7", () => {
    document.body.innerHTML = `<section class="panel"><div class="row"><span>only</span></div></section>`;
    const el = must(document.querySelector("span"));
    const fp = captureFingerprint(el);
    expect(fp.testId).toBeNull();
    expect(fp.id).toBeNull();
    const r = matchElement(fp, document);
    expect(r.strategy).toBe("css");
    expect(r.el).toBe(el);
  });
});
