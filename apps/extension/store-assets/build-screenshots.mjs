#!/usr/bin/env node
// Build Chrome/Firefox Web Store hero screenshots for Specpin.
//
// Each shot is a 1280x800 composite: a branded teal panel on the left
// (logo, headline, subtext, three bullets) and a macOS browser frame on
// the right holding a product screenshot. It mirrors the hand-made
// screenshot-1-tooltip-1280x800.png so the whole set looks like one family.
//
// Workflow:
//   1. Capture each raw product shot (see docs/chrome-web-store-listing.md
//      "Screenshot shot list") and drop it in ./raw/<id>.png
//      e.g. raw/screenshot-2-display-modes.png
//   2. Run: node build-screenshots.mjs
//   3. Get <id>.svg + <id>-1280x800.png + <id>-640x400.png per shot.
//
// A shot with no raw capture yet renders a labelled drop-zone placeholder,
// so the frame can be reviewed before the screenshots exist.
//
// Requires: rsvg-convert (librsvg) on PATH.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const RAW = join(DIR, "raw");

// ---- Brand tokens (from apps/extension/designs/design-tokens.json) ----
const BRAND = "#2DD4BF";
const HL = "#6EE7D6"; // headline highlight (lighter teal, matches shot 1)
const TITLEBAR = "#1F2937";
const FONT = "Liberation Sans, DejaVu Sans, Arial, sans-serif";

// ---- Canvas / layout constants (measured off shot 1) ----
const W = 1280;
const H = 800;
const PAD = 56; // left content x-origin
const WIN = { x: 491, top: 99, right: 1256, bar: 40 }; // browser frame
const WIN_W = WIN.right - WIN.x;
const CONTENT_Y = WIN.top + WIN.bar; // screenshot area top
const CONTENT_H = H - CONTENT_Y; // bleeds off bottom

// ---- Shot definitions ----
// headline: array of lines; each line is an array of runs {t, hl?}
const SHOTS = [
  {
    id: "screenshot-2-display-modes",
    // Whole-window capture (spec popover + Chrome side panel together) is landscape;
    // fit it whole so the side panel is not cropped, instead of top-slice-filling.
    fit: "contain",
    headline: [[{ t: "Read specs" }], [{ t: "your way", hl: true }]],
    subtext: [
      "Switch between a hover tooltip, Chrome's side",
      "panel, and a draggable modal, one click or",
      "Alt+Shift+M.",
    ],
    bullets: [
      "Three display modes, one shortcut",
      "Side panel with live auto-refresh",
      "Draggable modal, right over the page",
    ],
  },
  {
    id: "screenshot-3-capture",
    headline: [[{ t: "Author specs" }], [{ t: "where they live", hl: true }]],
    subtext: [
      "Toggle capture with Alt+Shift+C, click an",
      "element, and write its spec in place, no",
      "context switch.",
    ],
    bullets: [
      "Click-to-capture on any element",
      "Markdown toolbar and per-locale tabs",
      "Saved straight to your repo's .specs/",
    ],
  },
  {
    id: "screenshot-4-connections",
    headline: [[{ t: "Many projects," }], [{ t: "one extension", hl: true }]],
    subtext: [
      "Connect several projects at once and let",
      "Specpin route the right specs to each page",
      "by origin.",
    ],
    bullets: [
      "Per-project enable toggles",
      "Sidecar and local source badges",
      "Routed to each page automatically",
    ],
  },
  {
    id: "screenshot-5-options",
    headline: [[{ t: "Yours to" }], [{ t: "tune", hl: true }]],
    subtext: [
      "System, Light, or Dark themes, a multilingual",
      "interface, default surface, and per-project",
      "control.",
    ],
    bullets: [
      "System / Light / Dark themes",
      "EN + VI + JA interface",
      "Per-project defaults and control",
    ],
  },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// White map-pin logo on a teal squircle, scaled to `size` px at (x,y).
function logo(x, y, size) {
  const s = size / 512;
  return `<g transform="translate(${x},${y}) scale(${s})">
    <rect width="512" height="512" rx="112" fill="${BRAND}"/>
    <path d="M256 401.5 C252.2 349.3 204.9 297.2 175.5 245 A100 100 0 1 1 336.5 245 C307.1 297.2 259.8 349.3 256 401.5 Z" fill="#fff"/>
    <circle cx="256" cy="185" r="64" fill="${BRAND}"/>
    <g fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">
      <path d="M241 155 H226 V170"/><path d="M271 155 H286 V170"/>
      <path d="M226 200 V215 H241"/><path d="M286 200 V215 H271"/>
    </g>
  </g>`;
}

function headlineSvg(lines) {
  const size = 50;
  const lh = 61;
  let y = 300;
  const out = [];
  for (const line of lines) {
    const spans = line
      .map((r) => `<tspan fill="${r.hl ? HL : "#fff"}">${esc(r.t)}</tspan>`)
      .join("");
    out.push(
      `<text x="${PAD}" y="${y}" xml:space="preserve" font-family="${FONT}" font-size="${size}" font-weight="800" letter-spacing="-1">${spans}</text>`,
    );
    y += lh;
  }
  return { svg: out.join("\n"), endY: y };
}

function subtextSvg(lines, startY) {
  const lh = 27;
  let y = startY;
  const out = lines.map((l) => {
    const t = `<text x="${PAD}" y="${y}" font-family="${FONT}" font-size="18" fill="#ffffff" fill-opacity="0.82">${esc(l)}</text>`;
    y += lh;
    return t;
  });
  return { svg: out.join("\n"), endY: y };
}

function bulletsSvg(items, startY) {
  const gap = 50;
  return items
    .map((txt, i) => {
      const cy = startY + i * gap;
      const cx = PAD + 15;
      return `<g>
      <circle cx="${cx}" cy="${cy}" r="15" fill="${BRAND}"/>
      <path d="M${cx - 7} ${cy} l5 5 l9 -10" fill="none" stroke="#04221E" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="${PAD + 42}" y="${cy + 6}" font-family="${FONT}" font-size="16.5" font-weight="700" fill="#fff">${esc(txt)}</text>
    </g>`;
    })
    .join("\n");
}

function screenshotSlot(shot) {
  const id = shot.id;
  const raw = join(RAW, `${id}.png`);
  if (existsSync(raw)) {
    const b64 = readFileSync(raw).toString("base64");
    // slice = fill + crop (default); contain = fit whole (letterbox on white window bg)
    const par = shot.fit === "contain" ? "xMidYMin meet" : "xMidYMin slice";
    return `<image href="data:image/png;base64,${b64}" x="${WIN.x + 1}" y="${CONTENT_Y}" width="${WIN_W - 2}" height="${CONTENT_H}" preserveAspectRatio="${par}" clip-path="url(#shotClip)"/>`;
  }
  // Placeholder drop-zone
  const cx = WIN.x + WIN_W / 2;
  const cy = CONTENT_Y + 160;
  return `<g clip-path="url(#shotClip)">
    <rect x="${WIN.x + 1}" y="${CONTENT_Y}" width="${WIN_W - 2}" height="${CONTENT_H}" fill="#EAF6F3"/>
    <rect x="${WIN.x + 28}" y="${CONTENT_Y + 28}" width="${WIN_W - 58}" height="300" rx="10" fill="none" stroke="#9CCFC6" stroke-width="2" stroke-dasharray="8 7"/>
    <text x="${cx}" y="${cy}" text-anchor="middle" font-family="${FONT}" font-size="20" font-weight="700" fill="#2C6E64">Drop capture here</text>
    <text x="${cx}" y="${cy + 30}" text-anchor="middle" font-family="${FONT}" font-size="14" fill="#5C8F87">raw/${id}.png</text>
  </g>`;
}

function buildSvg(shot) {
  const head = headlineSvg(shot.headline);
  const sub = subtextSvg(shot.subtext, head.endY + 6);
  const bulletsY = sub.endY + 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#0B7C70"/>
      <stop offset="1" stop-color="#0FA08F"/>
    </linearGradient>
    <radialGradient id="glowTL" cx="0.14" cy="0.12" r="0.55">
      <stop offset="0" stop-color="#5EE6D3" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#5EE6D3" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowBL" cx="0.2" cy="0.95" r="0.5">
      <stop offset="0" stop-color="#2DD4BF" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#2DD4BF" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="shotClip">
      <rect x="${WIN.x + 1}" y="${CONTENT_Y}" width="${WIN_W - 2}" height="${CONTENT_H}"/>
    </clipPath>
    <filter id="winShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="30" flood-color="#03211D" flood-opacity="0.35"/>
    </filter>
  </defs>

  <!-- background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glowTL)"/>
  <rect width="${W}" height="${H}" fill="url(#glowBL)"/>
  <circle cx="120" cy="90" r="360" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="2"/>
  <circle cx="90" cy="720" r="300" fill="#ffffff" fill-opacity="0.03"/>

  <!-- left brand panel -->
  ${logo(PAD, 178, 54)}
  <text x="${PAD + 70}" y="214" font-family="${FONT}" font-size="30" font-weight="700" fill="#fff">Specpin</text>
  ${head.svg}
  ${sub.svg}
  ${bulletsSvg(shot.bullets, bulletsY)}

  <!-- browser frame -->
  <g filter="url(#winShadow)">
    <path d="M${WIN.x} ${WIN.top + 14} a14 14 0 0 1 14 -14 h${WIN_W - 28} a14 14 0 0 1 14 14 V${H} H${WIN.x} Z" fill="#fff"/>
    <path d="M${WIN.x} ${WIN.top + 14} a14 14 0 0 1 14 -14 h${WIN_W - 28} a14 14 0 0 1 14 14 V${CONTENT_Y} H${WIN.x} Z" fill="${TITLEBAR}"/>
    <circle cx="${WIN.x + 24}" cy="${WIN.top + 20}" r="6" fill="#FF5F57"/>
    <circle cx="${WIN.x + 44}" cy="${WIN.top + 20}" r="6" fill="#FEBC2E"/>
    <circle cx="${WIN.x + 64}" cy="${WIN.top + 20}" r="6" fill="#28C840"/>
  </g>
  ${screenshotSlot(shot)}
</svg>`;
}

// ---- Emit ----
for (const shot of SHOTS) {
  const svg = buildSvg(shot);
  const svgPath = join(DIR, `${shot.id}.svg`);
  writeFileSync(svgPath, svg);
  const has = existsSync(join(RAW, `${shot.id}.png`));
  for (const [w, h] of [
    [1280, 800],
    [640, 400],
  ]) {
    const out = join(DIR, `${shot.id}-${w}x${h}.png`);
    execFileSync("rsvg-convert", ["-w", String(w), "-h", String(h), svgPath, "-o", out]);
  }
  console.log(`${has ? "composited" : "placeholder"}  ${shot.id}`);
}
console.log(
  `\n${SHOTS.length} shot(s) built. Drop raw captures in raw/<id>.png and re-run to composite.`,
);
