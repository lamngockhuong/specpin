import { t } from "../i18n/index.js";
import { confirmDialog } from "./dialog.js";
import { openGuideEditor } from "./guide-editor.js";
import { createIcon, createIconButton } from "./icons.js";
import {
  type GuideMutationResult,
  type GuidesForOrigin,
  type SpecsForOrigin,
  sendToBackground,
  type TaggedGuide,
  type WriteTarget,
} from "./messaging.js";

// The shared Guides section for the popup + side panel: a launch list (start the
// default tour, or any curated guide) plus create/edit/delete that open the shared
// editor. Both surfaces mount it identically (the two copies are provably the same,
// so it is one module, not inlined twice), differing only in the `launch` thunk -
// the popup closes itself on launch so the tour is unobscured; the side panel stays
// open. No spec/guide text reaches innerHTML (names via textContent), so it is
// injection-safe on the extension page.

export interface GuideSectionContext {
  origin: string;
  enabled: boolean;
  locale: string;
  defaultLocale?: string;
}

export interface GuideSectionDeps {
  /** Launch a guide in the active tab; `steps` omitted runs the default tour. The
   *  host decides whether to close (popup) or stay open (side panel). */
  launch(steps: string[] | undefined, name: string): void;
}

export interface GuideSectionHandle {
  refresh(ctx: GuideSectionContext): Promise<void>;
}

export function mountGuideSection(
  container: HTMLElement,
  deps: GuideSectionDeps,
): GuideSectionHandle {
  let ctx: GuideSectionContext | null = null;

  async function refresh(next: GuideSectionContext): Promise<void> {
    ctx = next;
    // List controls are hidden when Specpin is off, like the spec list (the tour
    // cannot render specs while disabled).
    if (!next.enabled) {
      container.hidden = true;
      container.replaceChildren();
      return;
    }

    // Build into a detached fragment and swap it in one shot at the end. Clearing
    // the live container up front would leave #guides empty during the async
    // guides fetch, collapsing the section and jolting everything below it (the
    // filters, spec list, ...) up then back down - a visible flicker on every
    // refresh, including a filter toggle that runs the whole refresh().
    const frag = document.createDocumentFragment();

    const header = document.createElement("div");
    header.className = "guides-head";
    const label = document.createElement("span");
    label.className = "guides-title";
    label.textContent = t("guide.sectionTitle");
    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "link guide-new";
    // Icon + label (was a literal "+" prefix in the string). The section rebuilds
    // on every refresh, so the icon is re-created with the label each time.
    const newLabel = document.createElement("span");
    newLabel.textContent = t("guide.newGuide");
    newBtn.append(createIcon(document, "plus", 12), newLabel);
    newBtn.addEventListener("click", () => void openEditor());
    header.append(label, newBtn);
    frag.appendChild(header);

    // Default tour: always available (walks all matched specs in default order).
    const startDefault = document.createElement("button");
    startDefault.type = "button";
    startDefault.className = "guides-default";
    startDefault.textContent = t("guide.startDefault");
    startDefault.addEventListener("click", () => deps.launch(undefined, t("guide.defaultName")));
    frag.appendChild(startDefault);

    let guides: TaggedGuide[] = [];
    try {
      const res = await sendToBackground<GuidesForOrigin>({
        type: "GET_GUIDES_FOR_ORIGIN",
        origin: next.origin,
      });
      guides = res.guides;
    } catch {
      // Background not ready: just show the default-tour button.
    }

    // A newer refresh started while we awaited: it owns the container now, so drop
    // this stale render rather than swapping outdated guides back in.
    if (ctx !== next) return;

    const list = document.createElement("ul");
    list.className = "guides-list";
    if (guides.length === 0) {
      const empty = document.createElement("li");
      empty.className = "muted";
      empty.textContent = t("guide.noGuides");
      list.appendChild(empty);
    } else {
      for (const guide of guides) list.appendChild(guideRow(guide));
    }
    frag.appendChild(list);

    container.hidden = false;
    container.replaceChildren(frag);
  }

  function guideRow(guide: TaggedGuide): HTMLElement {
    return guideRowElement(guide, {
      onStart: () => deps.launch(guide.steps, guide.name),
      onEdit: () => void openEditor(guide),
      onDelete: () => void remove(guide),
    });
  }

  async function openEditor(guide?: TaggedGuide): Promise<void> {
    if (!ctx) return;
    // The editor needs the page specs (curation pool) + writable targets; fetch
    // them on demand so the launch list stays cheap.
    const [specsRes, targets] = await Promise.all([
      sendToBackground<SpecsForOrigin>({ type: "GET_SPECS_FOR_ORIGIN", origin: ctx.origin }),
      sendToBackground<WriteTarget[]>({ type: "GET_WRITE_TARGETS", origin: ctx.origin }),
    ]);
    const current = ctx;
    openGuideEditor({
      origin: current.origin,
      specs: specsRes.specs,
      targets,
      guide,
      locale: current.locale,
      defaultLocale: current.defaultLocale,
      onSaved: () => refresh(current),
    });
  }

  async function remove(guide: TaggedGuide): Promise<void> {
    if (!ctx) return;
    const ok = await confirmDialog({
      message: t("guide.deleteConfirm", { name: guide.name }),
      danger: true,
    });
    if (!ok) return;
    const res = await sendToBackground<GuideMutationResult>({
      type: "DELETE_GUIDE",
      scope: guide.scope,
      id: guide.id,
      targetId: guide.connectionId,
      origin: ctx.origin,
    });
    if (res.ok) await refresh(ctx);
  }

  return { refresh };
}

/** One guide row (`guides-item`): name (+ a Personal badge when `scope` is
 *  personal) followed by the action buttons whose handlers are supplied. Shared
 *  by the popup/side-panel launch list (Start + Edit + Delete) and the Options
 *  team-guides manager (Delete only), so the row markup + classes live in one
 *  place. `guide` is any shape carrying a display `name` and optional `scope`. */
export function guideRowElement(
  guide: { name: string; scope?: "team" | "personal" },
  handlers: { onStart?: () => void; onEdit?: () => void; onDelete: () => void },
): HTMLElement {
  const li = document.createElement("li");
  li.className = "guides-item";
  const name = document.createElement("span");
  name.className = "guides-name";
  name.textContent = guide.name;
  if (guide.scope === "personal") {
    const badge = document.createElement("span");
    badge.className = "src src-manual";
    badge.textContent = t("guide.personal");
    name.appendChild(badge);
  }
  li.appendChild(name);
  // Actions render as icon buttons; the text label moves to aria-label + title so
  // the screen-reader name and hover tooltip are preserved. Delete keeps `.danger`
  // (its color rides currentColor, so the trash icon turns danger-red too).
  if (handlers.onStart) {
    li.appendChild(
      createIconButton(
        document,
        "guides-start icon-btn",
        "play",
        t("guide.start"),
        handlers.onStart,
      ),
    );
  }
  if (handlers.onEdit) {
    li.appendChild(
      createIconButton(document, "link icon-btn", "pencil", t("guide.edit"), handlers.onEdit),
    );
  }
  li.appendChild(
    createIconButton(
      document,
      "link danger icon-btn",
      "trash",
      t("guide.delete"),
      handlers.onDelete,
    ),
  );
  return li;
}
