/**
 * Shown before any image is loaded: a drop zone + file picker and a short
 * explanation of the skill → app → export workflow.
 */
import { useRef, useState } from "react";

export interface EmptyStateProps {
  onLoadImage: (file: File) => void;
}

export function EmptyState({ onLoadImage }: EmptyStateProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target; the "Choose image…" button below is the keyboard-accessible equivalent
    <div
      className={`empty-state${dragOver ? " drag-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onLoadImage(file);
      }}
    >
      <h2>Load a UI image to start</h2>
      <p>Drag &amp; drop a PNG, JPG, WEBP or SVG here, or</p>
      <button type="button" className="primary" onClick={() => inputRef.current?.click()}>
        Choose image…
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.svg,image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onLoadImage(file);
          e.target.value = "";
        }}
      />
      <p className="hint">
        Then import the <code>number-ui-image</code> skill's JSON, fix the boxes by eye, and export
        PNG / JSON / SVG / legend.
      </p>
    </div>
  );
}
