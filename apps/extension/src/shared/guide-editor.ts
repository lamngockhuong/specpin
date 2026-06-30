import type { GuideDef } from "@specpin/spec-schema";
import { resolveLocalized } from "@specpin/spec-schema";
import { t } from "../i18n/index.js";
import type { TaggedGuide, TaggedSpec } from "./connection-types.js";
import { clearDraft, loadDraft, saveDraft } from "./draft-store.js";
import { type GuideMutationResult, sendToBackground, type WriteTarget } from "./messaging.js";
import { slugify } from "./slug.js";
import { sourceBadge } from "./surface-renderers.js";

// A stashed in-progress guide edit. Keyed by origin + guide id ("new" for a new
// guide) so a draft is restored only into the same editor on the same page, and
// two pages cannot cross-pollute (guides are origin-scoped).
interface GuideDraft {
  name: string;
  description: string;
  order: string[];
  saveTo: string;
}

// The shared guide curation editor: a self-contained modal (own backdrop + card)
// mounted on the page for both popup and side panel. It takes the page specs +
// optional existing guide + writable targets and, on save, builds a GuideDef and
// routes it to SAVE_TEAM_GUIDE (sidecar/local target) or SAVE_PERSONAL_GUIDE.
// Pure DOM, no innerHTML for any user/spec data (titles + ids via textContent), so
// it is injection-safe even though it runs on a privileged extension page.

export interface GuideEditorOptions {
  /** Active page origin (bounds a local save; keys a personal save). */
  origin: string;
  /** The specs visible on the page (the curatable step pool + titles). */
  specs: TaggedSpec[];
  /** Writable team targets (sidecar + local) for the "Save to" picker. */
  targets: WriteTarget[];
  /** The guide being edited; omitted for a new guide. */
  guide?: TaggedGuide;
  /** Active spec locale, for resolving spec titles. */
  locale: string;
  defaultLocale?: string;
  /** Called after a successful save so the host refreshes its guide list. */
  onSaved: () => void | Promise<void>;
}

const PERSONAL_TARGET = "personal";

export function openGuideEditor(opts: GuideEditorOptions): void {
  const doc = document;
  const specById = new Map(opts.specs.map((s) => [s.id, s] as const));
  // Step order: from the existing guide, else empty (a default/uncurated guide).
  const order: string[] = [...(opts.guide?.steps ?? [])];
  const draftKey = `guide-editor:${opts.origin}:${opts.guide?.id ?? "new"}`;

  const backdrop = doc.createElement("div");
  backdrop.className = "ge-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  const card = doc.createElement("div");
  card.className = "ge-card";
  backdrop.appendChild(card);

  // --- Header ---
  const title = doc.createElement("h2");
  title.className = "ge-title";
  title.textContent = opts.guide ? t("guide.editorTitleEdit") : t("guide.editorTitleNew");
  card.appendChild(title);

  // --- Name + description ---
  const name = labelledInput(doc, "guide.nameLabel", "guide.namePlaceholder");
  if (opts.guide) name.input.value = opts.guide.name;
  card.appendChild(name.wrap);

  const desc = labelledTextarea(doc, "guide.descLabel");
  if (opts.guide?.description) desc.area.value = opts.guide.description;
  card.appendChild(desc.wrap);

  // --- Steps (ordered) ---
  const stepsLabel = doc.createElement("div");
  stepsLabel.className = "ge-section-label";
  stepsLabel.textContent = t("guide.stepsLabel");
  card.appendChild(stepsLabel);
  const hint = doc.createElement("div");
  hint.className = "ge-hint";
  hint.textContent = t("guide.emptyDefaultHint");
  card.appendChild(hint);
  const stepList = doc.createElement("ul");
  stepList.className = "ge-steps";
  card.appendChild(stepList);

  // --- Add-step picker (specs not yet in the order) ---
  const addRow = doc.createElement("div");
  addRow.className = "ge-add";
  const addSelect = doc.createElement("select");
  addSelect.setAttribute("aria-label", t("guide.addStepLabel"));
  const addBtn = doc.createElement("button");
  addBtn.type = "button";
  addBtn.className = "ge-add-btn";
  addBtn.textContent = t("guide.addStep");
  addRow.append(addSelect, addBtn);
  card.appendChild(addRow);

  // --- Save-to target ---
  const saveToWrap = doc.createElement("div");
  saveToWrap.className = "ge-field";
  const saveToLabel = doc.createElement("label");
  saveToLabel.textContent = t("guide.saveTo");
  const saveTo = doc.createElement("select");
  saveToLabel.appendChild(saveTo);
  saveToWrap.appendChild(saveToLabel);
  card.appendChild(saveToWrap);
  for (const target of opts.targets) {
    const opt = doc.createElement("option");
    opt.value = `team:${target.id}`;
    opt.textContent = `${target.project || target.id} (${target.kind})`;
    saveTo.appendChild(opt);
  }
  const personalOpt = doc.createElement("option");
  personalOpt.value = PERSONAL_TARGET;
  personalOpt.textContent = t("guide.personal");
  saveTo.appendChild(personalOpt);
  // Preselect the guide's current home (or the first writable target / personal).
  if (opts.guide?.scope === "personal") saveTo.value = PERSONAL_TARGET;
  else if (opts.guide?.connectionId) saveTo.value = `team:${opts.guide.connectionId}`;
  if (opts.targets.length === 0) {
    saveTo.value = PERSONAL_TARGET;
    const note = doc.createElement("div");
    note.className = "ge-hint";
    note.textContent = t("guide.noTargets");
    saveToWrap.appendChild(note);
  }

  // --- Result + actions ---
  const result = doc.createElement("div");
  result.className = "ge-result";
  const actions = doc.createElement("div");
  actions.className = "ge-actions";
  const cancelBtn = doc.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "ge-btn";
  cancelBtn.textContent = t("common.cancel");
  const saveBtn = doc.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "ge-btn primary";
  saveBtn.textContent = t("guide.save");
  actions.append(cancelBtn, saveBtn);
  card.append(result, actions);

  doc.body.appendChild(backdrop);
  name.input.focus();

  // ----- Rendering -----
  function specTitle(id: string): string {
    const spec = specById.get(id);
    return spec ? resolveLocalized(spec.title, opts.locale, opts.defaultLocale) : "";
  }

  function renderSteps(): void {
    stepList.innerHTML = "";
    order.forEach((id, i) => {
      const li = doc.createElement("li");
      li.className = "ge-step";
      const label = doc.createElement("span");
      label.className = "ge-step-label";
      const spec = specById.get(id);
      if (spec) {
        label.append(doc.createTextNode(specTitle(id) || id), sourceBadge(spec));
      } else {
        // A step whose spec is not on this page: flag it (R2 / dropped-id surfacing).
        label.classList.add("missing");
        label.textContent = t("guide.missingSpec", { id });
      }
      const up = iconBtn(doc, "↑", t("guide.moveUp"));
      up.disabled = i === 0;
      up.addEventListener("click", () => {
        swap(i, i - 1);
      });
      const down = iconBtn(doc, "↓", t("guide.moveDown"));
      down.disabled = i === order.length - 1;
      down.addEventListener("click", () => {
        swap(i, i + 1);
      });
      const rm = iconBtn(doc, "×", t("guide.removeStep"));
      rm.addEventListener("click", () => {
        order.splice(i, 1);
        renderSteps();
        renderAddOptions();
        persist();
      });
      li.append(label, up, down, rm);
      stepList.appendChild(li);
    });
  }

  function renderAddOptions(): void {
    addSelect.innerHTML = "";
    const inOrder = new Set(order);
    const available = opts.specs.filter((s) => !inOrder.has(s.id));
    addBtn.disabled = available.length === 0;
    addSelect.disabled = available.length === 0;
    for (const spec of available) {
      const opt = doc.createElement("option");
      opt.value = spec.id;
      opt.textContent = specTitle(spec.id) || spec.id;
      addSelect.appendChild(opt);
    }
  }

  function swap(a: number, b: number): void {
    if (b < 0 || b >= order.length) return;
    const tmp = order[a] as string;
    order[a] = order[b] as string;
    order[b] = tmp;
    renderSteps();
    persist();
  }

  addBtn.addEventListener("click", () => {
    const id = addSelect.value;
    if (id && !order.includes(id)) {
      order.push(id);
      renderSteps();
      renderAddOptions();
      persist();
    }
  });

  // Stash the in-progress edit on every change, so a popup dismissed mid-edit
  // restores it the next time this editor opens. Closing the editor (cancel /
  // Escape / backdrop / a successful save) is an explicit end and clears it;
  // only an abrupt popup teardown leaves the draft for restore.
  function persist(): void {
    void saveDraft(draftKey, {
      name: name.input.value,
      description: desc.area.value,
      order: [...order],
      saveTo: saveTo.value,
    } satisfies GuideDraft);
  }

  function close(): void {
    backdrop.remove();
    doc.removeEventListener("keydown", onKey, true);
    void clearDraft(draftKey);
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  doc.addEventListener("keydown", onKey, true);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  cancelBtn.addEventListener("click", close);

  saveBtn.addEventListener("click", () => {
    void save();
  });

  async function save(): Promise<void> {
    const guideName = name.input.value.trim();
    if (!guideName) {
      setResult(result, false, t("guide.nameRequired"));
      return;
    }
    const id = opts.guide?.id ?? slugify(guideName);
    if (!id) {
      setResult(result, false, t("guide.nameRequired"));
      return;
    }
    const description = desc.area.value.trim();
    const def: GuideDef = { id, name: guideName, steps: [...order] };
    if (description) def.description = description;

    const target = saveTo.value;
    const res =
      target === PERSONAL_TARGET
        ? await sendToBackground<GuideMutationResult>({
            type: "SAVE_PERSONAL_GUIDE",
            guide: def,
            origin: opts.origin,
          })
        : await sendToBackground<GuideMutationResult>({
            type: "SAVE_TEAM_GUIDE",
            targetId: target.slice("team:".length),
            guide: def,
            origin: opts.origin,
          });
    if (!res.ok) {
      setResult(result, false, t("guide.saveFailed", { error: res.error ?? "error" }));
      return;
    }
    close();
    await opts.onSaved();
  }

  // Persist as the user edits the name, description, or Save-to target (step
  // edits persist from their own handlers above).
  name.input.addEventListener("input", persist);
  desc.area.addEventListener("input", persist);
  saveTo.addEventListener("change", persist);

  renderSteps();
  renderAddOptions();

  // Restore a stashed edit, if any. Setting values here fires no input/change
  // events, so this never re-triggers persist(). Applied after the initial
  // render so the restored step order replaces the committed one.
  void loadDraft<GuideDraft>(draftKey).then((draft) => {
    if (!draft) return;
    if (typeof draft.name === "string") name.input.value = draft.name;
    if (typeof draft.description === "string") desc.area.value = draft.description;
    if (Array.isArray(draft.order)) {
      order.length = 0;
      order.push(...draft.order);
    }
    if (draft.saveTo && Array.from(saveTo.options).some((o) => o.value === draft.saveTo)) {
      saveTo.value = draft.saveTo;
    }
    renderSteps();
    renderAddOptions();
  });
}

function labelledInput(
  doc: Document,
  labelKey: Parameters<typeof t>[0],
  placeholderKey: Parameters<typeof t>[0],
): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = doc.createElement("div");
  wrap.className = "ge-field";
  const label = doc.createElement("label");
  label.textContent = t(labelKey);
  const input = doc.createElement("input");
  input.type = "text";
  input.placeholder = t(placeholderKey);
  label.appendChild(input);
  wrap.appendChild(label);
  return { wrap, input };
}

function labelledTextarea(
  doc: Document,
  labelKey: Parameters<typeof t>[0],
): { wrap: HTMLElement; area: HTMLTextAreaElement } {
  const wrap = doc.createElement("div");
  wrap.className = "ge-field";
  const label = doc.createElement("label");
  label.textContent = t(labelKey);
  const area = doc.createElement("textarea");
  area.rows = 2;
  label.appendChild(area);
  wrap.appendChild(label);
  return { wrap, area };
}

function iconBtn(doc: Document, glyph: string, label: string): HTMLButtonElement {
  const btn = doc.createElement("button");
  btn.type = "button";
  btn.className = "ge-icon";
  btn.textContent = glyph;
  btn.setAttribute("aria-label", label);
  btn.title = label;
  return btn;
}

function setResult(el: HTMLElement, ok: boolean, text: string): void {
  el.className = `ge-result ${ok ? "ok" : "err"}`;
  el.textContent = text;
}
