// @specpin/specshot-core: headless, framework-free authoring core for
// screenshot-annotation "specshot" — the MarkDoc model, numbering, viewport
// transform, interaction geometry, best-effort SVG detection, export string
// builders, and the ShotConfig/pending-Spec builders. Zero React, zero
// extension deps; the only dependency is @specpin/spec-schema.

// canvas geometry
export {
  applyDrag,
  applyResize,
  boxFromPoints,
  clampToImage,
  defaultBoxAt,
  type HandleId,
  normalize,
} from "./canvas/interactions.js";
export {
  clampScale,
  fitToContainer,
  imageLenToScreen,
  imageToScreen,
  MAX_SCALE,
  MIN_SCALE,
  type Point,
  panBy,
  screenToImage,
  type Viewport,
  zoomAt,
} from "./canvas/viewport.js";
// detect (best-effort SVG element detection)
export { type ClusterOptions, clusterBoxes } from "./detect/cluster.js";
export {
  type ImageKind,
  type ImageSource,
  isSupported,
  loadImageSource,
  SUPPORTED_EXT,
  svgIntrinsicSize,
} from "./detect/image-source.js";
export { parsePathBBox, pointsBBox, type Rect } from "./detect/path-bbox.js";
export {
  type DetectOptions,
  detectFromSvg,
  parseSvgSafely,
} from "./detect/svg-geometry.js";
// export (string builders + download/draw helpers)
export { downloadBlob, downloadText, withExtension } from "./export/download.js";
export { drawAnnotations } from "./export/draw-annotations.js";
export { DRAW_STYLE, labelSize } from "./export/draw-style.js";
export {
  buildSpecSheetData,
  type SpecSheetData,
  type SpecSheetItemStatus,
  type SpecSheetRow,
} from "./export/spec-sheet-data.js";
export { buildSpecSheetHtml, type SpecSheetHtmlOptions } from "./export/spec-sheet-html.js";
export { buildSpecSheetMd, type SpecSheetMdOptions } from "./export/spec-sheet-md.js";
export { exportJson, markDocToJson } from "./export/to-json.js";
export { exportLegend, markDocToLegend, NO_LABEL } from "./export/to-legend.js";
export { exportSvg, markDocToSvg } from "./export/to-svg.js";
// model
export {
  ITEM_NO_PATTERN,
  type ItemNo,
  type ItemValidation,
  isValidItemNo,
  type MarkDoc,
  type MarkItem,
  type ParseResult,
  type Position,
  parseMarkDoc,
  roundCoord,
  serializeMarkDoc,
  validateMarkDoc,
  validateMarkItem,
} from "./model/mark-doc.js";
export {
  compareItemNo,
  contains,
  DEFAULT_BAND,
  nextItemNo,
  readingOrderSort,
  reindexFlat,
  reindexHierarchical,
} from "./model/numbering.js";
// shot + pending-spec builders (new — bridge MarkDoc/author content to spec-schema)
export {
  type BuildShotOptions,
  type BuildShotResult,
  buildShot,
  DEFAULT_SHOT_VERSION,
} from "./shot/build-shot.js";
export {
  type BuildPendingSpecOptions,
  type BuildPendingSpecResult,
  buildPendingSpec,
} from "./spec/build-pending-spec.js";
// state
export type { MarkAction, ReindexMode } from "./state/marks-reducer.js";
export { marksReducer } from "./state/marks-reducer.js";
