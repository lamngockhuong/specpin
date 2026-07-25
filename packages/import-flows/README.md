# @specpin/import-flows

A per-repo devDependency CLI that imports `.specs/flows.json` and `.specs/screens.json` from your
own TypeScript source (FSM transition tables, route tables), driven by a committed
`.specs/import.config.json`. It is standalone build-time tooling — like `prisma generate` — with no
dependency on the Go sidecar (`@specpin/cli`) or the browser extension.

## Usage

```bash
pnpm add -D @specpin/import-flows typescript
```

```jsonc
// .specs/import.config.json
{
  "flows": [
    { "file": "src/order/fsm.ts", "export": "ORDER_STATUS_TRANSITIONS", "adapter": "fsm-table", "id": "order-status" }
  ],
  "screens": [
    { "file": "src/routes.tsx", "adapter": "react-router" }
  ]
}
```

```jsonc
// package.json
{ "scripts": { "specs:import": "specpin-import-flows" } }
```

```bash
pnpm specs:import              # run the import
pnpm specs:import --dry-run    # preview without writing
pnpm specs:import --check      # CI mode: fail if output would change
```

This package is at the config-loader stage: adapters and the merge writer land in follow-up
phases. See the graph-views code-import plan for the full roadmap and `docs/` (once published) for
authoring the `import.config.json` file in depth.
