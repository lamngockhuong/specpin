/**
 * Local cache of Screens + Specs fetched from the sidecar once connected
 * (for the "existing spec" picker and the screen quick-pick list), plus a
 * `merge` for specs authored locally. Split out of app.tsx purely to keep
 * that composition root under the file-size budget — no new domain logic.
 */
import type { Screen, Spec } from "@specpin/spec-schema";
import { useCallback, useState } from "react";
import type { UseSidecarResult } from "./use-sidecar.js";

export interface SidecarCatalog {
  screens: Screen[];
  specsById: Map<string, Spec>;
  /** Fetch the current screens + specs from the (already connected) sidecar. */
  refresh: () => Promise<void>;
  /** Track a locally authored/linked spec so exports can find its content. */
  merge: (spec: Spec) => void;
}

export function useSidecarCatalog(sidecar: UseSidecarResult): SidecarCatalog {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [specsById, setSpecsById] = useState<Map<string, Spec>>(new Map());

  const merge = useCallback((spec: Spec) => {
    setSpecsById((prev) => new Map(prev).set(spec.id, spec));
  }, []);

  const refresh = useCallback(async () => {
    const [specs, fetchedScreens] = await Promise.all([
      sidecar.fetchExistingSpecs(),
      sidecar.fetchScreens(),
    ]);
    setScreens(fetchedScreens);
    setSpecsById((prev) => {
      const next = new Map(prev);
      for (const spec of specs) next.set(spec.id, spec);
      return next;
    });
  }, [sidecar]);

  return { screens, specsById, refresh, merge };
}
