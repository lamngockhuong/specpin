import { describe, expect, it } from "vitest";
import {
  buildVisibilityState,
  effectiveDisabled,
  facetInventory,
  isVisible,
  matchPathGlob,
  type PersonalVisibility,
  pageHidden,
  setSpecVisibility,
  specFacets,
  toggleFacet,
  type VisibilityState,
} from "../src/shared/visibility.js";

const PERSONAL = (p: Partial<PersonalVisibility> = {}): PersonalVisibility => ({
  forceHide: [],
  forceShow: [],
  ...p,
});

const STATE = (p: Partial<VisibilityState> = {}): VisibilityState => ({
  teamHidden: [],
  personal: PERSONAL(),
  ...p,
});

const authSpec = { id: "login", tags: ["auth", "form"], file: "login.spec.json" };
const otherSpec = { id: "home", tags: ["nav"], file: "home.spec.json" };

describe("specFacets", () => {
  it("derives tag:, file:, spec: keys", () => {
    expect(specFacets(authSpec)).toEqual([
      "tag:auth",
      "tag:form",
      "file:login.spec.json",
      "spec:login",
    ]);
  });

  it("omits tag/file keys when absent", () => {
    expect(specFacets({ id: "x" })).toEqual(["spec:x"]);
  });
});

describe("effectiveDisabled", () => {
  it("unions teamHidden + forceHide, then subtracts forceShow", () => {
    const state = STATE({
      teamHidden: ["tag:auth"],
      personal: PERSONAL({ forceHide: ["file:home.spec.json"], forceShow: ["tag:auth"] }),
    });
    expect(effectiveDisabled(state)).toEqual(new Set(["file:home.spec.json"]));
  });
});

describe("isVisible", () => {
  it("empty state -> everything visible (backward compat)", () => {
    expect(isVisible(authSpec, "https://x.test/", STATE())).toBe(true);
    expect(isVisible(otherSpec, "https://x.test/", STATE())).toBe(true);
  });

  it("team hides tag:auth -> auth spec hidden, others visible", () => {
    const state = STATE({ teamHidden: ["tag:auth"] });
    expect(isVisible(authSpec, "https://x.test/", state)).toBe(false);
    expect(isVisible(otherSpec, "https://x.test/", state)).toBe(true);
  });

  it("personal force-show of the same tag re-reveals it (personal wins)", () => {
    const state = STATE({
      teamHidden: ["tag:auth"],
      personal: PERSONAL({ forceShow: ["tag:auth"] }),
    });
    expect(isVisible(authSpec, "https://x.test/", state)).toBe(true);
  });

  it("personal force-hide a file over empty team -> hidden", () => {
    const state = STATE({ personal: PERSONAL({ forceHide: ["file:login.spec.json"] }) });
    expect(isVisible(authSpec, "https://x.test/", state)).toBe(false);
  });

  it("spec:<id> hide hides exactly that spec", () => {
    const state = STATE({ personal: PERSONAL({ forceHide: ["spec:login"] }) });
    expect(isVisible(authSpec, "https://x.test/", state)).toBe(false);
    expect(isVisible(otherSpec, "https://x.test/", state)).toBe(true);
  });

  it("cross-axis: spec:<id> force-show wins over a tag hide", () => {
    const state = STATE({
      teamHidden: ["tag:auth"],
      personal: PERSONAL({ forceShow: ["spec:login"] }),
    });
    expect(isVisible(authSpec, "https://x.test/", state)).toBe(true);
  });

  it("cross-axis negative: a different file force-show does not rescue a tag hide", () => {
    const state = STATE({
      teamHidden: ["tag:auth"],
      personal: PERSONAL({ forceShow: ["file:other.json"] }),
    });
    expect(isVisible(authSpec, "https://x.test/", state)).toBe(false);
  });

  it("page gate beats per-spec force-show", () => {
    const state = STATE({
      teamHidden: ["url:/admin/**"],
      personal: PERSONAL({ forceShow: ["spec:login"] }),
    });
    expect(isVisible(authSpec, "https://x.test/admin/users", state)).toBe(false);
  });
});

describe("buildVisibilityState", () => {
  it("unions multiple team sets (dedup) and passes personal through", () => {
    const personal = PERSONAL({ forceShow: ["tag:auth"] });
    const state = buildVisibilityState([["tag:auth"], ["tag:auth", "file:x"]], personal);
    expect(new Set(state.teamHidden)).toEqual(new Set(["tag:auth", "file:x"]));
    expect(state.personal).toBe(personal);
  });

  it("empty sets -> empty teamHidden", () => {
    expect(buildVisibilityState([], PERSONAL())).toEqual({ teamHidden: [], personal: PERSONAL() });
  });
});

describe("matchPathGlob", () => {
  it("* matches one segment only", () => {
    expect(matchPathGlob("/admin/*", "/admin/users")).toBe(true);
    expect(matchPathGlob("/admin/*", "/admin/users/edit")).toBe(false);
  });

  it("** matches across segments", () => {
    expect(matchPathGlob("/admin/**", "/admin/users")).toBe(true);
    expect(matchPathGlob("/admin/**", "/admin/users/edit")).toBe(true);
  });

  it("exact path and root", () => {
    expect(matchPathGlob("/admin/users", "/admin/users")).toBe(true);
    expect(matchPathGlob("/", "/")).toBe(true);
    expect(matchPathGlob("/", "/admin")).toBe(false);
  });

  it("normalizes trailing slashes", () => {
    expect(matchPathGlob("/admin/users/", "/admin/users")).toBe(true);
    expect(matchPathGlob("/admin/users", "/admin/users/")).toBe(true);
  });
});

describe("pageHidden", () => {
  it("a url glob in the disabled set hides the page", () => {
    const state = STATE({ teamHidden: ["url:/admin/**"] });
    expect(pageHidden("https://x.test/admin/users", state)).toBe(true);
    expect(pageHidden("https://x.test/home", state)).toBe(false);
  });

  it("personal force-show of the url re-enables the page", () => {
    const state = STATE({
      teamHidden: ["url:/admin/**"],
      personal: PERSONAL({ forceShow: ["url:/admin/**"] }),
    });
    expect(pageHidden("https://x.test/admin/users", state)).toBe(false);
  });
});

describe("toggleFacet", () => {
  it("toggling a default-on facet OFF adds force-hide", () => {
    const next = toggleFacet(STATE(), "tag:auth", false);
    expect(next).toEqual({ forceHide: ["tag:auth"], forceShow: [] });
  });

  it("toggling a team-hidden facet ON adds force-show", () => {
    const next = toggleFacet(STATE({ teamHidden: ["tag:auth"] }), "tag:auth", true);
    expect(next).toEqual({ forceHide: [], forceShow: ["tag:auth"] });
  });

  it("returning to default removes the override entry (idempotent)", () => {
    const hidden = STATE({ personal: PERSONAL({ forceHide: ["tag:auth"] }) });
    expect(toggleFacet(hidden, "tag:auth", true)).toEqual({ forceHide: [], forceShow: [] });

    const shown = STATE({
      teamHidden: ["tag:auth"],
      personal: PERSONAL({ forceShow: ["tag:auth"] }),
    });
    expect(toggleFacet(shown, "tag:auth", false)).toEqual({ forceHide: [], forceShow: [] });
  });

  it("toggling a team-hidden facet OFF stays at default (no entry)", () => {
    const next = toggleFacet(STATE({ teamHidden: ["tag:auth"] }), "tag:auth", false);
    expect(next).toEqual({ forceHide: [], forceShow: [] });
  });
});

describe("setSpecVisibility", () => {
  const url = "https://x.test/";

  it("hiding a default-visible spec adds a force-hide", () => {
    expect(setSpecVisibility(authSpec, url, STATE(), false)).toEqual({
      forceHide: ["spec:login"],
      forceShow: [],
    });
  });

  it("showing a tag-hidden spec adds a cross-axis force-show", () => {
    const state = STATE({ teamHidden: ["tag:auth"] });
    expect(setSpecVisibility(authSpec, url, state, true)).toEqual({
      forceHide: [],
      forceShow: ["spec:login"],
    });
  });

  it("returning to the default leaves no entry", () => {
    // Default-visible spec, asked to show -> nothing to add.
    expect(setSpecVisibility(authSpec, url, STATE(), true)).toEqual({
      forceHide: [],
      forceShow: [],
    });
    // Previously force-hidden, asked to show -> entry removed.
    const hidden = STATE({ personal: PERSONAL({ forceHide: ["spec:login"] }) });
    expect(setSpecVisibility(authSpec, url, hidden, true)).toEqual({
      forceHide: [],
      forceShow: [],
    });
  });
});

describe("facetInventory", () => {
  it("counts, dedups, and marks effective on/off + override source", () => {
    const specs = [authSpec, otherSpec, { id: "signup", tags: ["auth"], file: "login.spec.json" }];
    const state = STATE({
      teamHidden: ["tag:auth"],
      personal: PERSONAL({ forceShow: ["tag:auth"] }),
    });
    const inv = facetInventory(specs, state);

    const authTag = inv.tags.find((t) => t.key === "tag:auth");
    expect(authTag).toMatchObject({ count: 2, visible: true, teamHidden: true, overridden: true });

    const loginFile = inv.files.find((f) => f.key === "file:login.spec.json");
    expect(loginFile).toMatchObject({ count: 2, visible: true });

    expect(inv.specs).toHaveLength(3);
  });
});
