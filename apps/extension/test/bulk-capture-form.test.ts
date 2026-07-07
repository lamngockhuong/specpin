import type { Spec } from "@specpin/spec-schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BulkCaptureForm, type BulkRowResult } from "../src/content/bulk-capture-form.js";
import { initI18n } from "../src/i18n/index.js";
import type { WriteTarget } from "../src/shared/messaging.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

function shadow(): ShadowRoot {
  return (document.getElementById("specpin-bulk-capture-host") as HTMLElement)
    .shadowRoot as ShadowRoot;
}
const rows = () => shadow().querySelectorAll(".row");
const rowInput = (i: number) => rows()[i].querySelector("input") as HTMLInputElement;

let form: BulkCaptureForm;
const targets: WriteTarget[] = [{ id: "c1", project: "Proj", kind: "local" }];

beforeEach(() => {
  initI18n("en");
  document.body.innerHTML = "";
  form = new BulkCaptureForm(document);
});
afterEach(() => {
  form.close();
  document.body.innerHTML = "";
});

function openWith(
  html: string,
  onSubmitAll = vi.fn(async (s: Spec[], _file: string, _connId?: string) =>
    s.map(() => ({ ok: true }) as BulkRowResult),
  ),
) {
  document.body.innerHTML = html;
  const els = [...document.body.querySelectorAll("button, input")];
  form.open(els, { defaultFile: "page.spec.json", defaultLocale: "en", targets, onSubmitAll });
  return onSubmitAll;
}

describe("BulkCaptureForm", () => {
  it("renders one row per element with a derived, editable title", () => {
    openWith(
      `<button>Save order</button><button aria-label="Cancel"></button><input placeholder="Email">`,
    );
    expect(rows().length).toBe(3);
    expect(rowInput(0).value).toBe("Save order");
    expect(rowInput(1).value).toBe("Cancel");
    expect(rowInput(2).value).toBe("Email");
  });

  it("builds N specs with the row title + shared fields, one shared file + target", async () => {
    const onSubmit = openWith(`<button>Save</button><button>Delete</button>`);
    (shadow().querySelector(".shared-tags") as HTMLInputElement).value = "auth, critical";
    (shadow().querySelector(".shared-rules") as HTMLTextAreaElement).value = "must be logged in";
    // Edit row 0 title: only that spec's title changes.
    rowInput(0).value = "Save order";
    rowInput(0).dispatchEvent(new Event("input"));

    (shadow().querySelector(".save") as HTMLButtonElement).click();
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [specs, file, connId] = onSubmit.mock.calls[0] as [Spec[], string, string?];
    expect(file).toBe("page.spec.json");
    expect(connId).toBe("c1");
    expect(specs).toHaveLength(2);
    expect(specs[0]?.title.en).toBe("Save order");
    expect(specs[1]?.title.en).toBe("Delete");
    expect(specs[0]?.tags).toEqual(["auth", "critical"]);
    expect(specs[0]?.businessRules?.[0]?.en).toBe("must be logged in");
    // Description is seeded from the title so every spec is schema-valid.
    expect(specs[0]?.description.en).toBe("Save order");
  });

  it("removes a row and drops that spec from the batch", async () => {
    const onSubmit = openWith(`<button>A</button><button>B</button><button>C</button>`);
    const selCount = () => (shadow().querySelector(".sel-count") as HTMLElement).textContent;
    expect(selCount()).toBe("3 elements");
    (rows()[1].querySelector(".row-remove") as HTMLButtonElement).click();
    expect(rows().length).toBe(2);
    expect(selCount()).toBe("2 elements");
    (shadow().querySelector(".save") as HTMLButtonElement).click();
    await flush();
    const specs = onSubmit.mock.calls[0]?.[0] ?? [];
    expect(specs.map((s: Spec) => s.title.en)).toEqual(["A", "C"]);
  });

  it("flags rows whose titles collide", () => {
    openWith(`<button>Save</button><button>Save</button><button>Other</button>`);
    expect(rows()[0].classList.contains("dup")).toBe(true);
    expect(rows()[1].classList.contains("dup")).toBe(true);
    expect(rows()[2].classList.contains("dup")).toBe(false);
  });

  it("keeps the form open and marks failed rows on partial failure", async () => {
    const onSubmit = vi.fn(async (s: Spec[], _file: string, _connId?: string) =>
      s.map((_, i) => ({ ok: i !== 1, error: i === 1 ? "boom" : undefined }) as BulkRowResult),
    );
    openWith(`<button>A</button><button>B</button><button>C</button>`, onSubmit);
    (shadow().querySelector(".save") as HTMLButtonElement).click();
    await flush();
    // Form still open (host present), row 2 marked failed, others ok.
    expect(document.getElementById("specpin-bulk-capture-host")).not.toBeNull();
    const statuses = [...rows()].map(
      (r) => (r.querySelector(".row-status") as HTMLElement).className,
    );
    expect(statuses[0]).toContain("ok");
    expect(statuses[1]).toContain("fail");
    expect(statuses[2]).toContain("ok");
    expect((shadow().querySelector(".errors") as HTMLElement).textContent).toContain("1");
  });

  it("reuses each row's spec id across re-saves so a retry upserts (no duplicates)", async () => {
    // Row 2 fails the first time; the form stays open. A second Save must build the
    // same ids (stable per-row suffix) so already-saved rows upsert, not duplicate.
    const onSubmit = vi.fn(async (s: Spec[], _f: string, _c?: string) =>
      s.map((_, i) => ({ ok: i !== 1 }) as BulkRowResult),
    );
    openWith(`<button>A</button><button>B</button><button>C</button>`, onSubmit);
    (shadow().querySelector(".save") as HTMLButtonElement).click();
    await flush();
    (shadow().querySelector(".save") as HTMLButtonElement).click();
    await flush();
    const first = onSubmit.mock.calls[0]?.[0] as Spec[];
    const second = onSubmit.mock.calls[1]?.[0] as Spec[];
    expect(second.map((s) => s.id)).toEqual(first.map((s) => s.id));
  });

  it("a template fills empty shared fields (tags / rules / status) only", () => {
    openWith(`<button>A</button>`);
    const tags = shadow().querySelector(".shared-tags") as HTMLInputElement;
    const rules = shadow().querySelector(".shared-rules") as HTMLTextAreaElement;
    const status = shadow().querySelector(".shared-status") as HTMLSelectElement;
    // Author already typed a tag: the template must not overwrite it.
    tags.value = "mine";
    const select = shadow().querySelector(".shared-template") as HTMLSelectElement;
    select.value = "form-validation";
    select.dispatchEvent(new Event("change"));
    expect(tags.value).toBe("mine"); // preserved
    expect(rules.value.length).toBeGreaterThan(0); // filled (was empty)
    expect(status.value).toBe("draft"); // filled (was empty)
  });
});
