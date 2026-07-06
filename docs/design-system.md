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

Two reusable patterns overlay the page's own content:

- **Spec badge**: A blue or amber "S" (or number) circle, 16px, positioned to avoid overlapping content. Marks an element with a spec. Rendered in a Shadow DOM host, positioned by the badge-position solver, respects reduced-motion.
- **Ghost marker**: A dashed circular outline with a centered "+" icon, 16-20px depending on content fit. Marks an undocumented interactive element (coverage mode). Also rendered in a Shadow DOM host, positioned by the same badge-position solver, respects reduced-motion. Visually distinct from the spec badge with a dashed border instead of solid. Its palette is deliberately theme-independent (a light chip: slate dashed ring, muted "+", soft shadow) rather than following the extension UI theme, because it overlays the host page's own background: a dark-theme marker would paint a near-black blob on a light page.

Rendered PNGs: `<surface>.light.png` and `<surface>.dark.png`. `overview.png` is
a 2x4 montage (columns = light | dark). The tooltip renderer
(`src/renderers/tooltip.ts`) has no mockup yet.

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
  `:root` matches the document, so vars resolve normally.
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
