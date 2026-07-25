// Deterministic id slugifier shared by the adapters: lowercase, non-alnum ->
// "-", collapse runs, trim edges. Collision suffixing keeps generated ids
// stable and unique within one extraction/assembly run.

/** Lowercases, replaces runs of non-alphanumeric characters with a single
 * "-", and trims leading/trailing dashes. Falls back to "id" for input that
 * slugifies to nothing (e.g. an empty string). */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "id";
}

/** Returns a slug unique against `used`, appending a numeric suffix
 * (`-2`, `-3`, ...) on collision. Pure — does not mutate `used`; callers add
 * the returned id to their own tracking set. */
export function dedupeSlug(base: string, used: ReadonlySet<string>): string {
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
