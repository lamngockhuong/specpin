/** Minimal ambient declarations for the extension globals available inside
 *  `serviceWorker.evaluate()` / `page.evaluate()`.
 *
 *  Deliberately hand-rolled rather than pulling `@types/chrome`: the harness only
 *  ever touches `storage` and `runtime`, and a full platform typing would be a large
 *  dependency whose surface nothing here uses. Extend this as scenarios need more. */
declare namespace chrome {
  namespace storage {
    interface StorageArea {
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    }
    const local: StorageArea;
    const sync: StorageArea;
  }

  namespace runtime {
    const id: string;
    function getManifest(): Record<string, unknown>;
    function sendMessage<T = unknown>(message: unknown): Promise<T>;
  }
}
