# Deployment Guide

How the project's deployable artifacts ship: the public website (GitHub Pages),
and versioned releases of the extension and CLI (GitHub Releases). For building
either component locally, see `run-guide.md`.

## Website (`apps/web`) to GitHub Pages

The marketing landing + end-user docs site (`apps/web`, Astro Starlight) deploys
to `https://specpin.ohnice.app` via GitHub Pages.

### How it deploys

`.github/workflows/web-deploy.yml` builds and deploys on every push to `main`
that touches `apps/web/**` or the workflow file, plus manual `workflow_dispatch`
runs. It uses the official Pages actions (`configure-pages`,
`upload-pages-artifact`, `deploy-pages`), so there is no `gh-pages` branch and no
secret beyond the built-in `GITHUB_TOKEN`.

The site uses a custom domain, so it serves at the apex path: `astro.config.mjs`
sets `site: 'https://specpin.ohnice.app'` and `base: '/'`. `apps/web/public/CNAME`
(single line `specpin.ohnice.app`) is copied into `dist/` on every build, which
is what keeps GitHub Pages from dropping the custom domain across deploys.

### One-time manual setup

These steps are outside the repo and run once:

1. **DNS** (at the `ohnice.app` DNS provider): add a `CNAME` record
   `specpin` -> `lamngockhuong.github.io`. (`specpin.ohnice.app` is a subdomain,
   so a `CNAME` record is correct; an apex domain would need `A`/`ALIAS` records
   instead.)
2. **Repo settings** -> **Settings** -> **Pages**:
   - Source = **GitHub Actions**.
   - After the first successful deploy, set the custom domain to
     `specpin.ohnice.app` and enable **Enforce HTTPS**.

### First deploy

The `paths:` filter means the workflow only auto-runs when `apps/web/**` changes.
For the very first run (or any manual redeploy), trigger it from the Actions tab
via **Run workflow** (`workflow_dispatch`). The site is verifiable at the
`*.github.io` Pages URL before DNS propagates.

### Verify after deploy

- Landing (`/` and `/vi/`), a few docs pages, the language switcher, and search.
- `https://specpin.ohnice.app` resolves over HTTPS with the custom domain
  retained (CNAME preserved).
- OG card and favicon render (share-debugger or page-source inspection).

### Local preview (CI parity)

```bash
pnpm install --frozen-lockfile
pnpm --filter @specpin/web build     # static output in apps/web/dist
pnpm --filter @specpin/web preview    # serve the build locally
```

The build fails on broken internal links (via `starlight-links-validator`), so a
green build is the link-integrity gate.

## Extension + CLI releases (GitHub Releases)

The extension (`apps/extension`) and the Go sidecar CLI (`apps/cli`) are released
independently, each with its own version, tag, and CHANGELOG. Artifacts attach to
GitHub Releases; there is no Chrome Web Store / Firefox AMO auto-submission.

### Versioning model

`release-please` (config `release-please-config.json`, state
`.release-please-manifest.json`) tracks two components:

- `extension` -> tags `extension-vX.Y.Z`; bumps `apps/extension/package.json`
  (WXT reads it for the manifest version).
- `cli` -> tags `cli-vX.Y.Z`; bumps the `Version` literal in `apps/cli/cmd/root.go`
  (the `x-release-please-version` marker line).

Versions advance from conventional-commit history. A commit scoped to one
component releases only that component.

### Normal flow (recommended)

1. Land conventional commits on `main` (`feat:`, `fix:`, `feat!:`/`BREAKING CHANGE`).
2. `.github/workflows/release-please.yml` opens (or updates) a release PR per
   component with the computed version + CHANGELOG.
3. Merge the release PR. release-please creates the tag + GitHub Release, then
   calls the matching reusable workflow, which builds and attaches assets.

### Build + asset workflows

- `.github/workflows/release-extension.yml`: builds workspace deps, runs
  `wxt zip` + `wxt zip -b firefox`, attaches `specpin-<v>-chrome.zip`,
  `specpin-<v>-firefox.zip`, and `checksums.txt`.
- `.github/workflows/release-cli.yml`: cross-compiles 5 static targets (linux
  amd64/arm64, darwin amd64/arm64, windows amd64) with the version stamped via
  `-ldflags -X specpin/cmd.Version`, attaches the binaries + `checksums.txt`.
  It runs `make sync-schema` before building so the embedded schema is current.

### Manual / fallback triggers

Both reusable workflows also accept:

- `workflow_dispatch` (Actions tab -> Run workflow): provide `version`, optional
  `dry_run=true` to build assets without creating a Release or tag.
- a pushed tag (`extension-vX.Y.Z` or `cli-vX.Y.Z`): triggers the same build +
  Release path.

### Verify after a release

- The GitHub Release exists with the expected tag and all assets, and
  `checksums.txt` matches (`sha256sum -c checksums.txt`).
- A downloaded CLI binary reports the right version: `./specpin-... --version`.
- The chrome/firefox zips load as unpacked extensions and report the new version.
