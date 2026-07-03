/* eslint-disable */
/**
 * Generated from schema/v1.json by json-schema-to-typescript.
 * DO NOT EDIT BY HAND. Run `pnpm --filter @specpin/spec-schema gen`.
 */

/**
 * Author-declared lifecycle of a spec. Absent means neutral/untagged (no default).
 */
export type SpecStatus = "draft" | "approved" | "deprecated";
/**
 * How a spec renders in the browser. Phase 1 ships tooltip + sidebar; the others are reserved for forward compatibility.
 */
export type DisplayMode = "overlay" | "tooltip" | "sidebar" | "modal" | "inline-badge";
export type FrameworkHint = "react" | "vue" | "angular" | "vanilla";
/**
 * Provenance of a spec. "manual" is human-authored; "ai-generated" output must be reviewed.
 */
export type SpecSource = "ai-generated" | "manual";

export interface SpecpinSchemaRoots {
  specFile: SpecFile;
  manifest: Manifest;
  views: ViewsConfig;
  guides: GuidesConfig;
  required: RequiredConfig;
}
/**
 * A Specpin <area>.spec.json file: a named group of specs pinned to UI elements.
 */
export interface SpecFile {
  /**
   * Optional pointer to this schema for editor tooling.
   */
  $schema?: string;
  /**
   * Human-readable area/page name, e.g. "Login Page".
   */
  group: string;
  specs: Spec[];
}
/**
 * A business specification pinned to one UI element.
 */
export interface Spec {
  /**
   * Stable unique id within the project, e.g. "login-submit-btn".
   */
  id: string;
  title: LocalizedString;
  description: LocalizedString;
  businessRules?: LocalizedString[];
  tags?: string[];
  /**
   * Author-declared references (tickets, docs, PRs) this spec came from.
   *
   * @maxItems 10
   */
  links?: Link[];
  /**
   * Repo-relative paths of tests that declare this spec. Declarative only: `specpin validate` checks each path exists; it does not run tests or know pass/fail.
   *
   * @maxItems 20
   */
  verifiedBy?: string[];
  status?: SpecStatus;
  preferredDisplayMode?: DisplayMode;
  fingerprint: ElementFingerprint;
  meta?: SpecMeta;
}
/**
 * Locale-keyed text: a BCP-47 locale maps to a non-empty string. At least one entry. Flat strings are not accepted.
 */
export interface LocalizedString {
  [k: string]: string;
}
/**
 * An author-declared reference from a spec to an external resource (ticket, design doc, PR). The url is constrained to http/https as defense-in-depth; the render-time href sanitizer is authoritative.
 */
export interface Link {
  label: string;
  url: string;
}
/**
 * Multi-signal capture of a DOM element, separated from business content so relinking never touches the spec text.
 */
export interface ElementFingerprint {
  /**
   * data-testid / data-cy / data-qa / data-spec-id. Tier 1 anchor.
   */
  testId?: string | null;
  ariaLabel?: string | null;
  /**
   * Element id, excluding auto-generated ids (e.g. ":r1:", "css-1a2b3c").
   */
  id?: string | null;
  cssSelector: string;
  xpath: string;
  /**
   * Tag chain from an ancestor down to the element, e.g. ["form","button"].
   */
  domPath: string[];
  tagName: string;
  /**
   * Normalized, truncated (~100 chars) text content.
   */
  textContent?: string | null;
  /**
   * Whitelisted attributes: role, type, name, placeholder, href pattern.
   */
  attributes: {
    [k: string]: string;
  };
  nearbyLabels?: string[];
  positionHint: PositionHint;
  frameworkHint?: FrameworkHint;
  /**
   * Optional path glob scoping this spec to a page/route. '*' matches one path segment, '**' matches across segments. Auto-filled with the capture path and user-editable. Absent/null matches on any page (backward compatible).
   */
  pageUrl?: string | null;
}
export interface PositionHint {
  index: number;
  siblingCount: number;
}
export interface SpecMeta {
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  source: SpecSource;
  /**
   * When the spec content was last human-reviewed. Stamped by the Mark-reviewed action. Optional; absent means never reviewed.
   */
  reviewedAt?: string;
  /**
   * Author-declared reviewer token. Committed to .specs/ (Git) and included in export bundles — must not contain PII/emails; defaults to the same non-PII token as createdBy.
   */
  reviewedBy?: string;
}
/**
 * The .specs/manifest.json index + project configuration.
 */
export interface Manifest {
  /**
   * Optional pointer to this schema for editor tooling.
   */
  $schema?: string;
  version: string;
  project: string;
  /**
   * Origins where this project's UI runs, e.g. ["app.acme.io","localhost:3000"].
   */
  domains: string[];
  /**
   * Relative names of the <area>.spec.json files in this .specs/ dir.
   */
  specFiles: string[];
  settings?: ManifestSettings;
}
export interface ManifestSettings {
  defaultLocale?: string;
  /**
   * BCP-47 locales this project authors specs in. The extension's language picker offers the union of connected projects' locales.
   */
  locales?: string[];
  matchConfidenceThreshold?: number;
  /**
   * Days after `meta.reviewedAt` before a spec is shown as stale. Runtime default 90 when absent. Bounded so it cannot silently disable the freshness signal.
   */
  stalenessThresholdDays?: number;
  defaultDisplayMode?: DisplayMode;
}
/**
 * The .specs/views.json team-default visibility config. `hidden` is a flat list of facet keys (tag: / file: / spec: / url:) the team hides by default; the extension parses the prefix.
 */
export interface ViewsConfig {
  /**
   * Optional pointer to this schema for editor tooling.
   */
  $schema?: string;
  version: string;
  hidden: string[];
}
/**
 * The .specs/guides.json named-guides config: a versioned file holding an array of named onboarding guides.
 */
export interface GuidesConfig {
  /**
   * Optional pointer to this schema for editor tooling.
   */
  $schema?: string;
  version: string;
  /**
   * @maxItems 50
   */
  guides: GuideDef[];
}
/**
 * One named onboarding guide: an ordered list of spec ids to walk through. Empty steps means the guide falls back to all matched specs in default order at launch.
 */
export interface GuideDef {
  /**
   * Stable unique id within the file, e.g. "onboarding".
   */
  id: string;
  /**
   * Plain-string UI label (not a LocalizedString; step content is localized via the referenced specs).
   */
  name: string;
  /**
   * Optional plain-string blurb shown when the guide launches.
   */
  description?: string;
  /**
   * Ordered spec ids. May be empty, in which case the guide walks all matched specs in default order.
   *
   * @maxItems 200
   */
  steps: string[];
}
/**
 * The .specs/required.json governance config. `required` is a flat list of spec ids that MUST exist in the project; `specpin report --fail-on missing-required` fails the build when any listed id is absent. It checks existence only, never element matching (that is a runtime concern).
 */
export interface RequiredConfig {
  /**
   * Optional pointer to this schema for editor tooling.
   */
  $schema?: string;
  version: string;
  /**
   * Spec ids that must exist in the project.
   */
  required: string[];
}
