// Bulk-capture form: one shared-fields section (tags / business rules / status /
// target project) + a per-element list with an auto-derived, editable title per
// row. Submitting builds N specs (one per element's fingerprint) through the same
// `buildSpec` the single-capture form uses, so bulk = N single specs that share
// the filled defaults — no parallel spec-construction logic, no schema change.
//
// A Shadow-DOM modal mirroring CaptureForm's isolation + theme conventions, kept
// deliberately simpler: no per-locale tabs, no Markdown toolbar, no per-row
// provenance (the author refines an individual spec later via single edit).
import { captureFingerprint } from "@specpin/fingerprint-core";
import type { ElementFingerprint, Spec, SpecStatus } from "@specpin/spec-schema";
import { formatErrors, validateSpec } from "@specpin/spec-schema";
import { t } from "../i18n/index.js";
import { escapeAttr, escapeHtml, setTrustedHtml } from "../shared/html.js";
import { createIcon } from "../shared/icons.js";
import type { WriteTarget } from "../shared/messaging.js";
import { createShadowHost } from "../shared/shadow.js";
import { slugify } from "../shared/slug.js";
import type { Theme } from "../shared/theme.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";
import { buildSpec, type CaptureFields, randomSuffix, targetLabel } from "./capture-form.js";
import { deriveTitle } from "./capture-title.js";
import { SPEC_TEMPLATES, wireTemplateSelect } from "./spec-templates.js";

const HOST_ID = "specpin-bulk-capture-host";

/** Per-row save outcome, returned by `onSubmitAll` in row order so the form can
 *  mark which specs saved and which still need a retry. */
export interface BulkRowResult {
  ok: boolean;
  error?: string;
}

/** Save handler: write every built spec (in order) to one shared file and report
 *  each row's result. A partial failure must NOT roll back the succeeded rows. */
export type BulkSubmit = (
  specs: Spec[],
  file: string,
  connectionId?: string,
) => Promise<BulkRowResult[]>;

export interface BulkCaptureFormOptions {
  defaultFile: string;
  /** Locale that each spec's title/description are stored under (manifest default). */
  defaultLocale: string;
  /** Writable projects serving the page. With more than one, the shared section
   *  asks which to save into; all N specs go to that one target. */
  targets?: WriteTarget[];
  theme?: Theme;
  onSubmitAll: BulkSubmit;
  onCancel?: () => void;
}

interface Row {
  fingerprint: ElementFingerprint;
  /** The row's title input (source of truth, read at save). */
  input: HTMLInputElement;
  /** The row container, for status/duplicate flags. */
  el: HTMLElement;
  /** A stable id suffix assigned once at row creation. Reused across re-saves so a
   *  retry after a partial failure upserts the same spec id instead of minting a
   *  new one (which would duplicate the already-saved rows). */
  idSuffix: string;
}

const STYLES = `${SHADOW_PREAMBLE}
* { box-sizing: border-box; }
.backdrop {
  position: fixed; inset: 0; z-index: 2147483647;
  background: var(--sp-overlay-bg); display: flex; align-items: center; justify-content: center;
}
.card {
  width: 560px; max-width: 92vw; max-height: 90vh; overflow: auto;
  background: var(--sp-surface); color: var(--sp-text);
  border: 1px solid var(--sp-border); border-radius: var(--sp-radius-card);
  padding: 28px; font: 15px/1.5 var(--sp-font-ui);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
}
h2 { margin: 0 0 4px; font-size: 18px; }
.sub { margin: 0 0 16px; color: var(--sp-text-2); font-size: 13px; }
label { display: block; margin: 12px 0 4px; font-weight: 600; font-size: 13px; }
.hint { font-weight: 400; color: var(--sp-text-2); }
input, select, textarea {
  width: 100%; padding: 8px 10px; font: inherit;
  color: var(--sp-text); background: var(--sp-control);
  border: 1px solid var(--sp-border); border-radius: var(--sp-radius-control);
}
textarea { min-height: 90px; resize: vertical; }
.rows { margin-top: 8px; border-top: 1px solid var(--sp-border); }
.row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--sp-border); }
.row input { flex: 1; }
.row.dup input { border-color: var(--sp-danger, #dc2626); }
.row-flag { font-size: 12px; color: var(--sp-danger, #dc2626); min-width: 0; }
.row-status { font-size: 12px; min-width: 52px; text-align: right; }
.row-status.ok { color: var(--sp-ok, #059669); }
.row-status.fail { color: var(--sp-danger, #dc2626); }
.row-remove {
  border: none; background: transparent; color: var(--sp-text-2);
  cursor: pointer; padding: 0 4px;
  display: inline-flex; align-items: center; justify-content: center;
}
.errors { margin-top: 12px; color: var(--sp-danger, #dc2626); font-size: 13px; white-space: pre-wrap; }
.errors:empty { display: none; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
button.primary, button.ghost {
  padding: 9px 16px; font: inherit; font-weight: 600; cursor: pointer;
  border-radius: var(--sp-radius-control); border: 1px solid var(--sp-border);
}
button.primary { background: var(--sp-accent, #4f46e5); color: #fff; border-color: transparent; }
button.ghost { background: transparent; color: var(--sp-text); }`;

export class BulkCaptureForm {
  private host: HTMLElement | null = null;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;
  private readonly doc: Document;

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  open(elements: Element[], options: BulkCaptureFormOptions): void {
    this.close();
    const targets = options.targets ?? [];
    const { host, shadow } = createShadowHost(this.doc, HOST_ID, STYLES, options.theme);
    const wrap = this.doc.createElement("div");
    wrap.className = "backdrop";
    setTrustedHtml(wrap, this.template(elements.length, targets, options.defaultFile));
    shadow.appendChild(wrap);
    this.host = host;

    const q = <T extends HTMLElement>(sel: string) => shadow.querySelector(sel) as T;
    const errorsBox = q<HTMLElement>(".errors");
    const rowsBox = q<HTMLElement>(".rows");

    // One row per element: capture its fingerprint now, seed the title input from
    // the element, and keep the input as the row's source of truth.
    const rows: Row[] = [];
    for (const element of elements) {
      const rowEl = this.doc.createElement("div");
      rowEl.className = "row";
      const input = this.doc.createElement("input");
      input.type = "text";
      input.value = deriveTitle(element);
      const flag = this.doc.createElement("span");
      flag.className = "row-flag";
      const status = this.doc.createElement("span");
      status.className = "row-status";
      const remove = this.doc.createElement("button");
      remove.type = "button";
      remove.className = "row-remove";
      remove.appendChild(createIcon(this.doc, "close", 12));
      remove.title = t("bulk.rowRemove");
      remove.setAttribute("aria-label", t("bulk.rowRemove"));
      rowEl.append(input, flag, status, remove);
      rowsBox.appendChild(rowEl);
      const row: Row = {
        fingerprint: captureFingerprint(element),
        input,
        el: rowEl,
        idSuffix: randomSuffix(),
      };
      rows.push(row);
      remove.addEventListener("click", () => {
        rowEl.remove();
        const idx = rows.indexOf(row);
        if (idx >= 0) rows.splice(idx, 1);
        markDuplicates();
      });
      input.addEventListener("input", markDuplicates);
    }

    // Flag rows whose title slugifies to the same base as another row's: their ids
    // would collide semantically, so the author should disambiguate before saving.
    function markDuplicates(): void {
      const bases = rows.map((r) => slugify(r.input.value.trim()) || "spec");
      const counts = new Map<string, number>();
      for (const base of bases) counts.set(base, (counts.get(base) ?? 0) + 1);
      rows.forEach((r, i) => {
        const dup = (counts.get(bases[i] as string) ?? 0) > 1;
        r.el.classList.toggle("dup", dup);
        (r.el.querySelector(".row-flag") as HTMLElement).textContent = dup
          ? t("bulk.duplicateTitle")
          : "";
      });
    }
    markDuplicates();

    // Template dropdown: fill the shared tags / rules / status only where empty.
    wireTemplateSelect(
      shadow.querySelector<HTMLSelectElement>(".shared-template"),
      {
        tags: q<HTMLInputElement>(".shared-tags"),
        rules: q<HTMLTextAreaElement>(".shared-rules"),
        status: q<HTMLSelectElement>(".shared-status"),
      },
      t,
    );

    const cancel = () => {
      this.close();
      options.onCancel?.();
    };
    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    this.doc.addEventListener("keydown", this.escHandler, true);
    q<HTMLButtonElement>(".cancel").addEventListener("click", cancel);
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) cancel();
    });

    // Build the shared fields into a CaptureFields template, then per row swap in
    // that row's title (used as both title and a seed description, since the schema
    // requires a non-empty description and bulk collects only a title per row).
    const buildSpecs = (): Spec[] => {
      const tags = q<HTMLInputElement>(".shared-tags").value.split(",");
      const rules = q<HTMLTextAreaElement>(".shared-rules")
        .value.split("\n")
        .map((r) => r.trim())
        .filter(Boolean);
      const status = (q<HTMLSelectElement>(".shared-status").value || null) as SpecStatus | null;
      const nowIso = new Date().toISOString();
      return rows.map((row) => {
        const title = row.input.value.trim() || "spec";
        const fields: CaptureFields = {
          byLocale: {
            [options.defaultLocale]: { title, description: title, businessRules: rules },
          },
          defaultLocale: options.defaultLocale,
          tags,
          status,
        };
        return buildSpec(fields, row.fingerprint, nowIso, row.idSuffix);
      });
    };

    q<HTMLButtonElement>(".save").addEventListener("click", async () => {
      errorsBox.textContent = "";
      if (rows.length === 0) {
        errorsBox.textContent = t("bulk.empty");
        return;
      }
      if (targets.length === 0) {
        errorsBox.textContent = t("capture.noWritableProject");
        return;
      }
      const specs = buildSpecs();
      // Validate every spec up-front so one malformed row fails loud, not silently.
      const invalid: string[] = [];
      for (const spec of specs) {
        const v = validateSpec(spec);
        if (!v.valid) invalid.push(formatErrors(v.errors));
      }
      if (invalid.length) {
        errorsBox.textContent = invalid.join("\n");
        return;
      }
      const targetSel = shadow.querySelector<HTMLSelectElement>(".shared-target");
      const connectionId = targetSel?.value || targets[0]?.id || undefined;
      // With a project picker (2+ targets) there is no file field; fall back to the
      // default. With a lone target the editable file input drives the write.
      const file =
        shadow.querySelector<HTMLInputElement>(".shared-file")?.value.trim() || options.defaultFile;

      const results = await options.onSubmitAll(specs, file, connectionId);
      // Paint per-row status. A row with no result (shorter array) is treated as
      // failed so a truncated response never reads as success.
      let failed = 0;
      rows.forEach((row, i) => {
        const res = results[i];
        const status = row.el.querySelector(".row-status") as HTMLElement;
        if (res?.ok) {
          status.textContent = t("bulk.rowOk");
          status.className = "row-status ok";
        } else {
          failed += 1;
          status.textContent = t("bulk.rowFailed");
          status.className = "row-status fail";
        }
      });
      if (failed === 0) {
        this.close();
        return;
      }
      errorsBox.textContent = t("bulk.partial", { failed, total: rows.length });
    });
  }

  close(): void {
    if (this.escHandler) {
      this.doc.removeEventListener("keydown", this.escHandler, true);
      this.escHandler = null;
    }
    this.host?.remove();
    this.host = null;
  }

  private template(count: number, targets: WriteTarget[], defaultFile: string): string {
    // File vs target picker: a lone target still routes by file; 2+ targets ask
    // which project (the single-capture rule, applied once to the whole batch).
    const targetField =
      targets.length > 1
        ? `<label>${escapeHtml(t("capture.targetProject"))}</label><select class="shared-target">${targets
            .map(
              (target) =>
                `<option value="${escapeAttr(target.id)}">${escapeHtml(targetLabel(target))}</option>`,
            )
            .join("")}</select>`
        : `<label>${escapeHtml(t("capture.targetFile"))}</label><input class="shared-file" value="${escapeAttr(defaultFile)}" />`;
    return (
      `<div class="card" role="dialog" aria-modal="true">` +
      `<h2>${escapeHtml(t("bulk.title"))}</h2>` +
      `<p class="sub">${escapeHtml(t("bulk.selectedCount", { count }))} · ${escapeHtml(t("bulk.sharedHint"))}</p>` +
      targetField +
      `<label>${escapeHtml(t("template.label"))}</label>` +
      `<select class="shared-template">` +
      `<option value="">${escapeHtml(t("template.none"))}</option>` +
      SPEC_TEMPLATES.map(
        (tpl) => `<option value="${escapeAttr(tpl.id)}">${escapeHtml(t(tpl.labelKey))}</option>`,
      ).join("") +
      `</select>` +
      `<label>${escapeHtml(t("capture.rulesField"))} <span class="hint">${escapeHtml(t("capture.rulesHint"))}</span></label>` +
      `<textarea class="shared-rules"></textarea>` +
      `<label>${escapeHtml(t("capture.tagsField"))} <span class="hint">${escapeHtml(t("capture.tagsHint"))}</span></label>` +
      `<input class="shared-tags" placeholder="${escapeAttr(t("capture.tagsPlaceholder"))}" />` +
      `<label>${escapeHtml(t("capture.statusLabel"))}</label>` +
      `<select class="shared-status">` +
      `<option value="">${escapeHtml(t("capture.statusNeutral"))}</option>` +
      `<option value="draft">${escapeHtml(t("prov.statusDraft"))}</option>` +
      `<option value="approved">${escapeHtml(t("prov.statusApproved"))}</option>` +
      `<option value="deprecated">${escapeHtml(t("prov.statusDeprecated"))}</option>` +
      `</select>` +
      `<label>${escapeHtml(t("bulk.elementsTitle"))}</label>` +
      `<div class="rows"></div>` +
      `<div class="errors"></div>` +
      `<div class="actions">` +
      `<button type="button" class="ghost cancel">${escapeHtml(t("common.cancel"))}</button>` +
      `<button type="button" class="primary save">${escapeHtml(t("bulk.save"))}</button>` +
      `</div></div>`
    );
  }
}
