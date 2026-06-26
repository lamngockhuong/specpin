import type { DisplayMode, ElementFingerprint, Spec } from "@specpin/spec-schema";
import { formatErrors, validateSpec } from "@specpin/spec-schema";
import { escapeAttr, escapeHtml } from "../shared/html.js";
import { createShadowHost } from "../shared/shadow.js";

const HOST_ID = "specpin-capture-host";

export interface CaptureFields {
  title: string;
  description: string;
  businessRules: string[];
  tags: string[];
  preferredDisplayMode?: DisplayMode | null;
  createdBy?: string;
}

/** Submit handler returns whether the write succeeded (and any errors to show). */
export type CaptureSubmit = (
  file: string,
  spec: Spec,
) => Promise<{ ok: boolean; errors?: string[] }>;

export interface CaptureFormOptions {
  defaultFile: string;
  onSubmit: CaptureSubmit;
  onCancel?: () => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Build a schema-shaped Spec from capture fields. Pure + testable. */
export function buildSpec(
  fields: CaptureFields,
  fingerprint: ElementFingerprint,
  nowIso: string,
  idSuffix: string,
): Spec {
  const base = slugify(fields.title) || "spec";
  const spec: Spec = {
    id: `${base}-${idSuffix}`,
    title: fields.title.trim(),
    description: fields.description.trim(),
    businessRules: fields.businessRules.map((r) => r.trim()).filter(Boolean),
    tags: fields.tags.map((t) => t.trim()).filter(Boolean),
    fingerprint,
    meta: {
      createdBy: fields.createdBy?.trim() || "manual",
      createdAt: nowIso,
      updatedAt: nowIso,
      source: "manual",
    },
  };
  if (fields.preferredDisplayMode) spec.preferredDisplayMode = fields.preferredDisplayMode;
  return spec;
}

const STYLES = `
:host { all: initial; }
.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 2147483647; display: flex; align-items: center; justify-content: center; }
.card { width: 420px; max-width: 92vw; max-height: 90vh; overflow:auto; background: #fff; color: #1f2937; border-radius: 10px; padding: 18px; font: 13px/1.5 system-ui, sans-serif; box-shadow: 0 16px 48px rgba(0,0,0,.4); }
.card h3 { margin: 0 0 10px; font-size: 15px; }
label { display:block; font-weight:600; margin: 10px 0 3px; }
input, textarea, select { width:100%; box-sizing:border-box; padding:7px; border:1px solid #d1d5db; border-radius:6px; font: inherit; }
textarea { min-height: 54px; resize: vertical; }
.hint { color:#6b7280; font-weight:400; font-size:11px; }
.actions { display:flex; gap:8px; margin-top:14px; }
button { flex:1; padding:8px; border-radius:6px; border:1px solid #d1d5db; background:#f9fafb; cursor:pointer; }
button.primary { background:#4f46e5; color:#fff; border-color:#4f46e5; }
.errors { margin-top:10px; color:#991b1b; background:#fee2e2; border-radius:6px; padding:8px; display:none; }
.errors.show { display:block; }
.errors ul { margin:4px 0 0; padding-left:16px; }
`;

/** Shadow-DOM inline form for authoring a spec from a captured fingerprint. */
export class CaptureForm {
  private host: HTMLElement | null = null;
  private readonly doc: Document;

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  open(fingerprint: ElementFingerprint, options: CaptureFormOptions): void {
    this.close();
    const { host, shadow } = createShadowHost(this.doc, HOST_ID, STYLES);
    const wrap = this.doc.createElement("div");
    wrap.className = "backdrop";
    wrap.innerHTML = this.template(options.defaultFile);
    shadow.appendChild(wrap);
    this.host = host;

    const q = <T extends HTMLElement>(sel: string) => shadow.querySelector(sel) as T;
    const errorsBox = q<HTMLElement>(".errors");

    const cancel = () => {
      this.close();
      options.onCancel?.();
    };
    q<HTMLButtonElement>("#sp-cancel").addEventListener("click", cancel);
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) cancel();
    });

    q<HTMLButtonElement>("#sp-save").addEventListener("click", async () => {
      const fields: CaptureFields = {
        title: q<HTMLInputElement>("#sp-title").value,
        description: q<HTMLTextAreaElement>("#sp-desc").value,
        businessRules: q<HTMLTextAreaElement>("#sp-rules").value.split("\n"),
        tags: q<HTMLInputElement>("#sp-tags").value.split(","),
        preferredDisplayMode: (q<HTMLSelectElement>("#sp-mode").value ||
          null) as DisplayMode | null,
      };
      const idSuffix = randomSuffix();
      const spec = buildSpec(fields, fingerprint, new Date().toISOString(), idSuffix);

      const validation = validateSpec(spec);
      if (!validation.valid) {
        this.showErrors(errorsBox, [formatErrors(validation.errors)]);
        return;
      }
      const file = q<HTMLInputElement>("#sp-file").value.trim() || options.defaultFile;
      const result = await options.onSubmit(file, spec);
      if (result.ok) this.close();
      else this.showErrors(errorsBox, result.errors ?? ["Save failed; check the sidecar."]);
    });
  }

  private template(defaultFile: string): string {
    return `
      <div class="card">
        <h3>Capture spec</h3>
        <label>Title</label><input id="sp-title" placeholder="Login button" />
        <label>Description</label><textarea id="sp-desc" placeholder="What this element does"></textarea>
        <label>Business rules <span class="hint">(one per line)</span></label><textarea id="sp-rules"></textarea>
        <label>Tags <span class="hint">(comma-separated)</span></label><input id="sp-tags" placeholder="auth, critical" />
        <label>Display mode</label>
        <select id="sp-mode">
          <option value="">Use project default</option>
          <option value="tooltip">tooltip</option>
          <option value="sidebar">sidebar</option>
        </select>
        <label>Target file</label><input id="sp-file" value="${escapeAttr(defaultFile)}" />
        <div class="errors"><strong>Could not save:</strong><ul></ul></div>
        <div class="actions">
          <button id="sp-cancel">Cancel</button>
          <button id="sp-save" class="primary">Save spec</button>
        </div>
      </div>`;
  }

  private showErrors(box: HTMLElement, messages: string[]): void {
    const ul = box.querySelector("ul");
    if (!ul) return;
    ul.innerHTML = messages.map((m) => `<li>${escapeHtml(m)}</li>`).join("");
    box.classList.add("show");
  }

  close(): void {
    this.host?.remove();
    this.host = null;
  }
}

function randomSuffix(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID().slice(0, 6);
  return Math.floor(Math.random() * 1e6).toString(36);
}
