import type { DisplayMode, ElementFingerprint, LocalizedString, Spec } from "@specpin/spec-schema";
import { formatErrors, validateSpec } from "@specpin/spec-schema";
import { escapeAttr, escapeHtml } from "../shared/html.js";
import { createShadowHost } from "../shared/shadow.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";

const HOST_ID = "specpin-capture-host";

// BCP-47 locale shape the schema's propertyNames enforces; the add-language
// prompt validates against the same pattern so authored keys always validate.
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** Per-locale spec text entered in the form. Business rules are one-per-line. */
export interface LocaleContent {
  title: string;
  description: string;
  businessRules: string[];
}

export interface CaptureFields {
  /** locale -> entered text. Title/description/rules are authored per locale. */
  byLocale: Record<string, LocaleContent>;
  /** The locale that must carry title + description (the project default). */
  defaultLocale: string;
  tags: string[];
  preferredDisplayMode?: DisplayMode | null;
  createdBy?: string;
}

/** Submit handler returns whether the write succeeded (and any errors to show).
 *  `connectionId` is the chosen target project when several serve the page. */
export type CaptureSubmit = (
  file: string,
  spec: Spec,
  connectionId?: string,
) => Promise<{ ok: boolean; errors?: string[] }>;

export interface CaptureFormOptions {
  defaultFile: string;
  /** Locales offered in the language selector (from the connected manifest). */
  locales: string[];
  /** Locale that title/description are required for (manifest defaultLocale). */
  defaultLocale: string;
  onSubmit: CaptureSubmit;
  onCancel?: () => void;
  /** Optional existing spec to edit: its locales preload so they are preserved. */
  initial?: Spec;
  /** Projects that serve this page. When more than one, the form asks which to
   *  save into (avoids nondeterministic first-match routing for overlapping
   *  domains). */
  targets?: { id: string; project: string }[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Merge a single locale's value into an existing locale map without dropping
 *  the others. Empty values are not stored. Pure + testable. */
export function mergeLocalized(
  existing: LocalizedString | undefined,
  locale: string,
  value: string,
): LocalizedString {
  const next: LocalizedString = { ...(existing ?? {}) };
  const trimmed = value.trim();
  if (trimmed) next[locale] = trimmed;
  else delete next[locale];
  return next;
}

/** Build a schema-shaped Spec from per-locale capture fields. Title/description
 *  collect every locale with a non-empty value; business rules pair across
 *  locales by line index. Pure + testable. */
export function buildSpec(
  fields: CaptureFields,
  fingerprint: ElementFingerprint,
  nowIso: string,
  idSuffix: string,
): Spec {
  const title: LocalizedString = {};
  const description: LocalizedString = {};
  const ruleMaps: LocalizedString[] = [];

  for (const [locale, content] of Object.entries(fields.byLocale)) {
    const t = content.title.trim();
    if (t) title[locale] = t;
    const d = content.description.trim();
    if (d) description[locale] = d;
    content.businessRules.forEach((rule, i) => {
      const v = rule.trim();
      if (!v) return;
      ruleMaps[i] = mergeLocalized(ruleMaps[i], locale, v);
    });
  }
  const businessRules = ruleMaps.filter((m) => Object.keys(m).length > 0);

  // Id derives from the default-locale title (falling back to the first entered).
  const baseTitle =
    fields.byLocale[fields.defaultLocale]?.title ?? Object.values(fields.byLocale)[0]?.title ?? "";
  const base = slugify(baseTitle) || "spec";

  const spec: Spec = {
    id: `${base}-${idSuffix}`,
    title,
    description,
    businessRules,
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

const ADD_LOCALE_VALUE = "__add__";

/** Shadow-DOM inline form for authoring a multi-locale spec from a captured
 *  fingerprint. Title/description/rules are scoped to the selected language;
 *  switching languages preserves what was entered for the others. */
export class CaptureForm {
  private host: HTMLElement | null = null;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;
  private readonly doc: Document;

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  open(fingerprint: ElementFingerprint, options: CaptureFormOptions): void {
    this.close();
    const { host, shadow } = createShadowHost(this.doc, HOST_ID, STYLES);
    const wrap = this.doc.createElement("div");
    wrap.className = "backdrop";

    // Seed available locales: manifest locales + default + any from the spec
    // being edited, de-duplicated and default-first.
    const seeded = new Set<string>([options.defaultLocale, ...options.locales]);
    const byLocale: Record<string, LocaleContent> = {};
    if (options.initial) {
      for (const loc of localesOf(options.initial)) seeded.add(loc);
    }
    const locales = [...seeded].filter(Boolean);
    let current = options.defaultLocale || locales[0] || "en";

    const targets = options.targets ?? [];
    wrap.innerHTML = this.template(options.defaultFile, locales, current, targets);
    shadow.appendChild(wrap);
    this.host = host;

    const q = <T extends HTMLElement>(sel: string) => shadow.querySelector(sel) as T;
    const errorsBox = q<HTMLElement>(".errors");
    const titleEl = q<HTMLInputElement>("#sp-title");
    const descEl = q<HTMLTextAreaElement>("#sp-desc");
    const rulesEl = q<HTMLTextAreaElement>("#sp-rules");
    const localeSel = q<HTMLSelectElement>("#sp-locale");

    // Preload content for editing an existing spec.
    if (options.initial) {
      for (const loc of localesOf(options.initial))
        byLocale[loc] = contentForLocale(options.initial, loc);
    }

    const stashCurrent = (): void => {
      byLocale[current] = {
        title: titleEl.value,
        description: descEl.value,
        businessRules: rulesEl.value.split("\n"),
      };
    };
    const loadLocale = (loc: string): void => {
      const c = byLocale[loc];
      titleEl.value = c?.title ?? "";
      descEl.value = c?.description ?? "";
      rulesEl.value = c?.businessRules.join("\n") ?? "";
    };
    loadLocale(current);

    localeSel.addEventListener("change", () => {
      const value = localeSel.value;
      if (value === ADD_LOCALE_VALUE) {
        localeSel.value = current; // revert until the prompt resolves
        const code = this.doc.defaultView
          ?.prompt("Add a language (BCP-47, e.g. vi, ja, en-US):")
          ?.trim();
        if (!code) return;
        if (!LOCALE_PATTERN.test(code)) {
          this.showErrors(errorsBox, [`"${code}" is not a valid BCP-47 locale code.`]);
          return;
        }
        if (![...localeSel.options].some((o) => o.value === code)) {
          const opt = this.doc.createElement("option");
          opt.value = code;
          opt.textContent = code;
          localeSel.insertBefore(opt, localeSel.lastElementChild);
        }
        stashCurrent();
        current = code;
        localeSel.value = code;
        loadLocale(code);
        return;
      }
      stashCurrent();
      current = value;
      loadLocale(value);
    });

    const cancel = () => {
      this.close();
      options.onCancel?.();
    };
    // Escape closes the form like Cancel, so a half-filled form is never stuck
    // open. Bound on the document and removed in close() (no listener leak).
    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    this.doc.addEventListener("keydown", this.escHandler, true);
    q<HTMLButtonElement>("#sp-cancel").addEventListener("click", cancel);
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) cancel();
    });

    q<HTMLButtonElement>("#sp-save").addEventListener("click", async () => {
      stashCurrent();
      const fields: CaptureFields = {
        byLocale,
        defaultLocale: options.defaultLocale || current,
        tags: q<HTMLInputElement>("#sp-tags").value.split(","),
        preferredDisplayMode: (q<HTMLSelectElement>("#sp-mode").value ||
          null) as DisplayMode | null,
      };

      // Friendly guard: the default locale must carry title + description so the
      // user gets a clear message instead of a raw schema error.
      const def = fields.byLocale[fields.defaultLocale];
      const missing: string[] = [];
      if (!def?.title.trim()) missing.push("title");
      if (!def?.description.trim()) missing.push("description");
      if (missing.length) {
        this.showErrors(errorsBox, [
          `Enter a ${missing.join(" and ")} for the default language (${fields.defaultLocale}).`,
        ]);
        return;
      }

      const idSuffix = randomSuffix();
      const spec = buildSpec(fields, fingerprint, new Date().toISOString(), idSuffix);

      const validation = validateSpec(spec);
      if (!validation.valid) {
        this.showErrors(errorsBox, [formatErrors(validation.errors)]);
        return;
      }
      const file = q<HTMLInputElement>("#sp-file").value.trim() || options.defaultFile;
      const targetSel = shadow.querySelector<HTMLSelectElement>("#sp-target");
      const connectionId = targetSel?.value || undefined;
      const result = await options.onSubmit(file, spec, connectionId);
      if (result.ok) this.close();
      else this.showErrors(errorsBox, result.errors ?? ["Save failed; check the sidecar."]);
    });
  }

  private template(
    defaultFile: string,
    locales: string[],
    current: string,
    targets: { id: string; project: string }[],
  ): string {
    const localeOptions = locales
      .map(
        (l) =>
          `<option value="${escapeAttr(l)}"${l === current ? " selected" : ""}>${escapeHtml(l)}</option>`,
      )
      .join("");
    // Ask which project to save into only when more than one serves this page.
    const targetField =
      targets.length > 1
        ? `<label>Target project</label><select id="sp-target">${targets
            .map(
              (t) =>
                `<option value="${escapeAttr(t.id)}">${escapeHtml(t.project || t.id)}</option>`,
            )
            .join("")}</select>`
        : "";
    return `
      <div class="card">
        <h3>Capture spec</h3>
        ${targetField}
        <label>Language <span class="hint">(title &amp; description per language)</span></label>
        <select id="sp-locale">${localeOptions}<option value="${ADD_LOCALE_VALUE}">+ Add language&hellip;</option></select>
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
    if (this.escHandler) {
      this.doc.removeEventListener("keydown", this.escHandler, true);
      this.escHandler = null;
    }
    this.host?.remove();
    this.host = null;
  }
}

/** Locales present in any of an existing spec's localized fields. */
function localesOf(spec: Spec): string[] {
  const keys = new Set<string>();
  for (const k of Object.keys(spec.title ?? {})) keys.add(k);
  for (const k of Object.keys(spec.description ?? {})) keys.add(k);
  for (const rule of spec.businessRules ?? []) for (const k of Object.keys(rule)) keys.add(k);
  return [...keys];
}

/** Extract one locale's text from an existing spec for editing. */
function contentForLocale(spec: Spec, locale: string): LocaleContent {
  return {
    title: spec.title?.[locale] ?? "",
    description: spec.description?.[locale] ?? "",
    businessRules: (spec.businessRules ?? []).map((r) => r[locale] ?? "").filter((v) => v !== ""),
  };
}

function randomSuffix(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID().slice(0, 6);
  return Math.floor(Math.random() * 1e6).toString(36);
}
