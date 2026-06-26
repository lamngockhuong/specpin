#!/usr/bin/env node
// Push canonical design tokens into every surface's dual-theme .pen file.
//
// Each <surface>.pen holds ONE layout whose theme-dependent color variables are
// per-theme arrays: value = [{value:<light>, theme:{mode:"light"}},
// {value:<dark>, theme:{mode:"dark"}}]. Shared colors/fonts/radii are scalar.
// design-tokens.json is the single source of truth; this script keeps all four
// files in sync with it. Pencil has no cross-file variable linking, so this is
// the one place that propagates a palette/font change to every design.
//
// Two modes:
//   node sync-tokens.mjs --rebind   Match each variable's CURRENT value(s) to a
//                                   token and write token-bindings.json. Run once
//                                   after merge-themes or after structural edits.
//                                   Reports variables it could not bind.
//   node sync-tokens.mjs            Apply token-bindings.json: rewrite each bound
//                                   variable from the current tokens (theme-scoped
//                                   tokens -> per-theme array; shared -> scalar).
//                                   Run after editing design-tokens.json, then
//                                   ./render.sh.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = new URL("./", import.meta.url);
const tokens = JSON.parse(readFileSync(new URL("design-tokens.json", dir)));
const BINDINGS = new URL("token-bindings.json", dir);

// Surface sources only: <surface>.pen, excluding any *.light.pen / *.dark.pen.
const penFiles = readdirSync(dir).filter(
  (f) => f.endsWith(".pen") && !/\.(light|dark)\.pen$/.test(f),
);

const themeVal = (path, mode) =>
  path.startsWith("theme.")
    ? tokens.themes[mode][path.slice(6)]
    : path.split(".").reduce((o, k) => o[k], tokens);

// Per-theme array for a theme-scoped token; scalar for a shared token.
function tokenValue(path) {
  if (path.startsWith("theme.")) {
    return [
      { value: themeVal(path, "light"), theme: { mode: "light" } },
      { value: themeVal(path, "dark"), theme: { mode: "dark" } },
    ];
  }
  return themeVal(path, "light"); // shared: light==dark
}

// Read a variable's light/dark values whether scalar or per-theme array.
// biome-ignore lint/correctness/noUnusedVariables: unused by --rebind now but kept for tooling
function readPair(def) {
  if (Array.isArray(def.value)) {
    const get = (m) => def.value.find((e) => e.theme?.mode === m)?.value ?? def.value[0]?.value;
    return [get("light"), get("dark")];
  }
  return [def.value, def.value];
}

// Name-based binding: generated variable names are semantic and stable, which
// avoids value collisions (e.g. a light surface white vs the brand-on white).
// Any variable not listed here stays as-is (e.g. overlay-bg is a theme-agnostic
// modal scrim). readPair() above is unused by --rebind now but kept for tooling.
const NAME_MAP = {
  accent: "brand.base",
  "accent-indigo": "brand.base",
  "accent-teal": "brand.base",
  "accent-hover": "brand.hover",
  "accent-on": "brand.on",
  "accent-text": "brand.on",
  "on-accent": "brand.on",
  "accent-glow": "theme.accentGlow",
  "accent-indigo-glow": "theme.accentGlow",
  "accent-teal-glow": "theme.accentGlow",
  "grad-top": "theme.gradTop",
  "grad-bottom": "theme.gradBottom",
  "font-ui": "font.ui",
  "font-mono": "font.mono",
  "radius-card": "radius.card",
  "card-radius": "radius.card",
  "radius-control": "radius.control",
  "control-radius": "radius.control",
  "bg-page": "theme.bg",
  "page-bg": "theme.bg",
  "bg-surface": "theme.surface",
  surface: "theme.surface",
  "bg-elevated": "theme.elevated",
  elevated: "theme.elevated",
  "elevated-bg": "theme.elevated",
  "card-bg": "theme.elevated",
  "input-bg": "theme.elevated",
  "bg-control": "theme.control",
  border: "theme.border",
  "border-hairline": "theme.border",
  "text-primary": "theme.text",
  "text-secondary": "theme.text2",
  "text-muted": "theme.text3",
  "status-green": "theme.successDot",
  "success-bg": "theme.successBg",
  "success-border": "theme.successBorder",
  "success-text": "theme.successText",
  "error-bg": "theme.errorBg",
  "error-border": "theme.errorBorder",
  "error-text": "theme.errorText",
  amber: "theme.warning",
  "amber-border": "theme.warningBorder",
  "amber-bg": "theme.warningBg",
};

if (process.argv.includes("--rebind")) {
  const bindings = {};
  for (const file of penFiles) {
    const doc = JSON.parse(readFileSync(new URL(file, dir)));
    const map = {};
    const unbound = [];
    for (const name of Object.keys(doc.variables ?? {})) {
      if (NAME_MAP[name]) map[name] = NAME_MAP[name];
      else unbound.push(name);
    }
    bindings[file] = map;
    console.log(
      `${file}: bound ${Object.keys(map).length}/${Object.keys(doc.variables ?? {}).length}`,
    );
    if (unbound.length) console.log(`  unbound (left as-is): ${unbound.join(", ")}`);
  }
  writeFileSync(BINDINGS, `${JSON.stringify(bindings, null, 2)}\n`);
  console.log(`\nWrote token-bindings.json. Then run: node sync-tokens.mjs`);
} else {
  if (!existsSync(BINDINGS)) {
    console.error("token-bindings.json missing. Run: node sync-tokens.mjs --rebind");
    process.exit(1);
  }
  const bindings = JSON.parse(readFileSync(BINDINGS));
  let total = 0;
  for (const file of penFiles) {
    const map = bindings[file];
    if (!map) {
      console.warn(`  [warn] ${file}: no bindings, skipped`);
      continue;
    }
    const doc = JSON.parse(readFileSync(new URL(file, dir)));
    let changed = 0;
    for (const [name, path] of Object.entries(map)) {
      const v = doc.variables?.[name];
      if (!v) continue;
      const next = tokenValue(path);
      if (JSON.stringify(v.value) !== JSON.stringify(next)) {
        v.value = next;
        changed++;
      }
    }
    writeFileSync(new URL(file, dir), `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`${file}: ${changed} variable(s) updated`);
    total += changed;
  }
  console.log(`\nDone. ${total} value(s) synced. Run ./render.sh to regenerate PNGs.`);
}
