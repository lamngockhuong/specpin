import { anchorStrength } from "@specpin/fingerprint-core";
import type { DisplayMode, ElementFingerprint, LocalizedString, Spec } from "@specpin/spec-schema";
import { formatErrors, validateSpec } from "@specpin/spec-schema";
import { t } from "../i18n/index.js";
import { copyText } from "../shared/clipboard.js";
import { dataSpecIdSnippet } from "../shared/data-spec-id.js";
import { anyDialogOpen, promptDialog } from "../shared/dialog.js";
import { escapeAttr, escapeHtml } from "../shared/html.js";
import { insertLink, prefixLines, toggleWrap } from "../shared/markdown-input.js";
import type { WriteTarget } from "../shared/messaging.js";
import { createShadowHost } from "../shared/shadow.js";
import { slugify } from "../shared/slug.js";
import type { Theme } from "../shared/theme.js";
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

/** A capture-target option label: project name plus its kind, so "CRM (local)"
 *  reads clearly against "My Sidecar (sidecar)" when both serve the page. */
function targetLabel(target: WriteTarget): string {
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
 *  otherwise a fresh id + manual provenance are minted. Pure + testable. */
export function buildSpec(
  fields: CaptureFields,
  fingerprint: ElementFingerprint,
  nowIso: string,
  idSuffix: string,
  existing?: Spec,
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
  // and only bumps updatedAt; capture mints a fresh id + manual provenance.
  const spec: Spec = {
    id: existing?.id ?? `${base}-${idSuffix}`,
    title,
    description,
    businessRules,
    tags: fields.tags.map((t) => t.trim()).filter(Boolean),
    fingerprint,
    meta: {
      createdBy: existing?.meta?.createdBy ?? (fields.createdBy?.trim() || "manual"),
      createdAt: existing?.meta?.createdAt ?? nowIso,
      updatedAt: nowIso,
      source: existing?.meta?.source ?? "manual",
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
  width: 560px; max-width: 92vw; max-height: 90vh; overflow: auto;
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
/* Business rules usually hold several lines, so give it more room by default. */
#sp-rules { min-height: 140px; }
.lang-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.lang-tab {
  flex: 0 0 auto; width: auto; padding: 6px 12px;
  font: 600 12px/1 var(--sp-font-ui);
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
  font: 600 12px/1 var(--sp-font-ui);
  color: var(--sp-text-2);
  background: var(--sp-elevated);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-control);
  cursor: pointer; transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.md-btn:hover { border-color: var(--sp-accent); color: var(--sp-text); filter: none; }
.md-btn:focus-visible { outline: none; border-color: var(--sp-accent); box-shadow: 0 0 0 3px var(--sp-accent-glow); }
.md-btn.md-italic { font-style: italic; }
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
#sp-relink { margin-top: 8px; width: 100%; }
.relink-note {
  display: none; margin-top: 8px; font-size: 11px; color: var(--sp-text-3);
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
.weak-hint strong { display: block; color: var(--sp-warning); font-size: 12px; }
.weak-hint p { margin: 6px 0; font-size: 12px; }
.weak-hint .weak-snippet {
  display: block; margin: 6px 0; padding: 8px 10px;
  font: 500 12px/1.4 var(--sp-font-mono);
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
    let activeFingerprint = fingerprint;
    const { host, shadow } = createShadowHost(this.doc, HOST_ID, STYLES, options.theme);
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
    wrap.innerHTML = this.template(options.defaultFile, locales, current, targets, {
      editing,
      relinkable: editing && !!options.onRelink,
    });
    shadow.appendChild(wrap);
    this.host = host;

    const q = <T extends HTMLElement>(sel: string) => shadow.querySelector(sel) as T;
    const errorsBox = q<HTMLElement>(".errors");
    const titleEl = q<HTMLInputElement>("#sp-title");
    const descEl = q<HTMLTextAreaElement>("#sp-desc");
    const rulesEl = q<HTMLTextAreaElement>("#sp-rules");
    const pageUrlEl = q<HTMLInputElement>("#sp-pageurl");
    const tabStrip = q<HTMLElement>(".lang-tabs");
    // Prefill the page-scope glob from the fingerprint (auto-filled at capture,
    // preserved on edit). Blank means "match on any page".
    pageUrlEl.value = activeFingerprint.pageUrl ?? "";

    // Preload content for editing an existing spec: per-locale text plus the
    // locale-independent tags + display mode (else saving would wipe them).
    if (options.initial) {
      for (const loc of localesOf(options.initial))
        byLocale[loc] = contentForLocale(options.initial, loc);
      q<HTMLInputElement>("#sp-tags").value = (options.initial.tags ?? []).join(", ");
      if (options.initial.preferredDisplayMode)
        q<HTMLSelectElement>("#sp-mode").value = options.initial.preferredDisplayMode;
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

    q<HTMLButtonElement>("#sp-save").addEventListener("click", async () => {
      // A capture with no writable project serving the page cannot be routed:
      // explain rather than misroute to a non-existent sidecar. (Edit always has
      // its owning project, so this never blocks an edit.)
      if (!editing && (options.targets?.length ?? 0) === 0) {
        this.showErrors(errorsBox, [t("capture.noWritableProject")]);
        return;
      }
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
    });
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
