// Heuristics for detecting auto-generated DOM ids and class names so capture
// never anchors a fingerprint on something that changes every render.

const GENERATED_ID_PATTERNS: RegExp[] = [
  /^:r[0-9a-z]+:$/i, // React useId, e.g. ":r1:"
  /[«»]/, // React useId server/dev rendering variants
  /^css-[0-9a-z]{4,}$/i, // emotion
  /^sc-[0-9a-z]{4,}$/i, // styled-components
  /^mui-\d+$/i, // MUI
  // Common headless / component libs that emit per-mount id prefixes.
  /^(radix|headlessui|reach|downshift|aria|base-ui|ark|chakra|reakit|mantine|nextui|park)-/i,
  /^_r_[0-9a-z]+_$/i, // bare useId with ':' rewritten to '_' (Base UI et al.): _r_s_
  /(?:^|-)_r_[0-9a-z]+_$/i, // same, as a suffix after a lib prefix: base-ui-_r_s_
  /^:[a-z0-9]+:$/i, // generic colon-wrapped token
  /^[a-z][\w-]*[-_][0-9a-f]{6,}$/i, // prefix + long hash suffix
  /^[0-9a-f]{8,}$/i, // bare hash
];

/** Low-volatility structural attributes safe to use as element IDENTITY, in the
 *  selector compound and the capture whitelist. Deliberately excludes STATE
 *  attributes (data-state, aria-expanded, aria-selected), which change at runtime. */
export const IDENTITY_ATTRS = [
  "role",
  "type",
  "name",
  "data-slot",
  "data-part",
  "data-scope",
] as const;

/** True when an id looks framework/library generated and unstable. */
export function isGeneratedId(id: string | null | undefined): boolean {
  if (!id) return false;
  return GENERATED_ID_PATTERNS.some((re) => re.test(id));
}

const GENERATED_CLASS_PATTERNS: RegExp[] = [
  /^css-[0-9a-z]{4,}$/i, // emotion
  /^sc-[a-z]/i, // styled-components generated
  /^[\w-]+_[\w-]+__[0-9a-z]{5,}$/i, // CSS modules: Button_root__a1b2c
  /^[\w-]*[-_][0-9a-f]{6,}$/i, // hashed suffix
];

/** True when a class name looks generated (CSS modules / CSS-in-JS hashes). */
export function isGeneratedClass(cls: string): boolean {
  if (!cls) return true;
  return GENERATED_CLASS_PATTERNS.some((re) => re.test(cls));
}

// Atomic / utility CSS classes. They encode visual STATE and churn constantly,
// so they must never become element identity in a selector. Separate from
// isGeneratedClass, whose contract is unchanged. Rules 1-2 detect the general
// atomic-class SHAPE (variant/arbitrary-value syntax), so they cover any atomic
// framework; rules 3-4 are keyed to Tailwind's prefix vocabulary specifically
// (Tailwind-first: UnoCSS/Windi/Bootstrap presets may not match), chosen so that
// semantic-but-numeric names (heading-1, col-6, step-2) are NOT dropped.
const UTILITY_CLASS_PATTERNS: RegExp[] = [
  /^-?[a-z][a-z-]*:.+$/i, // variant prefix: hover:, md:, dark:, group-hover:
  /^-?[a-z][\w-]*-\[.+\]$/i, // arbitrary value: w-[168px], top-[3px]
  // spacing / sizing scale on a known prefix: px-2, gap-1, w-full, mt-4
  /^-?(?:p[xytblrse]?|m[xytblrse]?|(?:min|max)-[wh]|w|h|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|start|end|size|basis|z)-(?:\d|px|full|auto|none|screen|fit)/i,
  // color scale on a known property prefix: bg-red-1, text-red-6, border-red-3
  /^-?(?:bg|text|border|ring|fill|stroke|from|via|to|divide|outline|decoration|accent|caret|placeholder|shadow)-[a-z]+-\d{1,3}$/i,
];

/** True when a class looks like an atomic/utility class (visual state, not
 *  identity), so the selector builder can drop it from compounds. */
export function isUtilityClass(cls: string): boolean {
  if (!cls) return false;
  return UTILITY_CLASS_PATTERNS.some((re) => re.test(cls));
}
