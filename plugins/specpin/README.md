# specpin plugin

The `specpin` plugin, published through this repo's marketplace
(`.claude-plugin/marketplace.json` at the repo root).

```
/plugin marketplace add lamngockhuong/specpin
/plugin install specpin@lamngockhuong
```

## Layout

```
plugins/specpin/
├── .claude-plugin/plugin.json    # Claude Code manifest
├── .codex-plugin/plugin.json     # Codex manifest (skills-only, unverified)
└── skills/
    ├── specpin/                  # GENERATED - do not edit
    └── number-ui-image/          # edit here
```

## `skills/specpin/` is generated

Do **not** edit anything under `skills/specpin/`. It is a checked-in copy of the
canonical skill at `apps/cli/skill/`, written by
`apps/cli/npm/scripts/sync-skill.mjs`.

Edit the canonical source, then re-sync:

```bash
cd apps/cli/npm
node scripts/sync-skill.mjs          # refresh every copy
node scripts/sync-skill.mjs --check  # what CI runs; names the drifting target
```

The same script also maintains `apps/cli/npm/skill/` (the npm tarball copy). CI
runs `--check`, so a hand-edit here fails the build rather than silently rotting.

`skills/number-ui-image/` is the opposite: this directory is its home, edit it
directly.

## Versioning

The plugin version lives in **both** manifests and is bumped by hand — keep
`.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` on the same number.
It is independent of the `@specpin/cli` npm version.
