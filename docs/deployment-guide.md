# Deployment Guide

How the project's deployable artifacts ship. Today this covers the public
website; the extension and CLI are built locally (see `run-guide.md`).

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
