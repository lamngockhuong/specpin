import { browser } from "#imports";
import { getTheme, THEME_KEY } from "./config.js";

// The user's UI theme preference. "system" follows the OS via the
// `@media (prefers-color-scheme)` block in tokens.gen.css; "light"/"dark" force
// that theme through the `[data-theme]` attribute selectors (see Phase 1).
export type Theme = "system" | "light" | "dark";

/** Apply a theme to a target element (document root for pages, shadow host for
 *  renderers) by setting or clearing the `data-theme` attribute. "system" clears
 *  the attribute so the media query governs again; absence is cleaner than an
 *  explicit `data-theme="system"` and matches the Phase 1 `:not()` guard. */
export function applyTheme(el: HTMLElement, theme: Theme): void {
  if (theme === "system") el.removeAttribute("data-theme");
  else el.dataset.theme = theme;
}

/** Read the stored theme and apply it to the page's document root. Called early
 *  in each page's init; storage is async so a forced theme may flash the System
 *  default for ~1 frame (accepted, see plan validation). */
export async function applyStoredTheme(): Promise<void> {
  applyTheme(document.documentElement, await getTheme());
}

/** Re-apply the document theme whenever the stored preference changes. Extension
 *  pages (popup/options/side panel) receive `storage.onChanged`, so a theme
 *  change in Options reflects live in an already-open popup/panel without a
 *  message round-trip. Content-script renderers use the SET_THEME message instead. */
export function watchThemeChanges(): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[THEME_KEY]) return;
    applyTheme(
      document.documentElement,
      (changes[THEME_KEY].newValue as Theme | undefined) ?? "system",
    );
  });
}
