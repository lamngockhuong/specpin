# Extension UI Design System

> Tiếng Việt: [`vi/design-system.md`](./vi/design-system.md). English is the source of truth.

Visual mockups for the browser extension's user-facing surfaces, plus the single
source of truth for their colors and fonts. Source files live in
`apps/extension/designs/`. The `.pen` files stay design references (not shipped
code), but `design-tokens.json` now also drives the shipped UI: it generates the
CSS-variable layer the live surfaces in `apps/extension/src` consume (see
"Tokens in the shipped UI" below), so mockups and code share one palette.

Aesthetic: "branded teal" - teal accent `#2DD4BF`, a radial top-glow gradient on
each surface, an accent glow behind the primary CTA, hairline borders, 16px card
radius, Inter for UI text and JetBrains Mono for code/paths. Dark is teal-tinted
near-black; light is a pale teal canvas with white cards. Designs are authored
with the [Pencil CLI](https://pencil.dev); each `.pen` file is plain JSON.

## One file per surface, two themes

Each surface is a single `.pen` holding **one layout** with a light and dark
color theme (Pencil's `themes` axis `mode: [light, dark]`). Theme-dependent
colors are stored as per-theme arrays, so light and dark are guaranteed to share
the exact same structure and differ only in color.

| File | Surface | Renders |
|------|---------|---------|
| `popup.pen` | Toolbar popup | status + on/off, project + spec count, spec list, Reload/Reconnect, Capture, mode select, settings link |
| `options.pen` | Options page | sidecar URL + token fields, Test connection & save, success/error banners |
| `sidebar.pen` | In-page sidebar | panel listing matched specs; `needsReview` specs get an amber border + tag |
| `capture-form.pen` | Capture modal | title, description, business rules, tags, display mode, target file |

## On-page visual patterns

Reusable patterns that overlay the page's own content:

- **Spec badge**: A blue or amber "S" (or number) circle, 16px, positioned to avoid overlapping content. Marks an element with a spec. Rendered in a Shadow DOM host, positioned by the badge-position solver, respects reduced-motion. The normal (non-review) badge accepts a user color override: when set (Options > Appearance), the tooltip renderer stamps `--sp-badge-bg` / `--sp-badge-fg` on its host and `.badge` reads `var(--sp-badge-bg, var(--sp-accent))` / `var(--sp-badge-fg, var(--sp-accent-on))`, so unset falls back to the brand tokens byte-for-byte. The glyph color is auto-derived from the background's WCAG luminance (`shared/contrast.ts`), never a token. The amber `needsReview` state stays hard-coded to `--sp-warning-border` and does not recolor; the design-token SSOT (`--sp-accent`) is unchanged.
- **Ghost marker**: A dashed circular outline with a centered "+" icon, 16-20px depending on content fit. Marks an undocumented interactive element (coverage mode). Also rendered in a Shadow DOM host, positioned by the same badge-position solver, respects reduced-motion. Visually distinct from the spec badge with a dashed border instead of solid. Its palette is deliberately theme-independent (a light chip: slate dashed ring, muted "+", soft shadow) rather than following the extension UI theme, because it overlays the host page's own background: a dark-theme marker would paint a near-black blob on a light page.
- **Picker HUD**: A fixed-position banner at the bottom-center of the page, displayed during element picking (capture, re-link, clone, bulk multi-select). Shows contextual instructions ("Click an element to capture", "N selected" count in bulk mode, Done/Cancel buttons). Rendered in an isolated Shadow DOM with theme-aware styling via `--sp-*` tokens. Pointer events are limited to its interactive buttons so the rest of the page remains clickable. Respects reduced-motion.
- **Icon buttons**: Shared inline-SVG icon set from `src/shared/icons.ts` (12x12 viewBox, stroking currentColor). Icons include: close (X), plus (+), check, play, pencil, trash, copy (two overlapping squares = duplicate), link (chain = copy link), panel (split rectangle = open in side panel). The copy and link glyphs are deliberately different shapes so "duplicate to element" never reads as "copy link". Used for the modal header close button (X), guide-row Start/Edit/Delete actions (play/pencil/trash icons), HUD Done/Cancel buttons, the Options matching-corpus per-entry Delete (trash icon), the primary CTAs (see icon+text CTA below), and the pinned tooltip action row (see below). Always paired with `aria-label` and `title` for accessibility and tooltip on hover.
- **Icon+text CTA**: The primary "Capture spec" button (`#capture`, popup + side panel) and the "New guide" link (`guide-section.ts`) lead with the `plus` icon followed by the text label (`display: inline-flex; gap`), replacing an earlier literal "+" character in the label string. The icon is a separate node from the `[data-i18n]` label span, so i18n hydration (which rewrites only the span's `textContent`) never wipes it, and a language switch keeps both icon and translated label.
- **Icon-only action row** (`.pin-actions` in `src/renderers/tooltip.ts`): a pinned tooltip's actions (Edit / Delete / Duplicate / Correct / Copy link / Open in side panel) render as one compact horizontal flex row of 28px icon-only buttons (`.pin-act`) instead of stacked full-width text bars, a large vertical-space win. Each button keeps its original class (so handler wiring is unchanged) and carries `aria-label` + `title` from the same i18n string it used to show as text, the discoverability backstop for icon-only. Delete keeps its destructive tint (`--sp-error-*`); the trash glyph strokes `currentColor`, so it turns error-red too. The row `flex-wrap`s on very narrow tips.

Rendered PNGs: `<surface>.light.png` and `<surface>.dark.png`. `overview.png` is
a 2x4 montage (columns = light | dark). The tooltip renderer
(`src/renderers/tooltip.ts`) has no mockup yet.

## Auto-capture (Track B) UI patterns

Reusable patterns introduced by the Track B auto-capture recorder (graph panel + Options), not overlays on a host page:

- **Per-project record toggle**: recording is opt-in **per project** (no device-global switch). Each project row on the Options page carries a **Record** switch (`.conn-record-toggle`) beside its enable/disable switch, reusing the same track+knob `.switch` control - so record vs enable read as one control family. The switch is `disabled` (greyed) while the project itself is disabled, since a project that serves no page cannot record. No new tokens.
- **Recording banner** (graph panel, `#capture-banner`): a full-width banner scoped to the currently-selected project, shown whenever the graph view is open. While recording, a pulsing red dot (`--sp-error-text`, `1.6s` opacity keyframe) on an error-tinted chip (`--sp-error-bg` fill, `--sp-error-border` border) reads recording as a live state, with a reachable **Turn off** and a **Clear all captured** action for that project's draft buffer. When the project's record opt-in is OFF the banner drops the pulse and offers a **Turn on** action instead (`#capture-banner.off`); when the draft buffer is at its bounded cap it also drops the pulse to a steady dot (`#capture-banner.full`), since nothing new can be recorded until some drafts are approved or discarded. No new tokens: reuses the existing `--sp-error-*` triad.
- **Ghost edge/node (pending)**: a committed-looking node or edge rendered with a dashed outline (`stroke-dasharray`), reduced opacity, and (for edges) an italicized label - `.graph-node.pending` / `.graph-edge.pending` in `graph-svg.ts`. Marks a Track B auto-captured screen/transition that has not yet been approved into `screens.json`; visually distinct from a committed node/edge at a glance, so "pending, not yet saved" is never mistaken for already-graphed. No new tokens - the dash/opacity/italic treatment layers on top of the same `--sp-border`/`--sp-text` values committed nodes use, so it themes automatically. Clicking a pending edge opens an inline Approve/Discard panel (`.ghost-panel-*`), which uses `--sp-error-text` for its error state (not a hardcoded literal), matching every other error-state surface in the extension.

## In-browser graph editor (Track C) UI patterns

Reusable patterns introduced by the Track C in-browser graph editor (the graph view's opt-in **Edit mode**), on top of the read-only diagram and the Track B ghost patterns above - no new tokens anywhere in this section, every rule below layers on top of existing `--sp-*` vars.

- **Edit-mode toolbar**: the same `.ghost-panel-actions` flex-row style as the Track B ghost approve/discard panel (`--sp-control` buttons, the primary action - Save - accent-filled), so the editor's chrome reads as one family with the rest of the panel rather than a bolted-on tool. Holds **Add node**, **Add edge**, **Delete selected**, **Undo**, **Save**, and a status message span; hidden entirely until Edit mode is switched on.
- **Selection styling**: a selected node/edge gets a `.selected` class - `stroke: var(--sp-accent)` at a heavier `stroke-width` (3 for nodes, 2.5 for edges) - the same accent used for the active view-toggle/category-tab buttons, so "selected" reads consistently with every other active/current state in the panel. Applied only while Edit mode is on; a background click clears it.
- **Side form** (`#edit-form`): a right-side panel (not a fixed corner box like `#hint`/`#ghost-panel`, since it holds several rows and can grow tall with locales) for the selected node/edge's fields, or a brand-new one. Rows (`.edit-form-row`) stack a `--sp-text-2` label over a `--sp-control` input/select; a `LocalizedString` field repeats one row per locale with a small "add/remove locale" control (`.edit-form-add-locale` / `-remove-locale`); a linked-spec picker filters a `--sp-control` list by typed text. Field errors are inline, small, `--sp-error-text` (`.edit-form-field-error`) - the same error token every other inline validation message in the extension uses, never a new one.
- **Editable vs committed/ghost states**: three visually distinct node/edge states now coexist on one canvas - a normal committed node/edge (solid stroke, opaque), a Track B **pending/ghost** one (dashed stroke, reduced opacity, italic edge label - unchanged from B3), and, while Edit mode is on, a **selected/editable** one (`.selected`'s accent stroke, described above). An imported/auto-captured transition stays visually a normal committed edge even when Edit mode is on (its selection still opens the side form, but read-only) - editability is a form-level concern (whether the fields accept input), not a separate canvas style, so the graph itself never needs a fourth visual state to distinguish "editable" from "not".

## Single source of truth: tokens

`design-tokens.json` holds shared `brand`/`font`/`radius` plus `themes.light` and
`themes.dark` color blocks. Each theme also carries `gradTop`/`gradBottom` (the
radial backdrop gradient) and `accentGlow` (the CTA glow), so the gradient and
glow switch with the theme. The gradient lives on each surface's primary frame
fill (colors reference `$grad-top`/`$grad-bottom`); the glow is an outer shadow
on the primary CTA (`color: $accent-glow`). `token-bindings.json` maps each file's local variable
names to token paths (name-based, stable). Pencil has no cross-file variable
linking, so `sync-tokens.mjs` is the one place that propagates tokens to all four
files.

Change the palette or fonts everywhere:

```bash
cd apps/extension/designs
# 1. edit values in design-tokens.json (e.g. brand.base, themes.dark.bg, font.ui)
node sync-tokens.mjs   # rewrite each .pen's variables (theme colors -> per-theme arrays)
./render.sh            # re-export 8 PNGs + rebuild overview.png
```

## Tokens in the shipped UI

`design-tokens.json` is also the SSOT for the live extension UI.
`sync-css-tokens.mjs` generates `src/shared/tokens.gen.css` (do not hand-edit;
the `.gen.css` name keeps it out of Biome). The file contains FOUR selector blocks:
`:root` (shared tokens + light baseline), `:root[data-theme="dark"]` (forced dark),
`:root[data-theme="light"]` (forced light), and `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]):not([data-theme="dark"]) { ... } }`
(system default, applies only when no explicit override). The user can force a theme
(System / Light / Dark) via the Options page; the choice persists in `specpin:theme`
and `data-theme` is set on the document root (pages) or shadow host (renderers).
"System" means the `data-theme` attribute is absent and the media query controls theming.

```bash
pnpm --filter @specpin/extension sync-css-tokens   # regenerate tokens.gen.css
```

Two consumers, one generated file:

- **Popup + options pages** import `tokens.gen.css` directly (Vite injects it);
  `:root` matches the document, so vars resolve normally. The full-page **graph view**
  (`entrypoints/graph/`, flows/screens diagram) follows the same pattern - it is an
  extension-owned page like popup/options, not a Shadow DOM overlay on a host page - and
  introduces no new tokens, referencing only existing `--sp-*` vars (`--sp-bg`, `--sp-surface`,
  `--sp-border`, `--sp-control`, `--sp-accent`, `--sp-accent-on`, `--sp-text`/`--sp-text-2`,
  `--sp-elevated`, `--sp-radius-control`, `--sp-font-ui`/`--sp-font-mono`).
- **Shadow DOM renderers** (sidebar, tooltip, capture form) cannot inherit the
  page's `:root` vars: `:host { all: initial }` isolates them, and `:root` does
  not match inside a shadow tree. So `src/shared/tokens.ts` imports
  `tokens.gen.css?inline` and rewrites all four `:root...` selector forms (including
  the attribute selector `:root[data-theme="..."]` and the `:not()` forms inside
  the media query) to their `:host(...)` equivalents; each renderer prepends
  that string to its `STYLES`. Custom properties are not reset by `all`, so the
  vars survive the isolation reset.

All five surfaces reference `--sp-*` vars only (no hardcoded palette literals).
The Inter UI face is bundled as a latin variable woff2 (`public/fonts/`): extension
pages load it via `@font-face` in `shared/inter-font.css`, and the content script
registers the same face on the host document (`shared/inter-font.ts`) so the
shadow-DOM renderers pick it up too, falling back to system-ui where a host CSP
blocks the font. JetBrains Mono is still referenced via its fallback stack, not
bundled yet (see `project-roadmap.md`).

`render.sh` uses `pencil interactive` headless (deterministic, no AI agent): for
each surface it pins the primary frame's `theme` to light then dark and exports
each.

## Scripts

| Script | Role |
|--------|------|
| `sync-tokens.mjs` | Apply tokens to the 4 `.pen` files. `--rebind` rebuilds `token-bindings.json` after structural edits or adding a variable. |
| `render.sh` | Export light+dark PNGs per surface and build `overview.png`. |

The 4 `.pen` files are the authoritative, hand-editable sources. After any
structural edit (new variable, new node bound to a token), run
`node sync-tokens.mjs --rebind` once, then the normal `sync-tokens.mjs` +
`render.sh`.

## Extension icon

The toolbar/store icon lives in `apps/extension/designs/`: `specpin-icon.pen`
(Pencil source), `specpin-icon.png` (2x raster), and `specpin-icon.svg` (the
scalable vector used for shipping). Pencil exports raster + PDF + HTML but not
SVG, so the `.svg` is a hand-built reconstruction of the `.pen` design, verified
by rendering back to PNG.

Meaning (each element maps to what Specpin does):

- **White map pin** - the literal `Spec` + `pin` of the name. Specpin pins a
  business spec onto a specific element of a running UI; a location pin is the
  "mark this exact spot" metaphor.
- **Targeting reticle (four corner brackets) in the pin head** - locking onto /
  framing one UI element before attaching its spec. Mirrors the
  `fingerprint-core` capture + match step that locks a spec to one element.
- **Teal `#2DD4BF` on a rounded-square (squircle) backdrop** - the brand color
  from `design-tokens.json`, keeping the icon consistent with popup/sidebar/
  tooltip. White-on-teal stays legible down to 16x16. The teal disc behind the
  reticle is the background showing through a cutout in the white pin, so the
  whole mark uses only two colors.

Read together: "aim at a UI element and pin its spec onto it" - Specpin as a
knowledge layer over an existing interface, not a code generator.

Regenerate the standard icon sizes from the SVG into `public/icon/`, where WXT
auto-detects them into the manifest (`icons` + the toolbar action icon, wired in
`wxt.config.ts`). The popup and options headers reuse `icon/128.png` directly, so
this one step keeps every surface in sync:

```bash
cd apps/extension
for s in 16 32 48 128; do rsvg-convert -w $s -h $s designs/specpin-icon.svg -o public/icon/$s.png; done
```

## Conventions

- `.pen` schema version is pinned to `2.13` (the version the headless reader
  accepts). The Pencil agent sometimes stamps `2.14` + a cloud `fileToken`
  nondeterministically; `render.sh` normalizes both back to local 2.13.
- Do not run multiple `pencil` processes in parallel: they share one IPC socket
  and one auth session and will collide. `render.sh` runs sequentially.
- Adding a new design variable: name it to match an entry in `sync-tokens.mjs`'s
  `NAME_MAP` (e.g. `bg-surface`, `text-muted`, `success-bg`) so it binds and
  themes automatically. Names outside the map stay scalar (e.g. the modal
  `overlay-bg` scrim, which is intentionally theme-agnostic).
- The capture form's **language tabs** (`.lang-tab`) and **Markdown toolbar**
  (`.md-btn`) reuse the existing control tokens (`--sp-elevated`, `--sp-border`,
  `--sp-accent`, `--sp-accent-glow`); the active tab uses the accent fill. No new
  tokens were introduced, so they theme automatically with everything else.
- The Options page **Spec source switch** (`.seg` / `.seg-btn`) is a full-width
  WAI-ARIA tablist over `--sp-control` (track) with `--sp-surface` for the active
  tab. It must reset the page's global `button` styles (width, margin, accent
  fill and glow), which would otherwise leak into the tab buttons; it adds no new
  tokens, so it themes automatically.
