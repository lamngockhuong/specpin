// import.config.json loader: read + parse + structurally validate + resolve
// paths. This is the only module in the package that touches disk for
// config loading; `validate-import-config.ts` and `resolve-config-paths.ts`
// stay pure so they are directly unit-testable.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LoadImportConfigResult } from "./config-types.js";
import { resolveConfigPaths } from "./resolve-config-paths.js";
import { validateImportConfig } from "./validate-import-config.js";

export type {
  FlowImportEntry,
  ImportAdapter,
  ImportConfig,
  LoadImportConfigResult,
  ScreenImportEntry,
  ValidateImportConfigResult,
} from "./config-types.js";
export { validateImportConfig } from "./validate-import-config.js";

/** Read, parse, structurally validate, and resolve `import.config.json`.
 * Defaults `configPath` to `<repoRoot>/.specs/import.config.json`. Never
 * throws — all expected failure modes (missing file, bad JSON, invalid
 * shape, path traversal) come back as `{ ok: false, errors }`. */
export async function loadImportConfig(
  repoRoot: string,
  configPath?: string,
): Promise<LoadImportConfigResult> {
  const resolvedConfigPath = configPath ?? path.join(repoRoot, ".specs", "import.config.json");

  let text: string;
  try {
    text = await readFile(resolvedConfigPath, "utf8");
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      errors: [`Config file not found or unreadable: ${resolvedConfigPath} (${reason})`],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { ok: false, errors: [`Invalid JSON in ${resolvedConfigPath}: ${reason}`] };
  }

  const validated = validateImportConfig(parsed);
  if (!validated.ok) return validated;

  return resolveConfigPaths(repoRoot, validated.config);
}
