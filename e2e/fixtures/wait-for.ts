/** Bounded polling. The one place the harness is allowed to wait for anything:
 *  every wait has a deadline and a named subject, so a timeout reports what it was
 *  waiting for instead of surfacing as a bare assertion failure.
 *
 *  There is deliberately no sleep helper anywhere in `e2e/` — `waitForTimeout` and
 *  friends hide exactly the lifecycle races this suite exists to expose (see #209). */
export interface WaitOptions {
  /** What is being waited for, quoted verbatim in the timeout message. */
  subject: string;
  /** Hard deadline in ms. */
  timeout?: number;
  /** Gap between attempts. */
  interval?: number;
  /** Extra detail appended to the timeout message (e.g. captured stderr). */
  describeFailure?: () => string;
}

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_INTERVAL = 100;

/** Poll `probe` until it returns a non-null value, then return it. A probe that
 *  throws counts as "not ready yet" — a process that has not opened its port yet
 *  raises ECONNREFUSED, which is a normal state during startup, not a failure. */
export async function waitFor<T>(
  probe: () => Promise<T | null> | T | null,
  options: WaitOptions,
): Promise<T> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const interval = options.interval ?? DEFAULT_INTERVAL;
  const deadline = Date.now() + timeout;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value !== null && value !== undefined) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  const parts = [`timed out after ${timeout}ms waiting for ${options.subject}`];
  const detail = options.describeFailure?.();
  if (detail) parts.push(detail);
  if (lastError) parts.push(`last error: ${String(lastError)}`);
  throw new Error(parts.join("\n"));
}
