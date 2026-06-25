import type { ErrorObject, ValidateFunction } from "ajv";
// Precompiled standalone validators (no runtime `new Function`); see
// scripts/gen-types.ts. Compiling at runtime breaks in content scripts whose
// host page CSP forbids `unsafe-eval`.
import {
  validateSpecFile as specFileValidator,
  validateSpec as specValidator,
  validateManifest as manifestValidator,
} from "./validators.gen.cjs";

export interface ValidationResult {
  valid: boolean;
  errors: ErrorObject[];
}

function run(validator: ValidateFunction, data: unknown): ValidationResult {
  const valid = validator(data) as boolean;
  return { valid, errors: valid ? [] : (validator.errors ?? []) };
}

/** Validate a single Spec object. */
export function validateSpec(data: unknown): ValidationResult {
  return run(specValidator, data);
}

/** Validate a manifest.json object. */
export function validateManifest(data: unknown): ValidationResult {
  return run(manifestValidator, data);
}

/** Validate a whole <area>.spec.json file ({ group, specs[] }). */
export function validateSpecFile(data: unknown): ValidationResult {
  return run(specFileValidator, data);
}

/** Human-readable one-line summary of validation errors (e.g. for HTTP 400 bodies). */
export function formatErrors(errors: ErrorObject[]): string {
  return errors
    .map((e) => `${e.instancePath || "(root)"} ${e.message ?? "is invalid"}`.trim())
    .join("; ");
}

export type { ErrorObject };
