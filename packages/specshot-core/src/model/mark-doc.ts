/**
 * MarkDoc model + parse/serialize — the single rule source for the whole app.
 * Per-item validation lives in ./mark-doc-validate (kept split for the 200-line
 * budget) and is re-exported here so `./mark-doc` stays the one import surface.
 *
 * The rules mirror the python `annotate-image-bboxes.py` in the number-ui-image
 * skill EXACTLY (itemNo regex, depth ≤ 3, startX≤endX/startY≤endY, unique
 * itemNo, integer coords by round-half-to-even). Zero runtime dependencies.
 */
import {
  ITEM_NO_PATTERN,
  type ItemValidation,
  isValidItemNo,
  roundCoord,
  validateMarkItem,
} from "./mark-doc-validate.js";

export type { ItemValidation };
export { ITEM_NO_PATTERN, isValidItemNo, roundCoord, validateMarkItem };

/** Hierarchical item number: "1" | "1.1" | "6.10", depth 1–3. */
export type ItemNo = string;

export interface Position {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface MarkItem {
  itemNo: ItemNo;
  position: Position;
  /** App-only extension; the skill never emits it. Optional, may be omitted. */
  label?: string;
}

export type MarkDoc = MarkItem[];

export type ParseResult = { ok: true; data: MarkDoc } | { ok: false; errors: string[] };

/**
 * Parse arbitrary JSON text (or a parsed value) into a validated MarkDoc.
 * Accepts a bare array or an object with an `items` array (python parity).
 * On any failure returns { ok: false, errors } with NO partial data.
 */
export function parseMarkDoc(input: string | unknown): ParseResult {
  let data: unknown;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch (e) {
      return { ok: false, errors: [`Invalid JSON: ${(e as Error).message}`] };
    }
  } else {
    data = input;
  }

  let rawItems: unknown[];
  if (Array.isArray(data)) {
    rawItems = data;
  } else if (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as Record<string, unknown>).items)
  ) {
    rawItems = (data as Record<string, unknown>).items as unknown[];
  } else {
    return {
      ok: false,
      errors: ['MarkDoc JSON must be an array or an object containing an "items" array'],
    };
  }

  const seen = new Set<string>();
  const out: MarkItem[] = [];
  const allErrors: string[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const { item, errors } = validateMarkItem(rawItems[i], i + 1, seen);
    if (item) out.push(item);
    if (errors.length) allErrors.push(...errors);
  }
  if (allErrors.length > 0) {
    return { ok: false, errors: allErrors };
  }
  return { ok: true, data: out };
}

/** Validate an in-memory doc (used after mutations). Returns error list (empty = valid). */
export function validateMarkDoc(doc: MarkDoc): string[] {
  const res = parseMarkDoc(doc);
  return res.ok ? [] : res.errors;
}

/**
 * Serialize a MarkDoc to stable JSON matching the skill's shape:
 * array of { itemNo, position: {startX,startY,endX,endY}, label? } with integer coords.
 */
export function serializeMarkDoc(doc: MarkDoc): string {
  const normalized = doc.map((item) => {
    const out: Record<string, unknown> = {
      itemNo: item.itemNo,
      position: {
        startX: roundCoord(item.position.startX),
        startY: roundCoord(item.position.startY),
        endX: roundCoord(item.position.endX),
        endY: roundCoord(item.position.endY),
      },
    };
    if (item.label !== undefined && item.label !== "") out.label = item.label;
    return out;
  });
  return JSON.stringify(normalized, null, 2);
}
