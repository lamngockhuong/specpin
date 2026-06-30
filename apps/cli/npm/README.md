# @specpin/cli

The Specpin sidecar CLI, distributed via npm. Installing this package downloads
the prebuilt Go binary matching your OS and CPU from the matching GitHub Release
and exposes it as the `specpin` command.

Specpin pins business specifications onto the elements of a running web UI. The
sidecar serves your repo's `.specs/` over localhost so the Specpin browser
extension can match and render them. See the
[project README](https://github.com/lamngockhuong/specpin).

## Install

Global:

```bash
npm install -g @specpin/cli
# or
pnpm add -g @specpin/cli
```

One-off, no install:

```bash
npx @specpin/cli serve
```

## Usage

```bash
specpin init      # scaffold .specs/ in the current repo
specpin serve     # serve .specs/ over localhost (prints the bearer token)
specpin validate  # lint the spec corpus (CI-friendly)
specpin --help
```

## Author specs with a coding agent

This package bundles a portable skill that teaches a coding agent (Claude Code,
Cursor, etc.) to author schema-valid specs and drive the CLI. The CLI adds no
LLM; the host agent is the author. It ships in the tarball and is reachable
without installing:

```
https://unpkg.com/@specpin/cli@latest/skill/SKILL.md
```

Point your agent at that URL (or the installed `skill/SKILL.md`), then it writes
`.specs/` and runs `specpin validate`. See
[`docs/ai-authoring.md`](https://github.com/lamngockhuong/specpin/blob/main/docs/ai-authoring.md).

## How it works

- The npm package version matches the CLI release version. Postinstall fetches
  `specpin-<os>-<arch>` from `cli-v<version>` on GitHub Releases and verifies its
  SHA-256 against the published `checksums.txt`.
- If postinstall is skipped (`--ignore-scripts`) or offline, the binary is
  fetched and verified the first time you run `specpin`.

### Supported platforms

| OS      | Architectures  |
| ------- | -------------- |
| Linux   | amd64, arm64   |
| macOS   | amd64, arm64   |
| Windows | amd64          |

On other platforms, build from source: see
[`apps/cli`](https://github.com/lamngockhuong/specpin/tree/main/apps/cli).
