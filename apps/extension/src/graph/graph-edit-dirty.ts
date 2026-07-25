// Phase C3: dirty-state tracking + single-step undo, shared by both edit-mode
// factories (createScreensEditMode in graph-edit-mode.ts, createFlowsEditMode
// in graph-edit-mode-flows.ts). Deliberately NOT a full history stack (YAGNI,
// the phase's own "Undo scope creep" risk) -- only the state immediately
// before the LAST successful mutation is kept, and a second mutation
// overwrites it. Granularity matches whatever the caller treats as "one
// mutation": for a live field edit (C2), that is one keystroke's worth of
// change, since the form applies each valid change immediately -- undo is
// therefore last-change, not last-logical-edit, which is an accepted KISS
// trade-off (see phase-C3's "Undo scope creep" risk note).
//
// `dirty` is a plain boolean, set on every successful mutation and cleared
// only by `resetDirty()` (called after a successful Save). `undoLast()`
// restores the one kept snapshot but does NOT attempt to prove the draft is
// back to its original baseline (that would need a deep-equality check against
// the construction-time config); it conservatively leaves `dirty: true` after
// an undo, since further mutations may already have happened before the one
// being undone. This is safe-by-default: at worst the leave-guard asks to
// confirm once more than strictly necessary, never less.

export interface DirtyTracker<S> {
  isDirty(): boolean;
  /** Clear the dirty flag and drop any pending undo snapshot (called after a
   *  successful Save -- the draft now matches what was persisted). */
  resetDirty(): void;
  /** Record a SUCCESSFUL mutation: mark dirty AND keep `before` (the state
   *  from immediately BEFORE that mutation) as the single snapshot to restore
   *  on the next `undoLast()`. Call this ONLY once the caller knows the
   *  mutation actually succeeded -- committing a refused mutation would
   *  overwrite the kept snapshot with state indistinguishable from current,
   *  making the next undoLast() a silent no-op. */
  commit(before: S): void;
  /** Restore and consume the single kept snapshot, or `null` when there is
   *  nothing to undo (no mutation yet, or already undone once). */
  undoLast(): S | null;
}

// The snapshot handed to `commit` must be independent of the live draft (a
// shallow copy of the arrays the caller mutates is enough, since every
// mutation replaces those arrays wholesale rather than mutating in place).
export function createDirtyTracker<S>(): DirtyTracker<S> {
  let dirty = false;
  let pending: S | null = null;

  return {
    isDirty: () => dirty,
    resetDirty(): void {
      dirty = false;
      pending = null;
    },
    commit(before: S): void {
      pending = before;
      dirty = true;
    },
    undoLast(): S | null {
      const snapshot = pending;
      pending = null;
      if (snapshot === null) return null;
      dirty = true;
      return snapshot;
    },
  };
}
