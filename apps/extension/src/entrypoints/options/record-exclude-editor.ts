import { t } from "../../i18n/index.js";
import { sendToBackground } from "../../shared/messaging.js";

// The per-project auto-capture "Ignored routes" editor, shared by the sidecar
// and local Options rows. Lists the URL globs the recorder must skip as
// removable chips, plus an input to add one. Split out of main.ts (already over
// the file-size budget) so both row builders reuse one implementation.
//
// `connectionId` is the UNIFIED id the SET_RECORD_EXCLUDE handler expects: a
// sidecar uuid, or the `manual:<batchId>` local form (build it with localConnId
// at the call site). No innerHTML -- globs are user text, so every value goes in
// via textContent. `onChanged` re-renders the page after each write.

export function recordExcludeEditor(
  connectionId: string,
  globs: readonly string[],
  onChanged: () => Promise<void>,
): HTMLElement {
  const box = document.createElement("div");
  box.className = "record-exclude";

  const title = document.createElement("div");
  title.className = "record-exclude-title";
  title.textContent = t("options.ignoredRoutes");
  const hint = document.createElement("span");
  hint.className = "record-exclude-hint";
  hint.textContent = t("options.ignoredRoutesHint");
  title.append(hint);
  box.append(title);

  // Every mutation replaces the whole list (the handler trims/de-dupes), then
  // refreshes so the chips re-render from stored truth.
  const commit = (next: string[]): void => {
    void sendToBackground({ type: "SET_RECORD_EXCLUDE", connectionId, globs: next }).then(
      onChanged,
    );
  };

  const list = document.createElement("div");
  list.className = "record-exclude-list";
  if (globs.length === 0) {
    const empty = document.createElement("span");
    empty.className = "record-exclude-empty";
    empty.textContent = t("options.ignoredRoutesEmpty");
    list.append(empty);
  } else {
    for (const glob of globs) {
      const chip = document.createElement("span");
      chip.className = "record-exclude-chip";
      const code = document.createElement("code");
      code.textContent = glob;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "record-exclude-remove";
      remove.textContent = "×"; // ×
      remove.title = t("options.ignoredRoutesRemove");
      remove.addEventListener("click", () => commit(globs.filter((g) => g !== glob)));
      chip.append(code, remove);
      list.append(chip);
    }
  }
  box.append(list);

  const form = document.createElement("form");
  form.className = "record-exclude-add";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = t("options.ignoredRoutesPlaceholder");
  const add = document.createElement("button");
  add.type = "submit";
  add.className = "secondary";
  add.textContent = t("options.ignoredRoutesAdd");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    // A duplicate is a no-op: clear the box so the user sees it was accepted.
    if (globs.includes(value)) {
      input.value = "";
      return;
    }
    commit([...globs, value]);
  });
  form.append(input, add);
  box.append(form);

  return box;
}
