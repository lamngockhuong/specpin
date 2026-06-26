import type { DisplayMode, ElementFingerprint, Spec } from "@specpin/spec-schema";
import { formatErrors, validateSpec } from "@specpin/spec-schema";
import { escapeAttr, escapeHtml } from "../shared/html.js";
import { createShadowHost } from "../shared/shadow.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";

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

/** Build a schema-shaped Spec from capture fields. Pure + testable. The object
 *  schema requires locale-keyed text, so the single entered value is stored
 *  under `locale` (default "en"); Phase 2 adds the per-locale authoring form. */
export function buildSpec(
  fields: CaptureFields,
  fingerprint: ElementFingerprint,
  nowIso: string,
  idSuffix: string,
  locale = "en",
): Spec {
  const base = slugify(fields.title) || "spec";
  const spec: Spec = {
    id: `${base}-${idSuffix}`,
    title: { [locale]: fields.title.trim() },
    description: { [locale]: fields.description.trim() },
    businessRules: fields.businessRules
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => ({ [locale]: r })),
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
${SHADOW_PREAMBLE}
* { box-sizing: border-box; }
.backdrop {
  position: fixed; inset: 0; z-index: 2147483647;
  background: var(--sp-overlay-bg);
  display: flex; align-items: center; justify-content: center;
}
.card {
  width: 440px; max-width: 92vw; max-height: 90vh; overflow: auto;
  background: var(--sp-surface); color: var(--sp-text);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-card);
  padding: 28px;
  font: 13px/1.5 var(--sp-font-ui);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
}
.card h3 { margin: 0 0 18px; font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
label { display: block; font-weight: 600; margin: 16px 0 6px; color: var(--sp-text); }
.hint { color: var(--sp-text-3); font-weight: 400; font-size: 11px; }
input, textarea, select {
  width: 100%; padding: 10px 12px;
  font: 13px/1.4 var(--sp-font-ui);
  color: var(--sp-text);
  background: var(--sp-elevated);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-control);
}
input::placeholder, textarea::placeholder { color: var(--sp-text-3); }
input:focus, textarea:focus, select:focus {
  outline: none; border-color: var(--sp-accent);
  box-shadow: 0 0 0 3px var(--sp-accent-glow);
}
textarea { min-height: 64px; resize: vertical; }
.actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
button {
  padding: 10px 18px;
  font: 600 13px/1 var(--sp-font-ui);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-control);
  background: var(--sp-control); color: var(--sp-text);
  cursor: pointer; transition: background 0.12s, border-color 0.12s;
}
button:hover { filter: brightness(0.97); }
button.primary {
  background: var(--sp-accent); color: var(--sp-accent-on); border-color: var(--sp-accent);
  box-shadow: 0 0 0 4px var(--sp-accent-glow);
}
button.primary:hover { background: var(--sp-accent-hover); border-color: var(--sp-accent-hover); filter: none; }
.errors {
  margin-top: 14px; padding: 10px 12px;
  color: var(--sp-error-text);
  background: var(--sp-error-bg);
  border: 1px solid var(--sp-error-border);
  border-radius: var(--sp-radius-control);
  display: none;
}
.errors.show { display: block; }
.errors ul { margin: 4px 0 0; padding-left: 16px; }
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
