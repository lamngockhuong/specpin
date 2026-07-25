import type { KnownSpecId } from "../shared/messaging.js";
import {
  type ScreenFieldValues,
  showCreateScreen,
  showEditScreen,
} from "./graph-edit-form-screen.js";
import { type StateFieldValues, showCreateState, showEditState } from "./graph-edit-form-state.js";
import {
  showCreateTransition,
  showEditTransition,
  type TransitionFieldValues,
} from "./graph-edit-form-transition.js";
import type { EditOpResult } from "./graph-edit-mode.js";

// The C2 side form: type-aware fields for the selected node/edge (or a
// brand-new one), replacing C1's window.prompt() placeholders. This file is
// just the public handle + orchestration; the actual field layout per
// node/edge type lives in graph-edit-form-screen/-state/-transition.ts (split
// out to hold every file under the plan's 200-line budget), and the shared DOM
// builders (LocalizedString rows, specId picker, field row/reset/error
// helpers) in graph-localized-editor.ts / graph-specid-picker.ts /
// graph-edit-form-shared.ts. The caller (graph-edit-wiring.ts) owns WHEN the
// form opens/closes and which mode.addNode/updateNode call a submission maps
// to -- this module never touches a ScreensEditHandle/FlowsEditHandle
// directly, only plain field values.
//
// Edit forms apply LIVE (every valid field change calls `onChange` and shows
// its result inline); create forms apply on an explicit submit click, since an
// id must be typed and validated as a whole before there is anything to add.

export type { ScreenFieldValues, StateFieldValues, TransitionFieldValues };

export interface EditFormDeps {
  /** The current project's known spec ids (C2 picker feed), read fresh each
   *  time a form opens so a project switch is always reflected. */
  knownSpecs(): KnownSpecId[];
  /** The graph panel's current content locale, seeded as the first row of any
   *  brand-new LocalizedString field. */
  locale(): string;
}

export interface EditFormHandle {
  hide(): void;
  showCreateScreen(onCreate: (id: string, values: ScreenFieldValues) => EditOpResult): void;
  showEditScreen(
    current: ScreenFieldValues,
    onChange: (values: ScreenFieldValues) => EditOpResult,
  ): void;
  showCreateState(onCreate: (id: string, values: StateFieldValues) => EditOpResult): void;
  showEditState(
    current: StateFieldValues,
    onChange: (values: StateFieldValues) => EditOpResult,
  ): void;
  showCreateTransition(onCreate: (values: TransitionFieldValues) => EditOpResult): void;
  showEditTransition(
    current: TransitionFieldValues,
    editable: boolean,
    onChange: (values: TransitionFieldValues) => EditOpResult,
  ): void;
}

/** Mount the side form into `container`. Rebuilt on every show* call -- the
 *  form has no identity across selections, only the container persists. */
export function mountEditForm(container: HTMLElement, deps: EditFormDeps): EditFormHandle {
  return {
    hide() {
      container.replaceChildren();
      container.hidden = true;
    },
    showCreateScreen: (onCreate) => showCreateScreen(container, deps, onCreate),
    showEditScreen: (current, onChange) => showEditScreen(container, deps, current, onChange),
    showCreateState: (onCreate) => showCreateState(container, deps, onCreate),
    showEditState: (current, onChange) => showEditState(container, deps, current, onChange),
    showCreateTransition: (onCreate) => showCreateTransition(container, deps, onCreate),
    showEditTransition: (current, editable, onChange) =>
      showEditTransition(container, deps, current, editable, onChange),
  };
}
