/**
 * Host state for the authoring editor: the MarkDoc (via specshot-core's
 * marksReducer) plus a stable itemNo -> specId association.
 *
 * Why not `Map<itemNo, specId>` directly: `reindex` (flat/hierarchical)
 * reassigns itemNo values to existing boxes, so a map keyed by itemNo would
 * silently point a specId at the WRONG box after a reindex. Every item
 * dispatched through this reducer instead carries a host-only `_key` (never
 * part of the specshot-core schema, never serialized to a shot/spec
 * artifact) that survives every marksReducer action:
 *  - move/resize/setLabel/setItemNo use `{...it, ...patch}` (spread) → kept.
 *  - reindex uses `{...item, itemNo}` (spread) → kept.
 *  - delete/setDoc naturally drop or replace items → handled explicitly below.
 * The specId association is keyed by `_key`, so it is immune to itemNo
 * renumbering; `itemNoSpecIdMap` derives the itemNo -> specId view that
 * `buildShot` needs, at the point of use.
 */
import { type MarkAction, type MarkDoc, type MarkItem, marksReducer } from "@specpin/specshot-core";
import { type Dispatch, useReducer } from "react";

/** A MarkItem carrying a host-only stable identity (see module doc). */
export interface TrackedMarkItem extends MarkItem {
  readonly _key: string;
}

export type TrackedMarkDoc = TrackedMarkItem[];

/** An item that may or may not have been tagged with a `_key` yet — the
 *  honest type of marksReducer's raw output (it knows nothing about `_key`). */
type MaybeTrackedItem = MarkItem & { _key?: string };

export interface EditorState {
  doc: TrackedMarkDoc;
  /** stable `_key` -> specId (pending or existing/pinned). */
  specIds: Map<string, string>;
}

export type EditorAction =
  | MarkAction
  | { type: "assignSpec"; itemNo: string; specId: string }
  | { type: "unassignSpec"; itemNo: string };

export const initialEditorState: EditorState = { doc: [], specIds: new Map() };

let keySeq = 0;
/** Generate a fresh, process-unique host key for a newly added item. */
function nextKey(): string {
  keySeq += 1;
  return `k${keySeq}`;
}

function findByItemNo(doc: TrackedMarkDoc, itemNo: string): TrackedMarkItem | undefined {
  return doc.find((it) => it.itemNo === itemNo);
}

/** Reducer wrapping marksReducer with the `_key` <-> specId association. */
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "delete": {
      const removed = findByItemNo(state.doc, action.itemNo);
      const doc = marksReducer(state.doc, action) as TrackedMarkDoc;
      if (!removed) return { ...state, doc };
      const specIds = new Map(state.specIds);
      specIds.delete(removed._key);
      return { doc, specIds };
    }
    case "setDoc": {
      // Full doc replacement (e.g. JSON import) carries no `_key`s of ours —
      // start a fresh association rather than keep stale keys around.
      const doc: TrackedMarkDoc = (action.doc as MaybeTrackedItem[]).map((it) =>
        it._key !== undefined ? (it as TrackedMarkItem) : { ...it, _key: nextKey() },
      );
      return { doc, specIds: new Map() };
    }
    case "assignSpec": {
      const item = findByItemNo(state.doc, action.itemNo);
      if (!item) return state;
      const specIds = new Map(state.specIds);
      specIds.set(item._key, action.specId);
      return { ...state, specIds };
    }
    case "unassignSpec": {
      const item = findByItemNo(state.doc, action.itemNo);
      if (!item) return state;
      const specIds = new Map(state.specIds);
      specIds.delete(item._key);
      return { ...state, specIds };
    }
    default: {
      // Any marksReducer action (notably `add`) may introduce a new, untagged
      // item; every pre-existing item keeps its `_key` through the reducer's
      // spreads. Tag whatever lacks a `_key` so a fresh box always gets one —
      // simpler and more robust than predicting the added item's itemNo.
      const nextDoc = marksReducer(state.doc, action) as MaybeTrackedItem[];
      const doc: TrackedMarkDoc = nextDoc.map((it) =>
        it._key === undefined ? { ...it, _key: nextKey() } : (it as TrackedMarkItem),
      );
      return { ...state, doc };
    }
  }
}

/** Derive the itemNo -> specId map `buildShot` expects, from current state. */
export function itemNoSpecIdMap(state: EditorState): Map<string, string> {
  const out = new Map<string, string>();
  for (const item of state.doc) {
    const specId = state.specIds.get(item._key);
    if (specId) out.set(item.itemNo, specId);
  }
  return out;
}

/** Number of items still missing a linked spec (pending authoring). */
export function unresolvedCount(state: EditorState): number {
  return state.doc.filter((it) => !state.specIds.get(it._key)).length;
}

/** React hook: MarkDoc + specId association as a single reducer-backed state. */
export function useEditorStore(): [EditorState, Dispatch<EditorAction>] {
  return useReducer(editorReducer, initialEditorState);
}

export type { MarkDoc };
