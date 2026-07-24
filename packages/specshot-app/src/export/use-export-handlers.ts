/**
 * Wires export-actions' pure builders to the app's live state (editor store +
 * optional sidecar) into the three click handlers `app.tsx` needs. Split out
 * of app.tsx purely to keep that composition root under the file-size budget
 * — no additional domain logic beyond what export-actions.ts already does.
 */

import type { Screen, Spec } from "@specpin/spec-schema";
import type { ImageSource } from "@specpin/specshot-core";
import { useCallback, useMemo } from "react";
import type { UseSidecarResult } from "../persist/use-sidecar.js";
import { type EditorState, itemNoSpecIdMap } from "../state/editor-store.js";
import {
  buildAdHocScreen,
  buildShotForExport,
  downloadShotJson,
  downloadSpecSheetHtml,
  downloadSpecSheetMd,
  toDataUrl,
} from "./export-actions.js";

export interface UseExportHandlersArgs {
  state: EditorState;
  source: ImageSource | null;
  screenId: string;
  screenName: string;
  screens: Screen[];
  specsById: Map<string, Spec>;
  sidecar: UseSidecarResult;
  locale: string;
}

export interface ExportHandlers {
  exportJson: () => Promise<void>;
  exportHtml: () => Promise<void>;
  exportMd: () => Promise<void>;
}

export function useExportHandlers(args: UseExportHandlersArgs): ExportHandlers {
  const { state, source, screenId, screenName, screens, specsById, sidecar, locale } = args;

  // itemNo -> specId, derived once per state change; both the shot build and the
  // linked-spec resolution below read it (was computed twice per export).
  const specIdMap = useMemo(() => itemNoSpecIdMap(state), [state]);

  // The screenshot's data: URL (fetch + base64 of a potentially large bitmap) is
  // immutable for a given loaded image, so encode it once per source rather than
  // re-encoding on every export click (json/html/md each call this).
  const imagePromise = useMemo(() => (source ? toDataUrl(source) : null), [source]);

  /** Build the ShotConfig; persists to the sidecar too when connected. Null
   *  (no download) when there's no image/screenId yet, or validation fails. */
  const buildShotAndPersist = useCallback(async () => {
    if (!screenId || !imagePromise) return null;
    const image = await imagePromise;
    const result = buildShotForExport({ doc: state.doc, screenId, image, specIds: specIdMap });
    if (result.shot && sidecar.connected) await sidecar.putShot(result.shot);
    return result.shot;
  }, [imagePromise, screenId, state.doc, specIdMap, sidecar]);

  const resolveScreen = useCallback(
    () => screens.find((s) => s.id === screenId) ?? buildAdHocScreen(screenId, screenName, locale),
    [screens, screenId, screenName, locale],
  );

  const resolveSpecs = useCallback(() => {
    const linkedIds = new Set(specIdMap.values());
    return [...linkedIds].map((id) => specsById.get(id)).filter((s): s is Spec => !!s);
  }, [specIdMap, specsById]);

  const exportJson = useCallback(async () => {
    const shot = await buildShotAndPersist();
    if (shot) downloadShotJson(shot);
  }, [buildShotAndPersist]);

  const exportHtml = useCallback(async () => {
    const shot = await buildShotAndPersist();
    if (shot)
      downloadSpecSheetHtml({ screen: resolveScreen(), specs: resolveSpecs(), shot, locale });
  }, [buildShotAndPersist, resolveScreen, resolveSpecs, locale]);

  const exportMd = useCallback(async () => {
    const shot = await buildShotAndPersist();
    if (shot) downloadSpecSheetMd({ screen: resolveScreen(), specs: resolveSpecs(), shot, locale });
  }, [buildShotAndPersist, resolveScreen, resolveSpecs, locale]);

  return { exportJson, exportHtml, exportMd };
}
