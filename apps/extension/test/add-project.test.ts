import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing";
import { mountAddProject } from "../src/shared/add-project.js";
import { loadDraft, saveDraft } from "../src/shared/draft-store.js";

const flush = () => new Promise((r) => setTimeout(r));
// Per-surface key: mount() uses the "popup" surface, so drafts land here.
const KEY = "add-project:popup";

function mount(): { container: HTMLElement; handle: ReturnType<typeof mountAddProject> } {
  const container = document.createElement("div");
  container.id = "add-project";
  document.body.appendChild(container);
  const handle = mountAddProject(container, vi.fn(), "popup");
  return { container, handle };
}

const field = (c: HTMLElement, sel: string) =>
  c.querySelector<HTMLInputElement>(sel) as HTMLInputElement;

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.runtime, "sendMessage").mockResolvedValue({ ok: true } as never);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("mountAddProject draft persistence", () => {
  it("stashes typed input (and the open state) so a dismissed popup can restore it", async () => {
    const { container, handle } = mount();
    await flush(); // let the initial (empty) restore mark the form ready
    handle.toggle(); // open the panel
    const project = field(container, "#ap-project");
    project.value = "Acme";
    project.dispatchEvent(new Event("input"));
    await flush();
    const draft = await loadDraft<{ project: string; open: boolean }>(KEY);
    expect(draft?.project).toBe("Acme");
    expect(draft?.open).toBe(true);
  });

  it("restores a stashed draft into the form on mount and reopens the panel", async () => {
    await saveDraft(KEY, {
      open: true,
      kind: "local",
      project: "Beta",
      domains: "a.com",
      applyAll: true,
      url: "",
      label: "",
    });
    const { container } = mount();
    await flush();
    expect(field(container, "#ap-project").value).toBe("Beta");
    expect(field(container, "#ap-domains").value).toBe("a.com");
    expect(field(container, "#ap-all").checked).toBe(true);
    expect(container.hidden).toBe(false);
  });

  it("clears the stash after a successful create", async () => {
    await saveDraft(KEY, {
      open: true,
      kind: "local",
      project: "Beta",
      domains: "",
      applyAll: false,
      url: "",
      label: "",
    });
    const { container } = mount();
    await flush();
    field(container, "#ap-create").click();
    await flush();
    expect(await loadDraft(KEY)).toBeNull();
  });

  it("clears the stash when the form is cancelled (explicit discard)", async () => {
    await saveDraft(KEY, {
      open: true,
      kind: "local",
      project: "Beta",
      domains: "",
      applyAll: false,
      url: "",
      label: "",
    });
    const { container } = mount();
    await flush();
    field(container, "#ap-cancel").click();
    await flush();
    expect(await loadDraft(KEY)).toBeNull();
  });

  it("never writes the sidecar token to the draft store", async () => {
    const { container, handle } = mount();
    await flush();
    handle.toggle();
    const sidecar = field(container, 'input[name="ap-kind"][value="sidecar"]');
    sidecar.checked = true;
    sidecar.dispatchEvent(new Event("change"));
    field(container, "#ap-url").value = "http://localhost:4319";
    field(container, "#ap-url").dispatchEvent(new Event("input"));
    const token = field(container, "#ap-token");
    token.value = "super-secret-token";
    token.dispatchEvent(new Event("input")); // intentionally not wired
    await flush();
    const draft = await loadDraft<{ url: string }>(KEY);
    expect(draft?.url).toBe("http://localhost:4319");
    expect(JSON.stringify(draft)).not.toContain("super-secret-token");
  });
});
