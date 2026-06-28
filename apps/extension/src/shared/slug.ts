/** Kebab-case slug: lowercase, non-alphanumerics collapsed to single hyphens,
 *  leading/trailing hyphens trimmed. May return "" (callers supply a fallback).
 *  The one place this rule lives, shared by file-name, id, and zip-name builders. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
