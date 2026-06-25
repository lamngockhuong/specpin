// Heuristics for detecting auto-generated DOM ids and class names so capture
// never anchors a fingerprint on something that changes every render.

const GENERATED_ID_PATTERNS: RegExp[] = [
  /^:r[0-9a-z]+:$/i, // React useId, e.g. ":r1:"
  /[«»]/, // React useId server/dev rendering variants
  /^css-[0-9a-z]{4,}$/i, // emotion
  /^sc-[0-9a-z]{4,}$/i, // styled-components
  /^mui-\d+$/i, // MUI
  /^(radix|headlessui|reach|downshift|aria)-/i, // common headless libs
  /^:[a-z0-9]+:$/i, // generic colon-wrapped token
  /^[a-z][\w-]*[-_][0-9a-f]{6,}$/i, // prefix + long hash suffix
  /^[0-9a-f]{8,}$/i, // bare hash
];

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
