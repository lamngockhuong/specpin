# CLI commands

Run `specpin <command>` (or `npx @specpin/cli <command>`). No auth or keys.

## init

Scaffold `.specs/manifest.json` in the current directory.

```bash
specpin init --project "Acme CRM" --domains localhost:3000
```

- `--project` (required): manifest `project` name.
- `--domains` (optional): comma-separated origins, e.g. `localhost:3000,app.acme.io`.
- Writes a manifest with `$schema`, `version: "1.0"`, empty `specFiles`, and
  default `settings` (`defaultLocale: en`, `matchConfidenceThreshold: 0.6`,
  `defaultDisplayMode: tooltip`).
- Refuses to overwrite an existing `.specs/manifest.json` (exits with an error).

## serve

Serve `.specs/` over a hardened localhost HTTP API with SSE live-reload.

```bash
specpin serve              # auto-pick a free port
specpin serve --port 4317  # pin a port
specpin serve --dir path/to/.specs
```

- `--port` (default 0 = auto-pick), `--dir` (default `.specs`).
- Prints the project name, dir, URL (`http://127.0.0.1:<port>`), and a bearer
  token. Paste URL + token into the extension Options page.
- Binds `127.0.0.1` only; fails early if `manifest.json` is missing (usually
  `--dir` pointed at the repo root instead of `.specs/`). Ctrl+C to stop.

## validate

Validate the corpus against the embedded schema, offline. CI-friendly.

```bash
specpin validate                 # checks ./.specs
specpin validate --dir path/to/.specs
specpin validate --repo-root .   # root that verifiedBy paths resolve against
specpin validate --strict-manifest
```

- `--dir` (default `.specs`), `--strict-manifest` (turn drift warnings into failures).
- `--repo-root` (default: the parent of `--dir`): the root each `verifiedBy` path
  is resolved against. Set it when `.specs/` is not at `<repo>/.specs` (e.g.
  `./config/specs`).
- **`verifiedBy` existence check (on by default):** after schema validation, each
  spec's `verifiedBy` path must exist inside the repo root — a broken-link guard,
  NOT a test run. Absolute paths, `..`-escapes, and symlinks leaving the repo are
  rejected. A missing path fails (exit 1) naming the spec id + path. When there is
  no readable working tree (e.g. a piped bundle) the check is skipped with a note.
- Output: `OK <file>` or `FAIL <file>` plus indented errors per file, then
  `N files checked, M error(s)`. Manifest/disk drift prints `warning:` lines
  (or `FAIL:` under `--strict-manifest`).
- Exit codes:
  - `0`: all valid.
  - `1`: schema violations, an unreadable/symlinked spec file, or a missing/escaping
    `verifiedBy` path (author fixes).
  - `2`: could not run (missing `.specs/`, no `manifest.json`, internal error).

## bundle

Assemble `.specs/` into a Manual-import bundle for the extension (no sidecar).

```bash
specpin bundle               # prints JSON to stdout
specpin bundle --out out.json
```

- `--dir` (default `.specs`), `--out` (write to a file instead of stdout).
- Emits `{ "manifest": {...}, "files": { "<name>.spec.json": {...} } }`, pretty
  printed. Paste into the extension's Manual specs import.
- Does NOT validate. Run `specpin validate` separately for schema checks.

## generate

Deferred stub. AI-assisted generation is driven by your coding agent through
this skill, not by the CLI. `specpin generate` prints a pointer to the skill and
does nothing else. Do not rely on it to produce specs.
