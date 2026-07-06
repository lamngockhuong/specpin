#!/usr/bin/env node
// Build the Chrome Web Store marquee promo tile (1400x560, 24-bit PNG, no alpha).
// Same teal brand language as promo-tile-440x280 and the hero screenshots.
//
// Run: node build-promo.mjs   ->   marquee-promo-1400x560.png
// Requires: rsvg-convert (librsvg) + ImageMagick `convert` (to flatten alpha to 24-bit).

import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const BRAND = "#2DD4BF";
const HL = "#6EE7D6"; // lighter teal highlight
const FONT = "Liberation Sans, DejaVu Sans, Arial, sans-serif";
const W = 1400;
const H = 560;
const PAD = 90;
const BG = "#0B7C70"; // flatten/backfill color (matches gradient bottom)

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

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#12A594"/>
      <stop offset="1" stop-color="${BG}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.12" cy="0.1" r="0.6">
      <stop offset="0" stop-color="#5EE6D3" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#5EE6D3" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <!-- decorative circles (right side), matching the 440x280 promo tile -->
  <circle cx="1180" cy="70" r="300" fill="#ffffff" fill-opacity="0.06"/>
  <circle cx="1400" cy="520" r="360" fill="#ffffff" fill-opacity="0.05"/>
  <circle cx="1120" cy="470" r="150" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="2"/>

  <!-- logo + wordmark -->
  ${logo(PAD, 80, 96)}
  <text x="${PAD + 122}" y="152" font-family="${FONT}" font-size="62" font-weight="800" fill="#fff">Specpin</text>

  <!-- headline -->
  <text x="${PAD}" y="322" xml:space="preserve" font-family="${FONT}" font-size="60" font-weight="800" letter-spacing="-1" fill="#fff">Pin living business specs</text>
  <text x="${PAD}" y="398" xml:space="preserve" font-family="${FONT}" font-size="60" font-weight="800" letter-spacing="-1" fill="#fff">onto your <tspan fill="${HL}">live web UI</tspan></text>

  <!-- tagline -->
  <text x="${PAD}" y="482" font-family="${FONT}" font-size="27" font-weight="600" fill="#ffffff" fill-opacity="0.86">Git-native  ·  Local-first  ·  Framework-agnostic</text>
</svg>`;

const svgPath = join(DIR, "marquee-promo.svg");
const rawPng = join(DIR, ".marquee-raw.png");
const out = join(DIR, "marquee-promo-1400x560.png");
writeFileSync(svgPath, svg);
execFileSync("rsvg-convert", ["-w", String(W), "-h", String(H), svgPath, "-o", rawPng]);
// Flatten to 24-bit (no alpha), as the store requires.
execFileSync("convert", [rawPng, "-background", BG, "-alpha", "remove", "-alpha", "off", "-type", "TrueColor", out]);
rmSync(rawPng, { force: true });
rmSync(svgPath, { force: true });
console.log("built marquee-promo-1400x560.png (24-bit, no alpha)");
