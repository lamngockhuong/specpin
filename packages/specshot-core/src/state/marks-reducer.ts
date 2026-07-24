/**
 * Single reducer over the MarkDoc — every mutation flows through here so the
 * document stays the one source of truth (and undo/redo stays a later freebie).
 * All coordinates are image-space; callers convert pointer coords first.
 */
import { isValidItemNo, type MarkDoc, type MarkItem, type Position } from "../model/mark-doc.js";
import { nextItemNo, reindexFlat, reindexHierarchical } from "../model/numbering.js";

export type ReindexMode = "flat" | "hierarchical";

export type MarkAction =
  | { type: "setDoc"; doc: MarkDoc }
  | { type: "add"; position: Position; label?: string }
  | { type: "move"; itemNo: string; position: Position }
  | { type: "resize"; itemNo: string; position: Position }
  | { type: "delete"; itemNo: string }
  | { type: "setLabel"; itemNo: string; label: string }
  | { type: "setItemNo"; itemNo: string; next: string }
  | { type: "reindex"; mode: ReindexMode };

function replace(doc: MarkDoc, itemNo: string, patch: Partial<MarkItem>): MarkDoc {
  return doc.map((it) => (it.itemNo === itemNo ? { ...it, ...patch } : it));
}

export function marksReducer(doc: MarkDoc, action: MarkAction): MarkDoc {
  switch (action.type) {
    case "setDoc":
      return action.doc;
    case "add": {
      const item: MarkItem = { itemNo: nextItemNo(doc), position: action.position };
      if (action.label) item.label = action.label;
      return [...doc, item];
    }
    case "move":
    case "resize":
      return replace(doc, action.itemNo, { position: action.position });
    case "delete":
      return doc.filter((it) => it.itemNo !== action.itemNo);
    case "setLabel":
      return replace(doc, action.itemNo, { label: action.label });
    case "setItemNo": {
      const next = action.next.trim();
      // Reject a rename that breaks the contract (bad format) or collides — keeps
      // every mutation routed through the shared validation, no matter the caller.
      if (!isValidItemNo(next)) return doc;
      if (next !== action.itemNo && doc.some((it) => it.itemNo === next)) return doc;
      return replace(doc, action.itemNo, { itemNo: next });
    }
    case "reindex":
      return action.mode === "flat" ? reindexFlat(doc) : reindexHierarchical(doc);
    default:
      return doc;
  }
}
