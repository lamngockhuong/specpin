import type { FrameworkHint } from "@specpin/spec-schema";

function hasReactFiber(root: Element | null): boolean {
  if (!root) return false;
  const sample = [root, ...Array.from(root.querySelectorAll("*")).slice(0, 50)];
  return sample.some((node) =>
    Object.keys(node).some(
      (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactContainer$"),
    ),
  );
}

/**
 * Best-effort framework detection from DOM markers. Heuristic only; defaults to
 * "vanilla" when nothing matches. Accepts an explicit document for testability.
 */
export function detectFramework(doc: Document = globalThis.document): FrameworkHint {
  if (!doc) return "vanilla";

  if (doc.querySelector("[ng-version], .ng-scope, [ng-app]")) return "angular";

  const root = doc.documentElement as Element & { __vue_app__?: unknown };
  if (doc.querySelector("[data-v-app], [data-server-rendered]") || root?.__vue_app__) {
    return "vue";
  }

  if (doc.querySelector("[data-reactroot]") || hasReactFiber(doc.body)) return "react";

  return "vanilla";
}
