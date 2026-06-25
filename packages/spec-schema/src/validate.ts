import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { schemaV1 as schema } from "./schema.gen.js";

export interface ValidationResult {
  valid: boolean;
  errors: ErrorObject[];
}

const SCHEMA_ID = "https://specpin.dev/schema/v1.json";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(schema as object);

function getOrThrow(ref: string): ValidateFunction {
  const fn = ajv.getSchema(ref);
  if (!fn) throw new Error(`spec-schema: could not resolve validator for ${ref}`);
  return fn as ValidateFunction;
}

// Root schema validates a whole <area>.spec.json file (SpecFile).
const specFileValidator = getOrThrow(SCHEMA_ID);
const specValidator = getOrThrow(`${SCHEMA_ID}#/$defs/Spec`);
const manifestValidator = getOrThrow(`${SCHEMA_ID}#/$defs/Manifest`);

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
