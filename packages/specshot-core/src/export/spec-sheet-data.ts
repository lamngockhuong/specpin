/**
 * Shared row-building logic for the spec-sheet HTML/MD string builders: joins
 * a ShotConfig's numbered callouts to their (pending or pinned) Spec by
 * specId, resolves localized text for one locale, and orders rows by itemNo.
 * Kept separate from the HTML/MD builders so neither exceeds the 200-line
 * budget and the join/resolve logic is written once (DRY).
 */
import {
  resolveLocalized,
  resolveLocalizedList,
  type Screen,
  type ShotConfig,
  type Spec,
} from "@specpin/spec-schema";
import { compareItemNo } from "../model/numbering.js";

/** Lifecycle of a callout's linked spec, for display (e.g. a status badge). */
export type SpecSheetItemStatus = "unresolved" | "pending" | "pinned";

export interface SpecSheetRow {
  itemNo: string;
  specId: string | undefined;
  title: string;
  description: string;
  businessRules: string[];
  status: SpecSheetItemStatus;
}

export interface SpecSheetData {
  screenId: string;
  screenName: string;
  /** The screenshot: a data: URL (embedded) or a relative path. */
  image: string;
  rows: SpecSheetRow[];
}

function statusOf(spec: Spec | undefined): SpecSheetItemStatus {
  if (!spec) return "unresolved";
  return spec.fingerprint ? "pinned" : "pending";
}

/** Build the ordered rows + screen header shared by the HTML and MD exporters. */
export function buildSpecSheetData(
  screen: Screen,
  specs: Spec[],
  shot: ShotConfig,
  locale: string,
  defaultLocale?: string,
): SpecSheetData {
  const specById = new Map(specs.map((s) => [s.id, s] as const));
  const rows: SpecSheetRow[] = shot.items
    .slice()
    .sort((a, b) => compareItemNo(a.itemNo, b.itemNo))
    .map((item) => {
      const spec = item.specId ? specById.get(item.specId) : undefined;
      return {
        itemNo: item.itemNo,
        specId: item.specId,
        title: spec ? resolveLocalized(spec.title, locale, defaultLocale) : "",
        description: spec ? resolveLocalized(spec.description, locale, defaultLocale) : "",
        businessRules: spec ? resolveLocalizedList(spec.businessRules, locale, defaultLocale) : [],
        status: statusOf(spec),
      };
    });

  return {
    screenId: screen.id,
    screenName: resolveLocalized(screen.name, locale, defaultLocale) || screen.id,
    image: shot.image,
    rows,
  };
}
