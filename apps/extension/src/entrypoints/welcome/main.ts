import { browser } from "#imports";
import { hydrateI18n, initI18n, resolveUiLocale } from "../../i18n/index.js";
import { getUiLocale } from "../../shared/config.js";
import { applyStoredTheme } from "../../shared/theme.js";
import "../../shared/inter-font.css";
import "../../shared/tokens.gen.css";

// First-run welcome page. Static + localized: resolve the UI language, apply the
// stored theme, then hydrate the data-i18n markup. The only interaction is the
// "Open Options" button, which routes to the extension's options page.
async function init(): Promise<void> {
  await applyStoredTheme();
  const stored = await getUiLocale();
  initI18n(resolveUiLocale(stored));
  hydrateI18n(document);

  document.getElementById("openOptions")?.addEventListener("click", (e) => {
    e.preventDefault();
    void browser.runtime.openOptionsPage();
  });
}

void init();
