// @specpin/specshot-app: the full specshot authoring + export experience
// (image canvas, screen picker, spec form, shot export → spec sheet HTML/MD,
// optional sidecar persistence) as one mountable React component. Mounted by the
// extension's `specshot.html` page entrypoint — a chrome-extension:// origin,
// which the sidecar CORS policy accepts (a web origin is rejected). Kept
// host-agnostic (no extension imports) so a standalone web host could be added
// back trivially if a no-extension offline-export need ever appears. All domain
// logic lives in @specpin/specshot-core / @specpin/spec-schema; this package
// only composes the editor primitives from @specpin/specshot-react with
// authoring/export/persist.
export { SpecshotApp } from "./specshot-app.js";
