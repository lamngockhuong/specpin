/* eslint-disable */
/**
 * Generated from schema/v1.json by json-schema-to-typescript.
 * DO NOT EDIT BY HAND. Run `pnpm --filter @specpin/spec-schema gen`.
 */

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
  title: string;
  description: string;
  businessRules?: string[];
  tags?: string[];
  preferredDisplayMode?: DisplayMode;
  fingerprint: ElementFingerprint;
  meta?: SpecMeta;
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
  matchConfidenceThreshold?: number;
  defaultDisplayMode?: DisplayMode;
}
