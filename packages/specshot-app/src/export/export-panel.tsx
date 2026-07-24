/**
 * Export action buttons: shot JSON + spec sheet HTML/MD. Purely presentational
 * — the actual building/downloading lives in `export-actions.ts`; this
 * component only wires clicks, kept separate so `app.tsx` stays thin.
 */
export interface ExportPanelProps {
  disabled: boolean;
  onExportJson: () => void;
  onExportHtml: () => void;
  onExportMd: () => void;
}

export function ExportPanel({
  disabled,
  onExportJson,
  onExportHtml,
  onExportMd,
}: ExportPanelProps) {
  return (
    <section className="export-panel">
      <span className="group-label">Export</span>
      <button type="button" disabled={disabled} onClick={onExportJson}>
        Shot JSON
      </button>
      <button type="button" disabled={disabled} onClick={onExportHtml}>
        Spec sheet HTML
      </button>
      <button type="button" disabled={disabled} onClick={onExportMd}>
        Spec sheet MD
      </button>
    </section>
  );
}
