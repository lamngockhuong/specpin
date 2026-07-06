import { anchorStrength } from "@specpin/fingerprint-core";
import type {
  DisplayMode,
  ElementFingerprint,
  Link,
  LocalizedString,
  Spec,
  SpecStatus,
} from "@specpin/spec-schema";
import { formatErrors, validateSpec } from "@specpin/spec-schema";
import { t } from "../i18n/index.js";
import { copyText } from "../shared/clipboard.js";
import { dataSpecIdSnippet } from "../shared/data-spec-id.js";
import { anyDialogOpen, promptDialog } from "../shared/dialog.js";
import { appendTrustedHtml, escapeAttr, escapeHtml, setTrustedHtml } from "../shared/html.js";
import { insertLink, prefixLines, toggleWrap } from "../shared/markdown-input.js";
import type { WriteTarget } from "../shared/messaging.js";
import { createShadowHost } from "../shared/shadow.js";
import { slugify } from "../shared/slug.js";
import type { Theme } from "../shared/theme.js";
import { SHADOW_PREAMBLE } from "../shared/tokens.js";
import { SPEC_TEMPLATES, wireTemplateSelect } from "./spec-templates.js";

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
  /** Author-declared issue/doc links. Rows with an empty label or url are dropped
   *  on build; an empty list omits the field (and, in edit mode, overwrites any
   *  prior links rather than preserving them). */
  links?: Link[];
  /** Author-declared test paths (one per line in the form). Trimmed, empties
   *  dropped; empty omits + overwrites prior, like links. */
  verifiedBy?: string[];
  /** Lifecycle status; empty/undefined omits the field (neutral). */
  status?: SpecStatus | null;
}

/** Submit handler returns whether the write succeeded (and any errors to show).
 *  `connectionId` is the chosen target project when several serve the page. */
export type CaptureSubmit = (
  file: string,
  spec: Spec,
  connectionId?: string,
) => Promise<{ ok: boolean; errors?: string[]; conflict?: boolean }>;

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
  /** Optional content seed for CREATE mode (clone): preloads the same fields as
   *  `initial` but does NOT enter edit mode, so the save mints a fresh id +
   *  provenance and the file/target pickers stay visible. Ignored when `initial`
   *  is set (edit wins). */
  prefill?: Spec;
  /** Edit mode only: run the page picker and resolve a new fingerprint for the
   *  spec (or null if the user cancelled). When provided, a "Re-link element"
   *  action appears. The form hides itself while the picker runs, then restores
   *  with field edits intact. */
  onRelink?: () => Promise<ElementFingerprint | null>;
  /** Writable projects (sidecar + local) that serve this page. With more than
   *  one, the form asks which to save into (avoids nondeterministic first-match
   *  routing for overlapping domains); with exactly one, that target's id is used
   *  even though no picker shows (so a lone LOCAL project is not misrouted to a
   *  sidecar); with none, capture is disabled with an explanation. */
  targets?: WriteTarget[];
  /** Forced UI theme for the form's shadow host (threaded from the content
   *  script). Omitted leaves the host on the system default. */
  theme?: Theme;
}

// Markdown toolbar commands: glyph shown on the button + i18n label key. The
// description toolbar uses all five; the business-rules toolbar uses the three
// inline marks only (each rule is one <li>, so block lists do not apply).
const MD_GLYPHS = {
  bold: { glyph: "B", labelKey: "capture.fmtBold" },
  italic: { glyph: "I", labelKey: "capture.fmtItalic" },
  link: { glyph: "🔗", labelKey: "capture.fmtLink" },
  bullet: { glyph: "•", labelKey: "capture.fmtBullet" },
  number: { glyph: "1.", labelKey: "capture.fmtNumber" },
} as const;

type MdCommand = keyof typeof MD_GLYPHS;

/** Build a toolbar of Markdown-insert buttons for one textarea. `variant` scopes
 *  the click handler to its textarea (desc vs rules). */
function mdToolbarHtml(cmds: readonly MdCommand[], variant: string): string {
  const buttons = cmds
    .map((cmd) => {
      const label = t(MD_GLYPHS[cmd].labelKey);
      return `<button type="button" class="md-btn md-${cmd}" data-cmd="${cmd}" aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}">${escapeHtml(MD_GLYPHS[cmd].glyph)}</button>`;
    })
    .join("");
  return `<div class="md-toolbar ${variant}">${buttons}</div>`;
}

/** One editable label+url link row for the provenance links sub-form. Values are
 *  attribute-escaped; the row is removable via its × button. */
function linkRowHtml(label = "", url = ""): string {
  return (
    `<div class="link-row">` +
    `<input class="link-label" placeholder="${escapeAttr(t("capture.linkLabelPlaceholder"))}" value="${escapeAttr(label)}" />` +
    `<input class="link-url" placeholder="${escapeAttr(t("capture.linkUrlPlaceholder"))}" value="${escapeAttr(url)}" />` +
    `<button type="button" class="link-remove" aria-label="${escapeAttr(t("capture.linkRemove"))}" title="${escapeAttr(t("capture.linkRemove"))}">×</button>` +
    `</div>`
  );
}

/** A capture-target option label: project name plus its kind, so "CRM (local)"
 *  reads clearly against "My Sidecar (sidecar)" when both serve the page. Shared
 *  with the bulk-capture form's target picker. */
export function targetLabel(target: WriteTarget): string {
  const name = target.project || target.id;
  const kind =
    target.kind === "local" ? t("capture.targetKindLocal") : t("capture.targetKindSidecar");
  return `${name} (${kind})`;
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
 *  locales by line index. When `existing` is given (edit mode) the spec keeps its
 *  id and provenance (createdBy/createdAt/source) and only bumps updatedAt;
 *  otherwise a fresh id + manual provenance are minted. The prior `meta` is
 *  SPREAD (not reconstructed from a subset), so an unrelated edit never drops the
 *  review stamp (reviewedAt/reviewedBy). `review`, when passed (Mark-reviewed),
 *  stamps those two fields. links/verifiedBy/status come straight from `fields`
 *  (not merged with `existing`), so clearing a field in edit mode overwrites the
 *  prior value instead of resurrecting it; empty values are omitted. Pure + testable. */
export function buildSpec(
  fields: CaptureFields,
  fingerprint: ElementFingerprint,
  nowIso: string,
  idSuffix: string,
  existing?: Spec,
  review?: { at: string; by: string },
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

  // Editing preserves the stable id and provenance (createdBy/createdAt/source)
  // and only bumps updatedAt; capture mints a fresh id + manual provenance. The
  // prior meta is spread first so review fields (and any future meta) survive an
  // unrelated edit; the enumerated keys then override.
  const spec: Spec = {
    id: existing?.id ?? `${base}-${idSuffix}`,
    title,
    description,
    businessRules,
    tags: fields.tags.map((t) => t.trim()).filter(Boolean),
    fingerprint,
    meta: {
      ...(existing?.meta ?? {}),
      createdBy: existing?.meta?.createdBy ?? (fields.createdBy?.trim() || "manual"),
      createdAt: existing?.meta?.createdAt ?? nowIso,
      updatedAt: nowIso,
      source: existing?.meta?.source ?? "manual",
      ...(review ? { reviewedAt: review.at, reviewedBy: review.by } : {}),
    },
  };
  if (fields.preferredDisplayMode) spec.preferredDisplayMode = fields.preferredDisplayMode;

  // Provenance fields come purely from the form state (preloaded from `existing`
  // on open), never merged with `existing` here — so clearing a field overwrites
  // the prior value. Empty values omit the key entirely (the saved shape).
  const links = (fields.links ?? [])
    .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
    .filter((l) => l.label && l.url);
  if (links.length) spec.links = links;
  const verifiedBy = (fields.verifiedBy ?? []).map((p) => p.trim()).filter(Boolean);
  if (verifiedBy.length) spec.verifiedBy = verifiedBy;
  if (fields.status) spec.status = fields.status;

  return spec;
}

/** Build an editable `Spec` seed for cloning `source` onto a NEW element: keep the
 *  authored content (title, description, business rules, tags, links) but drop the
 *  provenance that asserted the *source* — `verifiedBy`, `meta.reviewedAt`/
 *  `reviewedBy` — and reset `status` to draft so an approved source never launders
 *  an unreviewed copy into "approved". The id is cleared so it re-derives from the
 *  (possibly edited) title on save, and the fingerprint is left to the caller (the
 *  clone picks a fresh element). Pure + testable. */
export function cloneFields(source: Spec): Spec {
  const clone: Spec = { ...source, id: "", status: "draft" };
  if (clone.meta) {
    clone.meta = { ...clone.meta };
    delete clone.meta.reviewedAt;
    delete clone.meta.reviewedBy;
  }
  delete clone.verifiedBy;
  return clone;
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
  width: 560px; max-width: 92vw; max-height: 90vh; overflow: auto;
  background: var(--sp-surface); color: var(--sp-text);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-card);
  padding: 28px;
  font: 15px/1.5 var(--sp-font-ui);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
}
.card h3 { margin: 0 0 18px; font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }
label { display: block; font-weight: 600; margin: 16px 0 6px; color: var(--sp-text); }
.hint { color: var(--sp-text-3); font-weight: 400; font-size: 13px; }
input, textarea, select {
  width: 100%; padding: 10px 12px;
  font: 15px/1.4 var(--sp-font-ui);
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
/* Business rules usually hold several lines, so give it more room by default. */
#sp-rules { min-height: 140px; }
.lang-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.lang-tab {
  flex: 0 0 auto; width: auto; padding: 6px 12px;
  font: 600 14px/1 var(--sp-font-ui);
  color: var(--sp-text-2);
  background: var(--sp-elevated);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-control);
  cursor: pointer; transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.lang-tab:hover { border-color: var(--sp-accent); color: var(--sp-text); }
.lang-tab:focus-visible { outline: none; border-color: var(--sp-accent); box-shadow: 0 0 0 3px var(--sp-accent-glow); }
.lang-tab.is-active {
  color: var(--sp-accent-on); background: var(--sp-accent); border-color: var(--sp-accent);
}
.lang-tab.add { color: var(--sp-text-3); font-weight: 700; }
.md-toolbar { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 4px; }
.md-btn {
  flex: 0 0 auto; width: auto; min-width: 30px; padding: 5px 8px;
  font: 600 14px/1 var(--sp-font-ui);
  color: var(--sp-text-2);
  background: var(--sp-elevated);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-control);
  cursor: pointer; transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.md-btn:hover { border-color: var(--sp-accent); color: var(--sp-text); filter: none; }
.md-btn:focus-visible { outline: none; border-color: var(--sp-accent); box-shadow: 0 0 0 3px var(--sp-accent-glow); }
.md-btn.md-italic { font-style: italic; }
.link-row { display: flex; gap: 6px; margin-bottom: 6px; }
.link-row .link-label { flex: 0 0 34%; }
.link-row .link-url { flex: 1 1 auto; }
.link-row .link-remove {
  flex: 0 0 auto; width: auto; min-width: 34px; padding: 0 10px;
  background: var(--sp-control); color: var(--sp-text-2);
}
#sp-add-link.add-link { width: auto; margin-top: 2px; padding: 6px 12px; }
.review-row { display: flex; align-items: center; gap: 10px; }
.review-row #sp-mark-reviewed { width: auto; padding: 8px 14px; }
#sp-reviewed-by { margin-top: 8px; }
.actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
button {
  padding: 10px 18px;
  font: 600 15px/1 var(--sp-font-ui);
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
#sp-relink { margin-top: 8px; width: 100%; }
.relink-note {
  display: none; margin-top: 8px; font-size: 13px; color: var(--sp-text-3);
}
.relink-note.show { display: block; }
.weak-hint {
  margin-top: 14px; padding: 12px;
  background: var(--sp-warning-bg);
  border: 1px solid var(--sp-warning-border);
  border-radius: var(--sp-radius-control);
  color: var(--sp-text-2);
}
.weak-hint[hidden] { display: none; }
.weak-hint strong { display: block; color: var(--sp-warning); font-size: 14px; }
.weak-hint p { margin: 6px 0; font-size: 14px; }
.weak-hint .weak-snippet {
  display: block; margin: 6px 0; padding: 8px 10px;
  font: 500 14px/1.4 var(--sp-font-mono);
  color: var(--sp-text); background: var(--sp-elevated);
  border: 1px solid var(--sp-border); border-radius: var(--sp-radius-control);
  word-break: break-all;
}
.weak-hint .weak-copy { margin-top: 4px; width: auto; padding: 6px 12px; }
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
    // Editing reuses the existing spec (id + provenance preserved); the fingerprint
    // is mutable so a re-link can repoint the spec without losing field edits.
    const editing = !!options.initial;
    // Content to preload: an edit's own spec, else a clone's prefill seed. Edit
    // preserves id/provenance (buildSpec gets `initial`); a prefill is CREATE mode
    // (buildSpec gets no existing → fresh id + provenance), so only content loads.
    const preload = options.initial ?? options.prefill ?? null;
    let activeFingerprint = fingerprint;
    const { host, shadow } = createShadowHost(this.doc, HOST_ID, STYLES, options.theme);
    const wrap = this.doc.createElement("div");
    wrap.className = "backdrop";

    // Seed available locales: manifest locales + default + any from the spec
    // being edited, de-duplicated and default-first.
    const seeded = new Set<string>([options.defaultLocale, ...options.locales]);
    const byLocale: Record<string, LocaleContent> = {};
    if (preload) {
      for (const loc of localesOf(preload)) seeded.add(loc);
    }
    const locales = [...seeded].filter(Boolean);
    let current = options.defaultLocale || locales[0] || "en";

    const targets = options.targets ?? [];
    setTrustedHtml(
      wrap,
      this.template(options.defaultFile, locales, current, targets, {
        editing,
        relinkable: editing && !!options.onRelink,
      }),
    );
    shadow.appendChild(wrap);
    this.host = host;

    const q = <T extends HTMLElement>(sel: string) => shadow.querySelector(sel) as T;
    const errorsBox = q<HTMLElement>(".errors");
    const titleEl = q<HTMLInputElement>("#sp-title");
    const descEl = q<HTMLTextAreaElement>("#sp-desc");
    const rulesEl = q<HTMLTextAreaElement>("#sp-rules");
    const pageUrlEl = q<HTMLInputElement>("#sp-pageurl");
    const tabStrip = q<HTMLElement>(".lang-tabs");
    const linksBox = q<HTMLElement>("#sp-links");
    // Prefill the page-scope glob from the fingerprint (auto-filled at capture,
    // preserved on edit). Blank means "match on any page".
    pageUrlEl.value = activeFingerprint.pageUrl ?? "";

    // Links sub-form: "Add link" appends an empty row; a delegated handler removes
    // a row via its × button. The rows are the source of truth read at save.
    q<HTMLButtonElement>("#sp-add-link").addEventListener("click", () => {
      appendTrustedHtml(linksBox, linkRowHtml());
    });
    linksBox.addEventListener("click", (e) => {
      (e.target as HTMLElement).closest(".link-remove")?.closest(".link-row")?.remove();
    });

    // Preload content for editing an existing spec OR cloning from a prefill seed:
    // per-locale text plus the locale-independent tags + display mode (else saving
    // would wipe them). A clone omits verifiedBy + review (cloneFields stripped
    // them) so the copy starts as an unreviewed draft.
    if (preload) {
      for (const loc of localesOf(preload)) byLocale[loc] = contentForLocale(preload, loc);
      q<HTMLInputElement>("#sp-tags").value = (preload.tags ?? []).join(", ");
      if (preload.preferredDisplayMode)
        q<HTMLSelectElement>("#sp-mode").value = preload.preferredDisplayMode;
      // Provenance: preload so an edit preserves them and clearing a field
      // overwrites (buildSpec never falls back to `existing` for these).
      if (preload.status) q<HTMLSelectElement>("#sp-status").value = preload.status;
      q<HTMLTextAreaElement>("#sp-verifiedby").value = (preload.verifiedBy ?? []).join("\n");
      for (const link of preload.links ?? [])
        appendTrustedHtml(linksBox, linkRowHtml(link.label, link.url));
      // Mark-reviewed prefill: the spec's existing reviewer, else the non-PII
      // createdBy token — never a resolved user identity/email. Only in edit mode:
      // the review controls (#sp-reviewed-*) render only then, so a clone prefill
      // (create mode) must not touch them.
      if (editing) {
        const reviewedByEl = q<HTMLInputElement>("#sp-reviewed-by");
        reviewedByEl.value = preload.meta?.reviewedBy ?? preload.meta?.createdBy ?? "manual";
        const reviewedAt = preload.meta?.reviewedAt;
        q<HTMLElement>("#sp-reviewed-status").textContent = reviewedAt
          ? t("capture.reviewedOn", { date: reviewedAt })
          : t("capture.notReviewed");
      }
    }

    // Template dropdown: prefill empty fields only (tags / business rules / status)
    // from a built-in pattern, in the active UI locale. Never overwrites text the
    // author already entered (fill-empty), so it is safe to pick then edit.
    wireTemplateSelect(
      shadow.querySelector<HTMLSelectElement>("#sp-template"),
      {
        tags: q<HTMLInputElement>("#sp-tags"),
        rules: rulesEl,
        status: q<HTMLSelectElement>("#sp-status"),
      },
      t,
    );

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
    // Mark the active tab in the strip (skips the "+" add tab, whose sentinel
    // locale never equals a real one).
    const setActiveTab = (loc: string): void => {
      for (const btn of tabStrip.querySelectorAll<HTMLButtonElement>(".lang-tab")) {
        const active = btn.dataset.locale === loc;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-selected", String(active));
      }
    };
    loadLocale(current);

    // One delegated click handler for the whole strip: the "+" tab opens the
    // add-language prompt; any other tab stashes the current locale's edits then
    // loads the clicked one (same stash/load model the dropdown used).
    tabStrip.addEventListener("click", async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".lang-tab");
      if (!btn) return;
      const value = btn.dataset.locale ?? "";
      if (value === ADD_LOCALE_VALUE) {
        const code = await promptDialog({
          message: t("capture.addLanguagePrompt"),
          placeholder: "vi",
          root: shadow,
        });
        if (!code) return;
        if (!LOCALE_PATTERN.test(code)) {
          this.showErrors(errorsBox, [t("capture.invalidLocale", { code })]);
          return;
        }
        const exists = [...tabStrip.querySelectorAll<HTMLButtonElement>(".lang-tab")].some(
          (b) => b.dataset.locale === code,
        );
        if (!exists) {
          const tab = this.doc.createElement("button");
          tab.type = "button";
          tab.className = "lang-tab";
          tab.setAttribute("role", "tab");
          tab.dataset.locale = code;
          tab.textContent = code;
          tabStrip.insertBefore(tab, btn); // before the "+" tab
        }
        stashCurrent();
        current = code;
        loadLocale(code);
        setActiveTab(code);
        return;
      }
      stashCurrent();
      current = value;
      loadLocale(value);
      setActiveTab(value);
    });

    // Markdown toolbars: each button inserts its syntax into the focused
    // textarea's selection. Read selectionStart/End synchronously (a type=button
    // click does not blur the textarea, but reading first is safe), apply the pure
    // helper, then write the value back and restore focus + selection so typing
    // continues naturally. The textarea value is the source of truth, so save
    // picks the edits up via stashCurrent with no extra wiring.
    const runMdCommand = async (textarea: HTMLTextAreaElement, cmd: string): Promise<void> => {
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      const { value } = textarea;
      let edit: ReturnType<typeof toggleWrap>;
      switch (cmd) {
        case "bold":
          edit = toggleWrap(value, start, end, "**");
          break;
        case "italic":
          edit = toggleWrap(value, start, end, "_");
          break;
        case "link": {
          const url = await promptDialog({ message: t("capture.fmtLinkPrompt"), root: shadow });
          if (url === null) return; // dialog cancelled
          edit = insertLink(value, start, end, url);
          break;
        }
        case "bullet":
          edit = prefixLines(value, start, end, "bullet");
          break;
        case "number":
          edit = prefixLines(value, start, end, "number");
          break;
        default:
          return;
      }
      textarea.value = edit.value;
      textarea.focus();
      textarea.setSelectionRange(edit.selStart, edit.selEnd);
    };
    const wireToolbar = (selector: string, textarea: HTMLTextAreaElement): void => {
      q<HTMLElement>(selector).addEventListener("click", (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".md-btn");
        if (btn) void runMdCommand(textarea, btn.dataset.cmd ?? "");
      });
    };
    wireToolbar(".md-toolbar.desc", descEl);
    wireToolbar(".md-toolbar.rules", rulesEl);

    // Weak-anchor hint: when the stored fingerprint has no stable anchor
    // (no testId/aria/non-generated id), surface a copyable data-spec-id snippet
    // so the dev can harden the match to exact. Purely advisory — saving is
    // unaffected, and nothing writes the page's source. The snippet id tracks the
    // title field live; a re-link recomputes it against the new element.
    const weakHint = q<HTMLElement>(".weak-hint");
    const weakSnippet = q<HTMLElement>(".weak-snippet");
    const weakCopy = q<HTMLButtonElement>(".weak-copy");
    const refreshSnippet = (): void => {
      weakSnippet.textContent = dataSpecIdSnippet(titleEl.value.trim()).snippet;
    };
    const updateWeakHint = (): void => {
      const weak = anchorStrength(activeFingerprint) === "weak";
      weakHint.hidden = !weak;
      if (weak) refreshSnippet();
    };
    titleEl.addEventListener("input", () => {
      if (!weakHint.hidden) refreshSnippet();
    });
    weakCopy.addEventListener("click", async () => {
      // Clipboard blocked (permissions/insecure context) leaves the snippet
      // visible for a manual copy; only confirm on a successful write.
      if (await copyText(weakSnippet.textContent ?? "")) {
        const original = weakCopy.textContent;
        weakCopy.textContent = t("helper.copied");
        setTimeout(() => {
          weakCopy.textContent = original;
        }, 1500);
      }
    });
    updateWeakHint();

    // Re-link: hide the form (not close, so field edits survive), run the page
    // picker via onRelink, then restore. A returned fingerprint repoints the spec.
    if (options.onRelink) {
      q<HTMLButtonElement>("#sp-relink").addEventListener("click", async () => {
        stashCurrent();
        if (this.host) this.host.style.display = "none";
        const fp = await options.onRelink?.();
        if (this.host) this.host.style.display = "";
        if (fp) {
          activeFingerprint = fp;
          // Re-link recaptures on the (possibly new) page: refresh the scope glob
          // to the new element's path so it reflects where the spec now points.
          pageUrlEl.value = fp.pageUrl ?? "";
          // The new element may have a stronger/weaker anchor: re-evaluate the hint.
          updateWeakHint();
          shadow.querySelector(".relink-note")?.classList.add("show");
        }
      });
    }

    const cancel = () => {
      this.close();
      options.onCancel?.();
    };
    // Escape closes the form like Cancel, so a half-filled form is never stuck
    // open. Bound on the document and removed in close() (no listener leak).
    this.escHandler = (e: KeyboardEvent) => {
      // A prompt/confirm dialog open over the form owns Escape (it closes itself);
      // the form must not also close out from under it. This guard (not the dialog's
      // stopPropagation) is what prevents the double-close: both handlers bind on
      // `document` in the capture phase, the form's was registered first, so it runs
      // before the dialog's and stopPropagation cannot retroactively stop it.
      if (e.key === "Escape" && !anyDialogOpen()) {
        e.preventDefault();
        cancel();
      }
    };
    this.doc.addEventListener("keydown", this.escHandler, true);
    q<HTMLButtonElement>("#sp-cancel").addEventListener("click", cancel);
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) cancel();
    });

    // Read the current link rows into label/url pairs (empties dropped in build).
    const readLinkRows = (): Link[] =>
      [...linksBox.querySelectorAll<HTMLElement>(".link-row")].map((row) => ({
        label: (row.querySelector(".link-label") as HTMLInputElement).value,
        url: (row.querySelector(".link-url") as HTMLInputElement).value,
      }));

    // Gather all form state into CaptureFields (provenance included).
    const readFields = (): CaptureFields => {
      stashCurrent();
      return {
        byLocale,
        defaultLocale: options.defaultLocale || current,
        tags: q<HTMLInputElement>("#sp-tags").value.split(","),
        preferredDisplayMode: (q<HTMLSelectElement>("#sp-mode").value ||
          null) as DisplayMode | null,
        links: readLinkRows(),
        verifiedBy: q<HTMLTextAreaElement>("#sp-verifiedby").value.split("\n"),
        status: (q<HTMLSelectElement>("#sp-status").value || null) as SpecStatus | null,
      };
    };

    // One write path shared by Save and Mark-reviewed. `review`, when passed,
    // stamps meta.reviewedAt/reviewedBy; both routes reuse the same validation,
    // routing, and 409-conflict handling.
    const submit = async (review?: { at: string; by: string }): Promise<void> => {
      // A capture with no writable project serving the page cannot be routed:
      // explain rather than misroute to a non-existent sidecar. (Edit always has
      // its owning project, so this never blocks an edit.)
      if (!editing && (options.targets?.length ?? 0) === 0) {
        this.showErrors(errorsBox, [t("capture.noWritableProject")]);
        return;
      }
      const fields = readFields();

      // Friendly guard: the default locale must carry title + description so the
      // user gets a clear message instead of a raw schema error.
      const def = fields.byLocale[fields.defaultLocale];
      const missing: string[] = [];
      if (!def?.title.trim()) missing.push(t("capture.fieldTitle"));
      if (!def?.description.trim()) missing.push(t("capture.fieldDescription"));
      if (missing.length) {
        this.showErrors(errorsBox, [
          t("capture.enterFieldsForDefault", {
            fields: missing.join(` ${t("common.and")} `),
            locale: fields.defaultLocale,
          }),
        ]);
        return;
      }

      // Merge the edited page-scope glob into the fingerprint before building the
      // spec; blank clears it back to "match anywhere".
      const scopedFingerprint: ElementFingerprint = {
        ...activeFingerprint,
        pageUrl: pageUrlEl.value.trim() || null,
      };
      const idSuffix = randomSuffix();
      const spec = buildSpec(
        fields,
        scopedFingerprint,
        new Date().toISOString(),
        idSuffix,
        options.initial,
        review,
      );

      const validation = validateSpec(spec);
      if (!validation.valid) {
        this.showErrors(errorsBox, [formatErrors(validation.errors)]);
        return;
      }
      // Edit is id-addressed: file + target project are not selectable (the form
      // hides them), and the owning connection is supplied by the caller.
      const file = editing
        ? ""
        : q<HTMLInputElement>("#sp-file").value.trim() || options.defaultFile;
      // With a picker, use the chosen option; with exactly one target (no picker),
      // fall back to that lone target's id so a single LOCAL project still carries
      // its `manual:<id>` and is not misrouted to "first sidecar" (undefined).
      const targetSel = shadow.querySelector<HTMLSelectElement>("#sp-target");
      const connectionId = editing
        ? undefined
        : targetSel?.value || options.targets?.[0]?.id || undefined;
      const result = await options.onSubmit(file, spec, connectionId);
      if (result.ok) this.close();
      else if (result.conflict) this.showErrors(errorsBox, [t("capture.specChangedReloaded")]);
      else this.showErrors(errorsBox, result.errors ?? [t("capture.saveFailed")]);
    };

    q<HTMLButtonElement>("#sp-save").addEventListener("click", () => void submit());
    // Mark reviewed (edit mode only): stamp meta.reviewedAt=now + the reviewer
    // token (non-PII default, editable) and save through the same path.
    if (editing) {
      q<HTMLButtonElement>("#sp-mark-reviewed").addEventListener("click", () => {
        const by = q<HTMLInputElement>("#sp-reviewed-by").value.trim() || "manual";
        void submit({ at: new Date().toISOString(), by });
      });
    }
  }

  private template(
    defaultFile: string,
    locales: string[],
    current: string,
    targets: WriteTarget[],
    opts: { editing: boolean; relinkable: boolean },
  ): string {
    const localeTabs = locales
      .map(
        (l) =>
          `<button type="button" class="lang-tab${l === current ? " is-active" : ""}" role="tab" aria-selected="${l === current}" data-locale="${escapeAttr(l)}">${escapeHtml(l)}</button>`,
      )
      .join("");
    // Ask which project to save into only when more than one serves this page
    // (each option labelled by kind so sidecar vs local is clear). With exactly
    // one, the lone target's id is resolved at submit (no picker). With none,
    // explain that capture is disabled. Edit is id-addressed: never shown.
    let targetField = "";
    if (!opts.editing) {
      if (targets.length > 1) {
        targetField = `<label>${escapeHtml(t("capture.targetProject"))}</label><select id="sp-target">${targets
          .map(
            (target) =>
              `<option value="${escapeAttr(target.id)}">${escapeHtml(targetLabel(target))}</option>`,
          )
          .join("")}</select>`;
      } else if (targets.length === 0) {
        targetField = `<div class="relink-note">${escapeHtml(t("capture.noWritableProject"))}</div>`;
      }
    }
    const fileField = opts.editing
      ? ""
      : `<label>${escapeHtml(t("capture.targetFile"))}</label><input id="sp-file" value="${escapeAttr(defaultFile)}" />`;
    const relinkField = opts.relinkable
      ? `<button type="button" id="sp-relink">${escapeHtml(t("capture.relink"))}</button>
        <div class="relink-note">${escapeHtml(t("capture.relinkNote"))}</div>`
      : "";
    return `
      <div class="card">
        <h3>${escapeHtml(opts.editing ? t("capture.titleEdit") : t("capture.titleCapture"))}</h3>
        ${targetField}
        <label>${escapeHtml(t("template.label"))}</label>
        <select id="sp-template">
          <option value="">${escapeHtml(t("template.none"))}</option>
          ${SPEC_TEMPLATES.map((tpl) => `<option value="${escapeAttr(tpl.id)}">${escapeHtml(t(tpl.labelKey))}</option>`).join("")}
        </select>
        <label>${escapeHtml(t("capture.languageLabel"))} <span class="hint">${escapeHtml(t("capture.languageHint"))}</span></label>
        <div class="lang-tabs" role="tablist">${localeTabs}<button type="button" class="lang-tab add" data-locale="${ADD_LOCALE_VALUE}" aria-label="${escapeAttr(t("capture.addLanguageTab"))}" title="${escapeAttr(t("capture.addLanguageTab"))}">+</button></div>
        <label>${escapeHtml(t("capture.titleField"))}</label><input id="sp-title" placeholder="${escapeAttr(t("capture.titlePlaceholder"))}" />
        <label>${escapeHtml(t("capture.descField"))} <span class="hint">${escapeHtml(t("capture.fmtHint"))}</span></label>
        ${mdToolbarHtml(["bold", "italic", "link", "bullet", "number"], "desc")}
        <textarea id="sp-desc" placeholder="${escapeAttr(t("capture.descPlaceholder"))}"></textarea>
        <label>${escapeHtml(t("capture.rulesField"))} <span class="hint">${escapeHtml(t("capture.rulesHint"))}</span></label>
        ${mdToolbarHtml(["bold", "italic", "link"], "rules")}
        <textarea id="sp-rules"></textarea>
        <label>${escapeHtml(t("capture.tagsField"))} <span class="hint">${escapeHtml(t("capture.tagsHint"))}</span></label><input id="sp-tags" placeholder="${escapeAttr(t("capture.tagsPlaceholder"))}" />
        <label>${escapeHtml(t("capture.displayModeLabel"))}</label>
        <select id="sp-mode">
          <option value="">${escapeHtml(t("capture.modeDefault"))}</option>
          <option value="tooltip">tooltip</option>
          <option value="sidebar">sidebar</option>
        </select>
        <label>${escapeHtml(t("capture.statusLabel"))} <span class="hint">${escapeHtml(t("capture.statusHint"))}</span></label>
        <select id="sp-status">
          <option value="">${escapeHtml(t("capture.statusNeutral"))}</option>
          <option value="draft">${escapeHtml(t("prov.statusDraft"))}</option>
          <option value="approved">${escapeHtml(t("prov.statusApproved"))}</option>
          <option value="deprecated">${escapeHtml(t("prov.statusDeprecated"))}</option>
        </select>
        <label>${escapeHtml(t("capture.linksLabel"))} <span class="hint">${escapeHtml(t("capture.linksHint"))}</span></label>
        <div id="sp-links"></div>
        <button type="button" id="sp-add-link" class="add-link">${escapeHtml(t("capture.addLink"))}</button>
        <label>${escapeHtml(t("capture.verifiedByLabel"))} <span class="hint">${escapeHtml(t("capture.verifiedByHint"))}</span></label>
        <textarea id="sp-verifiedby" placeholder="${escapeAttr(t("capture.verifiedByPlaceholder"))}"></textarea>
        ${
          opts.editing
            ? `<label>${escapeHtml(t("capture.reviewLabel"))}</label>
        <div class="review-row">
          <span id="sp-reviewed-status" class="hint"></span>
          <button type="button" id="sp-mark-reviewed">${escapeHtml(t("capture.markReviewed"))}</button>
        </div>
        <input id="sp-reviewed-by" placeholder="${escapeAttr(t("capture.reviewedByPlaceholder"))}" />
        <span class="hint">${escapeHtml(t("capture.reviewedByWarning"))}</span>`
            : ""
        }
        <label>${escapeHtml(t("capture.pageScopeField"))} <span class="hint">${escapeHtml(t("capture.pageScopeHint"))}</span></label><input id="sp-pageurl" placeholder="${escapeAttr(t("capture.pageScopePlaceholder"))}" />
        ${fileField}
        ${relinkField}
        <div class="weak-hint" hidden>
          <strong>${escapeHtml(t("helper.weakAnchorTitle"))}</strong>
          <p>${escapeHtml(t("helper.weakAnchorHint"))}</p>
          <code class="weak-snippet"></code>
          <button type="button" class="weak-copy">${escapeHtml(t("helper.copySnippet"))}</button>
        </div>
        <div class="errors"><strong>${escapeHtml(t("capture.couldNotSave"))}</strong><ul></ul></div>
        <div class="actions">
          <button id="sp-cancel">${escapeHtml(t("common.cancel"))}</button>
          <button id="sp-save" class="primary">${escapeHtml(opts.editing ? t("capture.saveChanges") : t("capture.saveSpec"))}</button>
        </div>
      </div>`;
  }

  private showErrors(box: HTMLElement, messages: string[]): void {
    const ul = box.querySelector("ul");
    if (!ul) return;
    setTrustedHtml(ul, messages.map((m) => `<li>${escapeHtml(m)}</li>`).join(""));
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

/** A short random id suffix for a freshly captured spec. Shared with the bulk
 *  form so every captured spec's id is unique even when titles collide. */
export function randomSuffix(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID().slice(0, 6);
  return Math.floor(Math.random() * 1e6).toString(36);
}
