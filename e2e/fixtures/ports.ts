/** Base of the harness port range. Chosen well clear of the demo app's own 3000/3001
 *  defaults so a stray `pnpm dev` never collides with a test run. */
const BASE_PORT = 43_100;

/** Ports reserved per worker: one sidecar, one demo app. Nothing pins these numbers
 *  externally (no test asserts a literal port), so a later scenario that needs a
 *  second sidecar or a hung server adds its own offset and widens the stride in the
 *  same change — there is no numbering to preserve. */
const STRIDE = 2;

/** Offsets within a worker's block. Named rather than open-coded so a second server
 *  can never accidentally reuse the demo app's port. */
const OFFSET = {
  sidecar: 0,
  demoApp: 1,
} as const;

export type PortRole = keyof typeof OFFSET;

/** A worker's port for one role. Derived from `testWorkerIndex`, never fixed: CI runs
 *  workers in parallel and a fixed port collides. */
export function portFor(workerIndex: number, role: PortRole): number {
  return BASE_PORT + workerIndex * STRIDE + OFFSET[role];
}
