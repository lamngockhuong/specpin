// Pure structural guard over a JSON.parse'd import.config.json. No fs, no
// path resolution — safe to unit test directly.

import {
  type FlowImportEntry,
  IMPORT_ADAPTERS,
  type ImportAdapter,
  type ImportConfig,
  type ScreenImportEntry,
  type ValidateImportConfigResult,
} from "./config-types.js";

/** Keys that signify a prototype-pollution attempt via JSON.parse. Mirrors
 * `apps/extension/src/sources/local-bundle.ts` DANGEROUS_KEYS. */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function hasDangerousKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasDangerousKey);
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (DANGEROUS_KEYS.has(key)) return true;
      if (hasDangerousKey((value as Record<string, unknown>)[key])) return true;
    }
  }
  return false;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function adapterError(section: string, index: number, adapter: unknown): string {
  const allowed = IMPORT_ADAPTERS.map((a) => `"${a}"`).join(", ");
  return `${section}[${index}].adapter: must be one of ${allowed} (got ${JSON.stringify(adapter)})`;
}

function validateFlowEntry(raw: unknown, index: number, errors: string[]): void {
  if (raw === null || typeof raw !== "object") {
    errors.push(`flows[${index}]: must be an object`);
    return;
  }
  const entry = raw as Record<string, unknown>;
  if (!isNonEmptyString(entry.file)) {
    errors.push(`flows[${index}].file: required non-empty string`);
  }
  if (!isNonEmptyString(entry.export)) {
    errors.push(`flows[${index}].export: required non-empty string`);
  }
  if (!isNonEmptyString(entry.id)) {
    errors.push(`flows[${index}].id: required non-empty string`);
  }
  if (!IMPORT_ADAPTERS.includes(entry.adapter as ImportAdapter)) {
    errors.push(adapterError("flows", index, entry.adapter));
  }
}

function validateScreenEntry(raw: unknown, index: number, errors: string[]): void {
  if (raw === null || typeof raw !== "object") {
    errors.push(`screens[${index}]: must be an object`);
    return;
  }
  const entry = raw as Record<string, unknown>;
  if (!isNonEmptyString(entry.file)) {
    errors.push(`screens[${index}].file: required non-empty string`);
  }
  if (entry.export !== undefined && !isNonEmptyString(entry.export)) {
    errors.push(`screens[${index}].export: if present, must be a non-empty string`);
  }
  if (!IMPORT_ADAPTERS.includes(entry.adapter as ImportAdapter)) {
    errors.push(adapterError("screens", index, entry.adapter));
  }
}

export function validateImportConfig(raw: unknown): ValidateImportConfigResult {
  const errors: string[] = [];

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["import.config.json: root must be a JSON object"] };
  }
  if (hasDangerousKey(raw)) {
    return {
      ok: false,
      errors: ["import.config.json: contains a disallowed key (__proto__, constructor, prototype)"],
    };
  }

  const root = raw as Record<string, unknown>;
  const rawFlows = root.flows ?? [];
  const rawScreens = root.screens ?? [];

  if (!Array.isArray(rawFlows)) {
    errors.push("flows: must be an array");
  } else {
    rawFlows.forEach((entry, i) => {
      validateFlowEntry(entry, i, errors);
    });
  }

  if (!Array.isArray(rawScreens)) {
    errors.push("screens: must be an array");
  } else {
    rawScreens.forEach((entry, i) => {
      validateScreenEntry(entry, i, errors);
    });
  }

  if (root.$schema !== undefined && typeof root.$schema !== "string") {
    errors.push("$schema: if present, must be a string");
  }

  if (errors.length > 0) return { ok: false, errors };

  const config: ImportConfig = {
    flows: rawFlows as FlowImportEntry[],
    screens: rawScreens as ScreenImportEntry[],
  };
  if (typeof root.$schema === "string") config.$schema = root.$schema;

  return { ok: true, config };
}
