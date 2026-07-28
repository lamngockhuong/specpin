# @specpin/e2e

Real-browser end-to-end suite: a built Chrome MV3 extension, a sidecar compiled from
HEAD, and the demo app — the three-process loop from `docs/run-guide.md`, automated.

> Phase 07 of the plan replaces most of this file with `docs/e2e-testing.md` and trims
> it to a pointer. Until then, this is the contributor guide.

## Run it

```bash
pnpm test:e2e                       # every scenario (the `full` project)
pnpm test:e2e:smoke                 # the PR tier only
pnpm --filter @specpin/e2e exec playwright test --workers=2   # exercise port isolation
pnpm --filter @specpin/e2e exec playwright test -g "health"   # one scenario by name
```

First run only:

```bash
pnpm --filter @specpin/e2e exec playwright install chromium
```

## What happens on a run

`globalSetup` builds only what is stale and says which of the three ran, so a slow run
explains itself:

| Artifact | Built from | Probe |
|---|---|---|
| `apps/extension/.output/chrome-mv3` | `pnpm --filter @specpin/extension build` | `manifest.json` |
| `apps/cli/bin/specpin[.exe]` | `go build` | the binary |
| `examples/demo-react-app/dist` | `pnpm --filter @specpin/demo-react-app build` | `index.html` |

Then, per Playwright worker:

- a temp copy of `examples/demo-react-app/.specs/` — tests write specs, and the repo
  corpus must stay clean;
- a sidecar on a per-worker port with a **pinned** token, so nothing parses it out of
  stdout;
- one `vite preview` (worker-scoped: it is read-only, so tests share it);
- a persistent Chrome context with the unpacked extension loaded.

## Things worth knowing before you add a scenario

**Never sleep.** There is no `waitForTimeout` in this suite and no sleep helper to
reach for. Use `waitFor` from `fixtures/wait-for.ts`: every wait carries a deadline and
a named subject. Bug #209 (a graph panel blank for up to 10s against an unreachable
sidecar) is exactly the failure class a sleep-based assertion hides.

**Seed storage, don't drive the UI.** Connection state is flat `specpin:*` keys in
`storage.local`, so `seedConnection()` replaces a minute of form-filling. Drive a UI
only when that UI *is* the thing under test.

**`manifest.domains` is rewritten per worker.** The committed corpus pins ports
3000/3001; a worker's preview server runs elsewhere. `createSpecsCorpus` rewrites
`domains` to the actual port — without it every spec silently matches nothing.

**Shadow roots need no tricks.** The renderers use `attachShadow({ mode: "open" })`, so
ordinary locators (`page.getByText(...)`) pierce straight into tooltip/sidebar/modal.

**`retries: 0`, locally and in CI.** A retry-green suite teaches nothing. Flake gets
fixed in the harness; it never gets absorbed here.

**Assert on disk for write flows.** A green UI over a file that was never written is
precisely the bug worth catching, so write scenarios check the temp `.specs/` too — and
validate the result against `@specpin/spec-schema`, not a hand-rolled shape check.

## Stragglers

Fixtures tear down in `finally`, and on Windows they `taskkill /T /F` the whole tree (a
shell-launched child would otherwise orphan the real server and keep its port). `/F` is
required, not defensive: a graceful `taskkill` asks via a window message that console
programs never answer, so it fails 100% of the time against the Go sidecar and Node —
and trying it first merely burned the exit timeout on every teardown. If a run is killed
hard anyway, sweep leftovers:

```bash
# Windows
Get-Process specpin,node -ErrorAction SilentlyContinue | Stop-Process -Force
# POSIX
pkill -f 'bin/specpin serve' ; pkill -f 'vite preview'
```

Temp corpora live under the OS temp dir (`specpin-e2e-specs-*`) and are removed on
teardown; the OS reaps anything a crash leaves behind.

## Layout

```
e2e/
├── setup/
│   ├── paths.ts           # every path + the test-only tokens
│   ├── build-guards.ts    # mtime staleness per artifact
│   ├── global-setup.ts    # schema-drift check + the guarded builds
│   └── run-command.ts     # spawn helper (Windows shell quoting)
├── fixtures/
│   ├── extension.ts        # the extended `test`: context, extensionId, serviceWorker
│   ├── managed-process.ts  # spawn + readiness + teardown, shared by both servers
│   ├── sidecar.ts          # sidecar specifics (temp corpus, /health probe)
│   ├── demo-app.ts         # vite preview specifics
│   ├── specs-corpus.ts     # temp .specs/ copy + domains rewrite
│   ├── seed-config.ts      # storage seeding/reset helpers
│   ├── wait-for.ts         # the only sanctioned wait
│   ├── kill-tree.ts        # Windows-safe process teardown
│   └── ports.ts            # per-worker port allocation
└── specs/
    ├── harness.spec.ts    # proof of life
    └── smoke/             # the PR tier
```

Note the harness never runs `make build`: `make` is absent from a default Windows dev
machine, so `global-setup` calls `go build` directly. The Makefile's other step,
`sync-schema`, is *verified* rather than performed — a harness that rewrote a tracked
file to fix a drift would break the zero-repo-mutation guarantee and quietly disarm
`make check-schema`. A real drift fails the run with instructions instead.
