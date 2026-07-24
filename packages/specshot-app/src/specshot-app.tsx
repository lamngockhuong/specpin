/**
 * Composition root: wires the specshot-react editor + this app's authoring
 * (spec-form/screen-picker), optional persistence (use-sidecar), and export
 * (use-export-handlers/export-actions) modules together. Orchestration only
 * — no domain logic lives here; every rule (numbering, validation,
 * string-building) comes from @specpin/specshot-core / @specpin/spec-schema.
 */

import { resolveLocalized, type Spec } from "@specpin/spec-schema";
import {
  detectFromSvg,
  type ImageSource,
  loadImageSource,
  parseMarkDoc,
  type ReindexMode,
} from "@specpin/specshot-core";
import {
  EditorCanvas,
  EmptyState,
  ItemListPanel,
  type Tool,
  Toolbar,
  useKeyboardShortcuts,
} from "@specpin/specshot-react";
import { useCallback, useMemo, useState } from "react";
import { ScreenPicker } from "./authoring/screen-picker.js";
import { SpecForm } from "./authoring/spec-form.js";
import { ExportPanel } from "./export/export-panel.js";
import { useExportHandlers } from "./export/use-export-handlers.js";
import { SidecarPanel } from "./persist/sidecar-panel.js";
import { useSidecar } from "./persist/use-sidecar.js";
import { useSidecarCatalog } from "./persist/use-sidecar-catalog.js";
import { useEditorStore } from "./state/editor-store.js";

const LOCALE = "en";

export function SpecshotApp() {
  const [state, dispatch] = useEditorStore();
  const [source, setSource] = useState<ImageSource | null>(null);
  const [selectedItemNo, setSelectedItemNo] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [reindexMode, setReindexMode] = useState<ReindexMode>("hierarchical");
  const [screenId, setScreenId] = useState("");
  const [screenName, setScreenName] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const sidecar = useSidecar();
  const catalog = useSidecarCatalog(sidecar);

  const handleLoadImage = useCallback(
    async (file: File) => {
      const next = await loadImageSource(file);
      setSource(next);
      dispatch({ type: "setDoc", doc: [] });
      setSelectedItemNo(null);
    },
    [dispatch],
  );

  const handleImportJson = useCallback(
    async (file: File) => {
      const result = parseMarkDoc(await file.text());
      if (!result.ok) {
        setImportError(result.errors.join("; "));
        return;
      }
      setImportError(null);
      dispatch({ type: "setDoc", doc: result.data });
    },
    [dispatch],
  );

  const handleDetectSvg = useCallback(() => {
    if (source?.kind !== "svg" || !source.svgText) return;
    dispatch({ type: "setDoc", doc: detectFromSvg(source.svgText, source.width, source.height) });
  }, [source, dispatch]);

  const handlePendingSpecBuilt = useCallback(
    (result: { spec: Spec | null }) => {
      if (!result.spec || !selectedItemNo) return;
      const spec = result.spec;
      catalog.merge(spec);
      dispatch({ type: "assignSpec", itemNo: selectedItemNo, specId: spec.id });
      if (sidecar.connected) void sidecar.saveSpec(`${screenId || "pending"}.spec.json`, spec);
    },
    [selectedItemNo, dispatch, sidecar, catalog, screenId],
  );

  const handleExistingSpecSelected = useCallback(
    (specId: string) => {
      if (selectedItemNo) dispatch({ type: "assignSpec", itemNo: selectedItemNo, specId });
    },
    [selectedItemNo, dispatch],
  );

  const handleSidecarConnect = useCallback(
    async (baseUrl: string, token: string) => {
      const ok = await sidecar.connect({ baseUrl, token });
      if (ok) await catalog.refresh();
    },
    [sidecar, catalog],
  );

  const { exportJson, exportHtml, exportMd } = useExportHandlers({
    state,
    source,
    screenId,
    screenName,
    screens: catalog.screens,
    specsById: catalog.specsById,
    sidecar,
    locale: LOCALE,
  });

  useKeyboardShortcuts({
    onDelete: () => selectedItemNo && dispatch({ type: "delete", itemNo: selectedItemNo }),
    onToggleTool: () => setTool((t) => (t === "select" ? "add" : "select")),
    onEscape: () => setSelectedItemNo(null),
  });

  // Memoized: rebuilding this (spread + map + resolveLocalized per spec) in the
  // render body would re-run on every dispatch — including the move/resize
  // dispatched per pointermove during a drag — and its fresh identity would
  // needlessly re-render SpecForm each time.
  const existingSpecOptions = useMemo(
    () =>
      [...catalog.specsById.values()].map((s) => ({
        id: s.id,
        title: resolveLocalized(s.title, LOCALE) || s.id,
      })),
    [catalog.specsById],
  );

  return (
    <div className="app">
      <Toolbar
        source={source}
        doc={state.doc}
        tool={tool}
        reindexMode={reindexMode}
        onLoadImage={handleLoadImage}
        onImportJson={handleImportJson}
        onDetectSvg={handleDetectSvg}
        onSetTool={setTool}
        onReindex={() => dispatch({ type: "reindex", mode: reindexMode })}
        onSetReindexMode={setReindexMode}
      />
      {importError && <p className="import-error">{importError}</p>}
      <div className="body">
        {source ? (
          <EditorCanvas
            source={source}
            doc={state.doc}
            dispatch={dispatch}
            selectedItemNo={selectedItemNo}
            onSelect={setSelectedItemNo}
            tool={tool}
          />
        ) : (
          <EmptyState onLoadImage={handleLoadImage} />
        )}
        <aside className="side">
          <ItemListPanel
            doc={state.doc}
            selectedItemNo={selectedItemNo}
            onSelect={setSelectedItemNo}
            onSetLabel={(itemNo, label) => dispatch({ type: "setLabel", itemNo, label })}
            onDelete={(itemNo) => dispatch({ type: "delete", itemNo })}
          />
          {selectedItemNo && (
            <SpecForm
              itemNo={selectedItemNo}
              locale={LOCALE}
              existingSpecs={existingSpecOptions}
              onPendingSpecBuilt={handlePendingSpecBuilt}
              onExistingSpecSelected={handleExistingSpecSelected}
            />
          )}
          <ScreenPicker
            screens={catalog.screens}
            screenId={screenId}
            screenName={screenName}
            locale={LOCALE}
            onChangeScreenId={setScreenId}
            onChangeScreenName={setScreenName}
          />
          <SidecarPanel
            connected={sidecar.connected}
            connecting={sidecar.connecting}
            error={sidecar.error}
            onConnect={(baseUrl, token) => void handleSidecarConnect(baseUrl, token)}
          />
          <ExportPanel
            disabled={!source || !screenId}
            onExportJson={() => void exportJson()}
            onExportHtml={() => void exportHtml()}
            onExportMd={() => void exportMd()}
          />
        </aside>
      </div>
    </div>
  );
}
