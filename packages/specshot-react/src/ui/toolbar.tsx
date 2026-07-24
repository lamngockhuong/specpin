/**
 * Top toolbar: load image, import skill JSON, detect-from-SVG (SVG sources
 * only), select/add tool toggle, reindex (flat|hierarchical), and the four
 * exports. JSON/SVG/Legend reuse @specpin/specshot-core's export builders
 * directly (pure reuse, no duplicated logic); PNG export needs a browser
 * canvas render that specshot-core deliberately does not provide, so it is
 * left to an optional host-supplied callback.
 */
import type { ImageSource, MarkDoc, ReindexMode } from "@specpin/specshot-core";
import { exportJson, exportLegend, exportSvg } from "@specpin/specshot-core";
import { useRef } from "react";
import type { Tool } from "../canvas/use-editor-interactions.js";

export interface ToolbarProps {
  source: ImageSource | null;
  doc: MarkDoc;
  tool: Tool;
  reindexMode: ReindexMode;
  onLoadImage: (file: File) => void;
  onImportJson: (file: File) => void;
  onDetectSvg: () => void;
  onSetTool: (tool: Tool) => void;
  onReindex: () => void;
  onSetReindexMode: (mode: ReindexMode) => void;
  /** PNG export is host-owned (needs a browser canvas render); omit to disable the button. */
  onExportPng?: (source: ImageSource, doc: MarkDoc) => void;
}

export function Toolbar(props: ToolbarProps) {
  const { source, doc, tool, reindexMode } = props;
  const imageInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const hasImage = !!source;
  const hasMarks = doc.length > 0;

  const pick = (ref: React.RefObject<HTMLInputElement | null>) => ref.current?.click();

  return (
    <header className="toolbar">
      <strong className="brand">specshot</strong>

      <div className="group">
        <button type="button" onClick={() => pick(imageInput)}>
          Open image
        </button>
        <button type="button" onClick={() => pick(jsonInput)} disabled={!hasImage}>
          Import JSON
        </button>
        <button
          type="button"
          onClick={props.onDetectSvg}
          disabled={source?.kind !== "svg"}
          title="Best-effort — clean up after"
        >
          Detect from SVG
        </button>
      </div>

      <div className="group">
        <button
          type="button"
          className={tool === "select" ? "active" : ""}
          onClick={() => props.onSetTool("select")}
          disabled={!hasImage}
        >
          Select
        </button>
        <button
          type="button"
          className={tool === "add" ? "active" : ""}
          onClick={() => props.onSetTool("add")}
          disabled={!hasImage}
          title="Drag on the image to add a box (A)"
        >
          Add box
        </button>
      </div>

      <div className="group">
        <select
          value={reindexMode}
          onChange={(e) => props.onSetReindexMode(e.target.value as ReindexMode)}
          disabled={!hasMarks}
          aria-label="Reindex mode"
        >
          <option value="hierarchical">Hierarchical</option>
          <option value="flat">Flat</option>
        </select>
        <button type="button" onClick={props.onReindex} disabled={!hasMarks}>
          Reindex
        </button>
      </div>

      <div className="group export-group">
        <span className="group-label">Export</span>
        <button
          type="button"
          onClick={() => source && props.onExportPng?.(source, doc)}
          disabled={!hasImage || !props.onExportPng}
        >
          PNG
        </button>
        <button
          type="button"
          onClick={() => source && exportJson(doc, source.name)}
          disabled={!hasImage}
        >
          JSON
        </button>
        <button type="button" onClick={() => source && exportSvg(source, doc)} disabled={!hasImage}>
          SVG
        </button>
        <button
          type="button"
          onClick={() => source && exportLegend(doc, source.name)}
          disabled={!hasImage}
        >
          Legend
        </button>
      </div>

      <input
        ref={imageInput}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.svg,image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) props.onLoadImage(f);
          e.target.value = "";
        }}
      />
      <input
        ref={jsonInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) props.onImportJson(f);
          e.target.value = "";
        }}
      />
    </header>
  );
}
