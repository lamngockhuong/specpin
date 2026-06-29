# Deployment Guide

How the project's deployable artifacts ship: the public website (GitHub Pages),
versioned releases of the extension and CLI (GitHub Releases), and the
`@specpin/spec-schema` package (npm). For building any component locally, see
`run-guide.md`.

## Website (`apps/web`) to GitHub Pages

The marketing landing + end-user docs site (`apps/web`, Astro Starlight) deploys
to `https://specpin.ohnice.app` via GitHub Pages.

### How it deploys

`.github/workflows/web-deploy.yml` builds and deploys on every push to `main`
that touches `apps/web/**`, `packages/spec-schema/schema/**`, or the workflow
file, plus manual `workflow_dispatch` runs. It uses the official Pages actions
(`configure-pages`, `upload-pages-artifact`, `deploy-pages`), so there is no
`gh-pages` branch and no secret beyond the built-in `GITHUB_TOKEN`.

The site also serves the schema at `https://specpin.ohnice.app/schema/v1.json`
(the value of every spec file's `$id`/`$schema`): `apps/web/scripts/sync-schema.mjs`
copies the SSOT (`packages/spec-schema/schema/v1.json`) into `public/schema/` at
build time (the copy is gitignored, never hand-edited). The `paths:` filter above
includes the schema so a schema-only change redeploys the hosted copy.

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

## Releases (extension, CLI, spec-schema)

Three components release independently, each with its own version, tag, and
CHANGELOG. The extension (`apps/extension`) and Go sidecar CLI (`apps/cli`) attach
artifacts to GitHub Releases (no Chrome Web Store / Firefox AMO auto-submission);
`@specpin/spec-schema` (`packages/spec-schema`) publishes to npm.

### Versioning model

`release-please` (config `release-please-config.json`, state
`.release-please-manifest.json`) tracks three components:

- `extension` -> tags `extension-vX.Y.Z`; bumps `apps/extension/package.json`
  (WXT reads it for the manifest version).
- `cli` -> tags `cli-vX.Y.Z`; bumps the `Version` literal in `apps/cli/cmd/root.go`
  (the `x-release-please-version` marker line).
- `spec-schema` -> tags `spec-schema-vX.Y.Z`; bumps
  `packages/spec-schema/package.json` and publishes to npm.

Versions advance from conventional-commit history. A commit scoped to one
component releases only that component. Pre-1.0, `feat:` bumps a patch
(`bump-patch-for-minor-pre-major`), so a deliberate first minor/major needs a
`Release-As:` footer.

### Normal flow (recommended)

1. Land conventional commits on `main` (`feat:`, `fix:`, `feat!:`/`BREAKING CHANGE`).
2. `.github/workflows/release-please.yml` opens (or updates) a release PR per
   component with the computed version + CHANGELOG.
3. Merge the release PR. release-please creates the tag, then calls the matching
   reusable workflow: extension/CLI build assets onto a GitHub Release;
   spec-schema publishes to npm.

### Build + asset workflows

- `.github/workflows/release-extension.yml`: builds workspace deps, runs
  `wxt zip` + `wxt zip -b firefox`, attaches `specpin-<v>-chrome.zip`,
  `specpin-<v>-firefox.zip`, and `checksums.txt`.
- `.github/workflows/release-cli.yml`: cross-compiles 5 static targets (linux
  amd64/arm64, darwin amd64/arm64, windows amd64) with the version stamped via
  `-ldflags -X specpin/cmd.Version`, attaches the binaries + `checksums.txt`.
  It runs `make sync-schema` before building so the embedded schema is current.
- `.github/workflows/release-spec-schema.yml`: builds the package and runs
  `npm publish`. Auth is **OIDC trusted publishing** (no `NPM_TOKEN`): the job has
  `id-token: write`, npm exchanges the GitHub OIDC token for a short-lived publish
  token and generates provenance automatically. Requires the package's Trusted
  Publisher to be configured on npmjs.com (org `lamngockhuong`, repo `specpin`,
  workflow `release-spec-schema.yml`). npm is upgraded to >= 11.5.1 first
  (trusted publishing requires it).

> Bootstrap note: the package's first version (`0.0.2`) was published manually
> (`npm publish`, no provenance) because a Trusted Publisher can only be configured
> on an existing package. Every release after that goes through OIDC.

### Manual / fallback triggers

Both reusable workflows also accept:

- `workflow_dispatch` (Actions tab -> Run workflow): provide `version`, optional
  `dry_run=true`. For extension/CLI this builds assets without a Release or tag;
  for spec-schema it runs `npm publish --dry-run` (publishes nothing).
- a pushed tag (`extension-vX.Y.Z`, `cli-vX.Y.Z`, or `spec-schema-vX.Y.Z`):
  triggers the same build/publish path.

### Verify after a release

- The GitHub Release exists with the expected tag and all assets, and
  `checksums.txt` matches (`sha256sum -c checksums.txt`).
- A downloaded CLI binary reports the right version: `./specpin-... --version`.
- The chrome/firefox zips load as unpacked extensions and report the new version.
- For spec-schema: `npm view @specpin/spec-schema version` shows the new version,
  and the npm page lists a provenance attestation.
