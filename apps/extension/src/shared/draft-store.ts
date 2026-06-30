import { browser } from "#imports";

// Session-backed draft persistence for transient popup / side-panel form input.
//
// The toolbar popup is an ephemeral surface: it is torn down the instant it
// loses focus (a click anywhere outside it, switching tabs, etc.), so anything
// typed into one of its forms but not yet submitted is otherwise lost. These
// helpers stash that in-progress input in `storage.session`, which survives the
// popup closing and reopening within a browser session but clears on a full
// browser restart — so a half-typed draft is restored next time the popup opens,
// yet no stale draft lingers forever.
//
// Drafts are saved on every input/change rather than on a single hide event:
// the popup teardown is too abrupt to reliably flush an async `storage` write
// fired at close time, whereas per-keystroke writes (cheap, in-memory for
// `storage.session`) guarantee the latest value is already persisted.
//
// `storage.session` exists on Chrome MV3 and Firefox; if it is somehow missing,
// every call degrades to a no-op (no draft persistence) rather than throwing.

const PREFIX = "specpin:draft:";

interface SessionArea {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string): Promise<void>;
}

// `storage.session` is not in every @webext-core/webextension-polyfill typing,
// so reach for it through a narrow cast instead of widening the global types.
function sessionArea(): SessionArea | undefined {
  return (browser.storage as unknown as { session?: SessionArea }).session;
}

/** Read a previously stashed draft, or null if none (or on any storage error). */
export async function loadDraft<T>(key: string): Promise<T | null> {
  try {
    const k = PREFIX + key;
    const got = await sessionArea()?.get(k);
    return (got?.[k] as T | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Stash the current draft for `key`. Fire-and-forget; errors are swallowed so a
 *  failed draft write never disrupts the form the user is filling in. */
export async function saveDraft(key: string, value: unknown): Promise<void> {
  try {
    await sessionArea()?.set({ [PREFIX + key]: value });
  } catch {
    // best-effort
  }
}

/** Drop a draft once it has been submitted or explicitly discarded. */
export async function clearDraft(key: string): Promise<void> {
  try {
    await sessionArea()?.remove(PREFIX + key);
  } catch {
    // best-effort
  }
}
