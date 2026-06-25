# Extension UI Design System

Visual mockups for the browser extension's user-facing surfaces, plus the single
source of truth for their colors and fonts. Source files live in
`apps/extension/designs/`. They are design references, not shipped code: the
extension UI is built in `apps/extension/src` (plain HTML/CSS + Shadow DOM).

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
