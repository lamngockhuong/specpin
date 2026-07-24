/**
 * Build a `.specs/shots/<screenId>.shot.json` artifact from a MarkDoc + an
 * itemNo → specId mapping. Each MarkItem.position maps 1:1 onto a
 * ShotItem.bbox (both are {startX,startY,endX,endY}); pixel coordinates never
 * enter a Spec (anti-bloat invariant — see docs/specshot-integration.md).
 * The result is validated via `validateShot` before being returned.
 */
import {
  type ErrorObject,
  type ShotConfig,
  type ShotItem,
  validateShot,
} from "@specpin/spec-schema";
import type { MarkDoc } from "../model/mark-doc.js";

/** Default version stamped on a freshly built shot artifact. */
export const DEFAULT_SHOT_VERSION = "1.0.0";

export interface BuildShotOptions {
  /** Id of the Screen this shot belongs to (references Screen.id in screens.json). */
  screenId: string;
  /** The screenshot: a data: URL (embedded) or a relative path. */
  image: string;
  /** Optional itemNo → specId mapping (pending or pinned specs). */
  specIds?: Map<string, string>;
  /** Shot artifact version; defaults to {@link DEFAULT_SHOT_VERSION}. */
  version?: string;
}

export interface BuildShotResult {
  valid: boolean;
  /** The built ShotConfig, or null when it failed validation. */
  shot: ShotConfig | null;
  errors: ErrorObject[];
}

function toShotItems(doc: MarkDoc, specIds: Map<string, string>): ShotItem[] {
  return doc.map((item) => {
    const shotItem: ShotItem = {
      itemNo: item.itemNo,
      bbox: {
        startX: item.position.startX,
        startY: item.position.startY,
        endX: item.position.endX,
        endY: item.position.endY,
      },
    };
    const specId = specIds.get(item.itemNo);
    if (specId) shotItem.specId = specId;
    return shotItem;
  });
}

/**
 * Build a ShotConfig from a MarkDoc and validate it via spec-schema.
 * Returns `{ valid: false, shot: null, errors }` when the constructed
 * artifact fails validation (e.g. a negative bbox coordinate, or an itemNo
 * that does not match the hierarchical pattern).
 */
export function buildShot(doc: MarkDoc, options: BuildShotOptions): BuildShotResult {
  const shot: ShotConfig = {
    version: options.version ?? DEFAULT_SHOT_VERSION,
    screenId: options.screenId,
    image: options.image,
    items: toShotItems(doc, options.specIds ?? new Map()),
  };
  const result = validateShot(shot);
  return { valid: result.valid, shot: result.valid ? shot : null, errors: result.errors };
}
