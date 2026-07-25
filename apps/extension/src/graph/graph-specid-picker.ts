import { t } from "../i18n/index.js";
import type { KnownSpecId } from "../shared/messaging.js";

// The specId field shared by every node/edge form (Track C, C2): a filterable
// picker over the project's known spec ids (C2's data-layer feed, extended
// onto GET_FLOWS_SCREENS -- see messaging.ts's ProjectFlowsScreens.specs),
// plus a "none" option. Pending (unpinned, no-fingerprint) specs are valid
// targets but labeled separately, per the phase's requirement, so the author
// knows a pending link won't highlight on-page until it is bound to an
// element. Never blocks editing when the list is empty (an always-present
// "none" option + an empty, harmlessly-inert filter).

const NONE_VALUE = "";

export interface SpecIdPickerHandle {
  getValue(): string | null;
  setValue(id: string | null): void;
  /** Replace the known spec list (e.g. after a project switch). */
  setSpecs(specs: KnownSpecId[]): void;
  /** Disable both controls (a non-manual transition's specId isn't editable
   *  here, mirroring the guard/role inputs it renders alongside). */
  setDisabled(disabled: boolean): void;
}

function optionLabel(spec: KnownSpecId): string {
  return spec.pending ? t("graph.edit.specPending", { id: spec.id }) : spec.id;
}

/** Mount the specId picker into `container`. `onChange` fires whenever the
 *  selected value changes (filtering the list does not fire it). */
export function mountSpecIdPicker(
  container: HTMLElement,
  onChange: () => void,
): SpecIdPickerHandle {
  let specs: KnownSpecId[] = [];
  let selected: string | null = null;

  const filterInput = document.createElement("input");
  filterInput.type = "search";
  filterInput.className = "edit-form-specid-filter";
  filterInput.placeholder = t("graph.edit.specIdFilterPlaceholder");

  const select = document.createElement("select");
  select.className = "edit-form-specid-select";

  function renderOptions(): void {
    select.replaceChildren();
    const noneOpt = document.createElement("option");
    noneOpt.value = NONE_VALUE;
    noneOpt.textContent = t("graph.edit.specIdNone");
    select.appendChild(noneOpt);

    const query = filterInput.value.trim().toLowerCase();
    const visible = specs.filter(
      (s) => s.id === selected || !query || s.id.toLowerCase().includes(query),
    );
    for (const spec of visible) {
      const opt = document.createElement("option");
      opt.value = spec.id;
      opt.textContent = optionLabel(spec);
      select.appendChild(opt);
    }
    select.value = selected ?? NONE_VALUE;
  }

  filterInput.addEventListener("input", renderOptions);
  select.addEventListener("change", () => {
    selected = select.value === NONE_VALUE ? null : select.value;
    onChange();
  });

  container.append(filterInput, select);
  renderOptions();

  return {
    getValue: () => selected,
    setValue(id) {
      selected = id;
      renderOptions();
    },
    setSpecs(next) {
      specs = next;
      renderOptions();
    },
    setDisabled(disabled) {
      filterInput.disabled = disabled;
      select.disabled = disabled;
    },
  };
}
