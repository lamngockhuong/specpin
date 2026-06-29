import type { GuideDef } from "@specpin/spec-schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { openGuideEditor } from "../src/shared/guide-editor.js";
import type { TaggedGuide, TaggedSpec, WriteTarget } from "../src/shared/messaging.js";

function spec(id: string, title = id): TaggedSpec {
  return {
    id,
    title: { en: title },
    description: { en: "d" },
    fingerprint: {
      cssSelector: `#${id}`,
      xpath: "",
      domPath: [],
      tagName: "button",
      attributes: {},
      positionHint: { index: 0, siblingCount: 1 },
    },
    _file: "a.spec.json",
    connectionId: "conn-1",
    project: "P",
  } as unknown as TaggedSpec;
}

const targets: WriteTarget[] = [{ id: "conn-1", project: "Project A", kind: "sidecar" }];

function card(): HTMLElement {
  const el = document.querySelector<HTMLElement>(".ge-card");
  if (!el) throw new Error("editor not mounted");
  return el;
}
const q = <T extends HTMLElement>(sel: string): T => {
  const el = card().querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

let sent: { type: string; [k: string]: unknown }[] = [];

beforeEach(() => {
  fakeBrowser.reset();
  sent = [];
  vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async (msg: unknown) => {
    sent.push(msg as { type: string });
    return { ok: true } as never;
  });
});

afterEach(() => {
  document.querySelector(".ge-backdrop")?.remove();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("openGuideEditor", () => {
  function open(extra: Partial<Parameters<typeof openGuideEditor>[0]> = {}): () => Promise<void> {
    const onSaved = vi.fn();
    openGuideEditor({
      origin: "https://app.test",
      specs: [spec("a"), spec("b"), spec("c")],
      targets,
      locale: "en",
      onSaved,
      ...extra,
    });
    return onSaved;
  }

  it("builds a GuideDef from name + selected, ordered steps and saves to a team target", async () => {
    open();
    q<HTMLInputElement>(".ge-field input").value = "Onboarding";
    // Add two steps via the add picker.
    const addSelect = q<HTMLSelectElement>(".ge-add select");
    const addBtn = q<HTMLButtonElement>(".ge-add-btn");
    addSelect.value = "a";
    addBtn.click();
    addSelect.value = "c";
    addBtn.click();
    // Reorder: move the 2nd step ("c") up so order becomes [c, a].
    const downUpButtons = card().querySelectorAll<HTMLButtonElement>(".ge-step .ge-icon");
    // Each step row has [up, down, remove]; the 2nd row's "up" is index 3.
    const secondRowUp = card()
      .querySelectorAll(".ge-step")[1]
      ?.querySelector<HTMLButtonElement>(".ge-icon");
    secondRowUp?.click();
    expect(downUpButtons.length).toBeGreaterThan(0);

    q<HTMLButtonElement>(".ge-btn.primary").click();
    await Promise.resolve();
    await Promise.resolve();

    const save = sent.find((m) => m.type === "SAVE_TEAM_GUIDE");
    expect(save).toBeTruthy();
    expect(save?.targetId).toBe("conn-1");
    expect(save?.origin).toBe("https://app.test");
    const guide = save?.guide as GuideDef;
    expect(guide.name).toBe("Onboarding");
    expect(guide.id).toBe("onboarding"); // slugified
    expect(guide.steps).toEqual(["c", "a"]); // reordered
  });

  it("routes a Personal save to SAVE_PERSONAL_GUIDE", async () => {
    open();
    q<HTMLInputElement>(".ge-field input").value = "Mine";
    q<HTMLSelectElement>(".ge-field select").value = "personal";
    q<HTMLButtonElement>(".ge-btn.primary").click();
    await Promise.resolve();
    await Promise.resolve();
    expect(sent.find((m) => m.type === "SAVE_PERSONAL_GUIDE")).toBeTruthy();
    expect(sent.find((m) => m.type === "SAVE_TEAM_GUIDE")).toBeFalsy();
  });

  it("rejects an empty name without sending", async () => {
    open();
    q<HTMLButtonElement>(".ge-btn.primary").click();
    await Promise.resolve();
    expect(sent).toHaveLength(0);
    expect(q<HTMLElement>(".ge-result").textContent).toMatch(/name/i);
  });

  it("flags an existing step whose spec is not on the page", () => {
    const guide: TaggedGuide = {
      id: "g1",
      name: "Tour",
      steps: ["a", "offpage"],
      scope: "team",
      connectionId: "conn-1",
    };
    open({ guide });
    const rows = card().querySelectorAll(".ge-step");
    expect(rows).toHaveLength(2);
    // The off-page step id renders as a flagged "missing" row.
    expect(card().querySelector(".ge-step-label.missing")?.textContent).toContain("offpage");
  });

  it("preselects an empty default guide (no steps) and saves with empty steps", async () => {
    open();
    q<HTMLInputElement>(".ge-field input").value = "Everything";
    q<HTMLButtonElement>(".ge-btn.primary").click();
    await Promise.resolve();
    await Promise.resolve();
    const guide = sent.find((m) => m.type === "SAVE_TEAM_GUIDE")?.guide as GuideDef;
    expect(guide.steps).toEqual([]);
  });
});
