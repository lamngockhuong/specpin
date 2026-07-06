<!--
Thanks for contributing to Specpin. Keep the description focused on what
changed and why. Delete sections that do not apply.
-->

## What & why

<!-- What does this PR change, and what problem does it solve? -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Docs
- [ ] Refactor / internal (no user-visible change)
- [ ] Schema change (`packages/spec-schema/schema/v1.json`)

## Checklist

Run the same gates CI runs (see `.github/CONTRIBUTING.md`):

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm schema-validate`
- [ ] Go sidecar (if `apps/cli` touched): `make check-schema && go vet ./... && go test ./...`
- [ ] Conventional commit title (`feat:`, `fix:`, `docs:`, ...), no AI attribution
- [ ] Docs updated if user-visible behavior, commands, or architecture changed (incl. `docs/vi/` and website `vi`/`ja` mirrors)
- [ ] Schema edits regenerated (`pnpm --filter @specpin/spec-schema gen`, `make sync-schema`); no hand-edited `*.gen.*` or embedded `apps/cli/internal/schema/v1.json`

## Notes for reviewers

<!-- Anything that needs extra attention: trade-offs, follow-ups, screenshots. -->
