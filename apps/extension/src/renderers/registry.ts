import type { DisplayMode, Manifest, Spec } from "@specpin/spec-schema";
import type { SpecRenderer } from "./renderer.js";
import { SidebarRenderer } from "./sidebar.js";
import { TooltipRenderer } from "./tooltip.js";

type RendererFactory = (doc: Document) => SpecRenderer;

// DisplayMode -> renderer. Phase 1 implements tooltip + sidebar; the other three
// modes resolve through here and fall back to tooltip with a console note.
const FACTORIES: Partial<Record<DisplayMode, RendererFactory>> = {
  tooltip: (doc) => new TooltipRenderer(doc),
  sidebar: (doc) => new SidebarRenderer(doc),
};

/** Modes that have a real renderer, in cycle order for the keyboard toggle. */
export const IMPLEMENTED_MODES: DisplayMode[] = ["tooltip", "sidebar"];

/** Per-spec mode resolution: spec preference, else manifest default, else tooltip. */
export function resolveMode(spec: Spec, manifest: Manifest | null): DisplayMode {
  return spec.preferredDisplayMode ?? manifest?.settings?.defaultDisplayMode ?? "tooltip";
}

export function isImplemented(mode: DisplayMode): boolean {
  return mode in FACTORIES;
}

/** Create a renderer for a mode, falling back to tooltip for unimplemented modes. */
export function createRenderer(mode: DisplayMode, doc: Document = document): SpecRenderer {
  const factory = FACTORIES[mode];
  if (factory) return factory(doc);
  console.info(`[specpin] display mode "${mode}" is not implemented yet; using tooltip`);
  return new TooltipRenderer(doc);
}
