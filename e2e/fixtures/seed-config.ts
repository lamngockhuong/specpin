import type { Worker } from "@playwright/test";

/** Storage keys mirrored from `apps/extension/src/shared/config.ts`.
 *
 *  SOURCE OF TRUTH: `apps/extension/src/shared/config.ts`. They are duplicated as
 *  literals rather than imported because the extension module pulls WXT's
 *  `#imports` alias, which only resolves inside a WXT build. A renamed key here
 *  fails loudly (the seeded state simply does nothing), which the smoke tier
 *  catches on the very next run. */
export const KEYS = {
  // `specpin:connections` is deliberately absent: nothing should seed it (see the
  // warning on `seedSetting`). Connections are established via `connectToSidecar()`.
  enabled: "specpin:enabled",
  localSpecs: "specpin:localSpecs",
  locale: "specpin:locale",
  uiLocale: "specpin:uiLocale",
  displayMode: "specpin:displayMode",
  defaultSurface: "specpin:defaultSurface",
  coverageEnabled: "specpin:coverageEnabled",
  badgeNumbering: "specpin:badgeNumbering",
  welcomeSeen: "specpin:welcomeSeen",
  lastVersion: "specpin:lastVersion",
} as const;

/** Set one arbitrary `storage.local` key. Prefer a `KEYS` member over a raw string
 *  so a key rename surfaces in one place.
 *
 *  ⚠ Seeding is right for plain preferences (display mode, locale, coverage) — keys the
 *  extension re-reads on use. It is NOT how to establish a connection: the background's
 *  `storage.onChanged` listener does not watch `specpin:connections`, so a seeded
 *  connection is noticed only on a worker start or the 1-minute keepalive alarm. That
 *  makes it a coin flip, and it presents as "the renderer is broken". Use
 *  `connectToSidecar()`, which sends `ADD_CONNECTION`. */
export async function seedSetting(
  serviceWorker: Worker,
  key: string,
  value: unknown,
): Promise<void> {
  await serviceWorker.evaluate(
    async ({ key: k, value: v }) => {
      await chrome.storage.local.set({ [k]: v });
    },
    { key, value },
  );
}
