/** Assert a queried value is present. Tests build the DOM they query, so a null
 * here is a broken test setup, not a runtime condition worth handling. */
export function must<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Expected a non-null value in test setup");
  return value;
}
