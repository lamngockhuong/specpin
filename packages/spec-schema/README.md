# @specpin/spec-schema

The JSON Schema (v1) for [Specpin](https://specpin.ohnice.app) spec files
(`.specs/*.spec.json`), plus generated TypeScript types and runtime
[ajv](https://ajv.js.org) validators.

`schema/v1.json` is the single source of truth. The Specpin Go CLI embeds the
same file and CI cross-validates both implementations, so the TS and Go
validators never diverge.

## Install

```bash
pnpm add @specpin/spec-schema
# or: npm i @specpin/spec-schema
```

## Editor autocomplete (no install needed)

Specpin spec files reference the hosted schema via `$schema`, which
`specpin init` writes for you:

```json
{
  "$schema": "https://specpin.ohnice.app/schema/v1.json",
  "group": "Deals",
  "specs": []
}
```

Any editor that honors `$schema` (VS Code, JetBrains) then gives you
autocomplete and validation while authoring.

## Programmatic use

```ts
import { validateSpecFile, formatErrors, type SpecFile } from "@specpin/spec-schema";

const result = validateSpecFile(data);
if (!result.valid) {
  console.error(formatErrors(result.errors));
}
```

Also exported: `validateSpec`, `validateManifest`, `validateViews`,
`validateGuides`, `resolveLocalized`, the parsed `schemaV1` document, the
`SCHEMA_V1_ID` constant, and the full type set (`SpecFile`, `Spec`, `Manifest`,
`GuidesConfig`, `ViewsConfig`, ...).

## Raw schema over a CDN

The schema ships in the package, so you can also fetch it from a CDN without the
hosted URL:

```
https://unpkg.com/@specpin/spec-schema/schema/v1.json
https://cdn.jsdelivr.net/npm/@specpin/spec-schema/schema/v1.json
```

## License

Apache-2.0
