import type { ErrorObject, ValidateFunction } from "ajv";
// Precompiled standalone validators (no runtime `new Function`); see
// scripts/gen-types.ts. Compiling at runtime breaks in content scripts whose
// host page CSP forbids `unsafe-eval`.
import {
  validateGuides as guidesValidator,
  validateManifest as manifestValidator,
  validateRequired as requiredValidator,
  validateSpecFile as specFileValidator,
  validateSpec as specValidator,
  validateViews as viewsValidator,
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

/** Validate a .specs/views.json team-default visibility config. */
export function validateViews(data: unknown): ValidationResult {
  return run(viewsValidator, data);
}

/** Validate a .specs/guides.json named-guides config. */
export function validateGuides(data: unknown): ValidationResult {
  return run(guidesValidator, data);
}

/** Validate a .specs/required.json governance config. */
export function validateRequired(data: unknown): ValidationResult {
  return run(requiredValidator, data);
}

/** Human-readable one-line summary of validation errors (e.g. for HTTP 400 bodies). */
export function formatErrors(errors: ErrorObject[]): string {
  return errors
    .map((e) => `${e.instancePath || "(root)"} ${e.message ?? "is invalid"}`.trim())
    .join("; ");
}

export type { ErrorObject };
