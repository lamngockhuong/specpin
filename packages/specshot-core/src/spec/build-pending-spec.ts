/**
 * Build a PENDING Spec (no `fingerprint`) from author-entered content: a
 * localized title/description, optional localized businessRules, and an id.
 * A pending spec omits `fingerprint` entirely — absent ⇒ pending/unpinned,
 * per the spec-schema contract (see docs/specshot-integration.md). The
 * result is validated via `validateSpec` before being returned.
 */
import {
  type ErrorObject,
  type LocalizedString,
  type Spec,
  validateSpec,
} from "@specpin/spec-schema";

export interface BuildPendingSpecOptions {
  /** Stable unique id within the project, e.g. "login-submit-btn". */
  id: string;
  title: LocalizedString;
  description: LocalizedString;
  businessRules?: LocalizedString[];
  tags?: string[];
}

export interface BuildPendingSpecResult {
  valid: boolean;
  /** The built pending Spec (no fingerprint), or null when it failed validation. */
  spec: Spec | null;
  errors: ErrorObject[];
}

/**
 * Build a pending Spec from authored content and validate it via spec-schema.
 * Returns `{ valid: false, spec: null, errors }` when the constructed spec
 * fails validation (e.g. an empty title/description locale map).
 */
export function buildPendingSpec(options: BuildPendingSpecOptions): BuildPendingSpecResult {
  const spec: Spec = {
    id: options.id,
    title: options.title,
    description: options.description,
  };
  if (options.businessRules?.length) spec.businessRules = options.businessRules;
  if (options.tags?.length) spec.tags = options.tags;

  const result = validateSpec(spec);
  return { valid: result.valid, spec: result.valid ? spec : null, errors: result.errors };
}
