/**
 * Per-item validation for the MarkDoc contract, split out of mark-doc.ts to
 * keep each file within the 200-line budget. These rules mirror the python
 * `annotate-image-bboxes.py` in the number-ui-image skill EXACTLY so skill
 * output and app output never diverge.
 */
import type { MarkItem, Position } from "./mark-doc.js";

/** Hierarchical itemNo up to depth 3: 1, 1.2, 1.2.3 (matches python ITEM_NO_PATTERN). */
export const ITEM_NO_PATTERN = /^[1-9]\d*(\.[1-9]\d*){0,2}$/;

/** One validated item plus any problems found while validating it. */
export interface ItemValidation {
  item: MarkItem | null;
  errors: string[];
}

/** True when itemNo is well-formed (trimmed) per the shared contract. */
export function isValidItemNo(itemNo: string): boolean {
  return ITEM_NO_PATTERN.test(itemNo.trim());
}

/**
 * Round to the nearest integer, ties to even — matches python's `int(round(v))`
 * (round-half-to-even / banker's rounding), NOT round-half-up. This keeps
 * coordinates byte-identical to the skill's python side on exact .5 values.
 */
export function roundCoord(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1; // exact tie → round to even
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readPosition(
  pos: Record<string, unknown>,
  itemNo: string,
  errors: string[],
): Position | null {
  const keys: (keyof Position)[] = ["startX", "startY", "endX", "endY"];
  const out = {} as Position;
  for (const key of keys) {
    const v = pos[key];
    if (!isFiniteNumber(v)) {
      errors.push(`itemNo ${JSON.stringify(itemNo)} is missing a numeric ${key}`);
      return null;
    }
    out[key] = roundCoord(v);
  }
  if (out.startX > out.endX || out.startY > out.endY) {
    errors.push(`itemNo ${JSON.stringify(itemNo)} must satisfy startX <= endX and startY <= endY`);
    return null;
  }
  return out;
}

/**
 * Validate + normalize a single raw item at `index` (1-based, for messages).
 * `seen` holds itemNos already accepted, so duplicates are caught across the doc.
 * Returns the normalized item (or null) alongside the errors found.
 */
export function validateMarkItem(raw: unknown, index: number, seen: Set<string>): ItemValidation {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) {
    return { item: null, errors: [`Entry #${index} must be an object`] };
  }
  const obj = raw as Record<string, unknown>;

  const rawItemNo = obj.itemNo;
  let itemNo = "";
  if (typeof rawItemNo !== "string" || !rawItemNo.trim()) {
    errors.push(`Entry #${index} is missing a non-empty itemNo`);
  } else {
    itemNo = rawItemNo.trim();
    if (!ITEM_NO_PATTERN.test(itemNo)) {
      errors.push(
        `Entry #${index}: itemNo ${JSON.stringify(itemNo)} must be hierarchical like 1, 1.1, or 1.1.1 (max depth 3)`,
      );
    } else if (seen.has(itemNo)) {
      errors.push(`Duplicate itemNo detected: ${itemNo}`);
    }
  }

  const pos = obj.position;
  let position: Position | null = null;
  if (typeof pos !== "object" || pos === null) {
    errors.push(`Entry #${index} is missing a position object`);
  } else {
    position = readPosition(pos as Record<string, unknown>, itemNo || `#${index}`, errors);
  }

  let label: string | undefined;
  if (obj.label !== undefined) {
    if (typeof obj.label !== "string") {
      errors.push(`Entry #${index}: label must be a string when present`);
    } else {
      label = obj.label;
    }
  }

  if (errors.length > 0 || !position) {
    return { item: null, errors };
  }
  seen.add(itemNo);
  const item: MarkItem = { itemNo, position };
  if (label !== undefined) item.label = label;
  return { item, errors: [] };
}
