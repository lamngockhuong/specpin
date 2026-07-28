/** Selectors for the extension's in-page Shadow-DOM surfaces.
 *
 *  The renderers attach with `mode: "open"` (`shared/shadow.ts`), so Playwright's CSS
 *  engine pierces straight through — these are ordinary locators, no `evaluateHandle`
 *  needed.
 *
 *  The host ids are duplicated from the modules that own them (`renderers/tooltip.ts`,
 *  `content/capture-form.ts`, `content/toast.ts`), where they are module-private
 *  constants. Kept in one place here so a renamed host is a single edit rather than a
 *  hunt across spec files. */

/** On-page spec marker drawn by the tooltip renderer, one per matched spec. */
export const BADGE = "#specpin-tooltip-host .badge";

/** The tooltip body. Actions render only once it is pinned (clicked, not hovered). */
export const TOOLTIP = "#specpin-tooltip-host .tip";

/** The tooltip's title element. */
export const TOOLTIP_TITLE = `${TOOLTIP} h4`;

/** The tooltip's Edit action. */
export const TOOLTIP_EDIT = `${TOOLTIP} .pin-act.pin-edit`;

/** The capture/edit form host. Its fields carry stable `#sp-*` ids. */
export const CAPTURE_FORM = "#specpin-capture-host";

/** Where a rejected save reports itself: an inline box inside the capture form,
 *  revealed by `showErrors()` adding `.show` (`content/capture-form.ts`). The `.show`
 *  qualifier matters — the empty box is always in the DOM.
 *
 *  Note this is NOT the toast host: `showToast` is a general-purpose channel that also
 *  carries success messages ("link copied"), so treating any toast as a save failure
 *  would both miss the real error and misfire on unrelated ones. */
export const CAPTURE_FORM_ERRORS = `${CAPTURE_FORM} .errors.show`;
