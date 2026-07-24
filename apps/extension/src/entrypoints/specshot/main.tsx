import { SpecshotApp } from "@specpin/specshot-app";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyStoredTheme } from "../../shared/theme.js";
import "../../shared/inter-font.css";
import "../../shared/tokens.gen.css";
import "@specpin/specshot-app/app.css";

// The specshot authoring page, hosted INSIDE the extension
// (chrome-extension://<id>/specshot.html). Mounting the shared
// @specpin/specshot-app here means its optional sidecar persistence works out
// of the box: the sidecar's CORS policy accepts the extension origin (it rejects
// web origins), which a separately-deployed web app could never satisfy. React
// is confined to this entrypoint's own bundle; the content script is untouched.
async function init(): Promise<void> {
  await applyStoredTheme();
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Root element #root not found");
  createRoot(rootEl).render(
    <StrictMode>
      <SpecshotApp />
    </StrictMode>,
  );
}

void init();
