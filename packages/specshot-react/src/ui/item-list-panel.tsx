/**
 * The right-hand list of marks, kept in sync with canvas selection. Click a
 * row to select (highlights its box); edit the label inline; delete a row.
 * Rows are shown in itemNo order for a stable, scannable list.
 */
import type { MarkDoc } from "@specpin/specshot-core";
import { compareItemNo } from "@specpin/specshot-core";
import { useMemo } from "react";

export interface ItemListPanelProps {
  doc: MarkDoc;
  selectedItemNo: string | null;
  onSelect: (itemNo: string) => void;
  onSetLabel: (itemNo: string, label: string) => void;
  onDelete: (itemNo: string) => void;
}

export function ItemListPanel({
  doc,
  selectedItemNo,
  onSelect,
  onSetLabel,
  onDelete,
}: ItemListPanelProps) {
  // Memoized: this panel re-renders on the same doc changes as the canvas, so
  // without this the O(N log N) copy+sort would re-run on every pointermove
  // during a drag.
  const sorted = useMemo(() => [...doc].sort((a, b) => compareItemNo(a.itemNo, b.itemNo)), [doc]);

  return (
    <aside className="item-panel">
      <header className="item-panel-head">
        <span>Marks</span>
        <span className="count">{doc.length}</span>
      </header>
      {doc.length === 0 ? (
        <p className="item-empty">No marks yet. Import JSON, detect from SVG, or add boxes.</p>
      ) : (
        <ul className="item-list">
          {sorted.map((item) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: row selection is a mouse-only affordance mirroring the ported source; the label input and delete button remain independently keyboard-operable
            <li
              key={item.itemNo}
              className={item.itemNo === selectedItemNo ? "selected" : ""}
              onClick={() => onSelect(item.itemNo)}
            >
              <span className="item-no">{item.itemNo}</span>
              <input
                className="item-label"
                value={item.label ?? ""}
                placeholder="(label)"
                onChange={(e) => onSetLabel(item.itemNo, e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                className="item-del"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.itemNo);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
