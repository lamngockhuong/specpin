// @specpin/specshot-react: presentational React editor UI for specshot
// authoring — canvas viewport + pointer interactions, toolbar, item list, and
// keyboard shortcuts. All geometry, the MarkDoc reducer, numbering, and
// export builders come from @specpin/specshot-core; this package renders and
// forwards MarkAction/callbacks, it owns no business state.

// canvas
export { EditorCanvas, type EditorCanvasProps } from "./canvas/editor-canvas.js";
export { MarksLayer, type MarksLayerProps } from "./canvas/marks-layer.js";
export { type Tool, useEditorInteractions } from "./canvas/use-editor-interactions.js";
// ui
export { EmptyState, type EmptyStateProps } from "./ui/empty-state.js";
export { ItemListPanel, type ItemListPanelProps } from "./ui/item-list-panel.js";
export { Toolbar, type ToolbarProps } from "./ui/toolbar.js";
export { useKeyboardShortcuts } from "./ui/use-keyboard-shortcuts.js";
