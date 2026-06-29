---
title: Install the Extension
description: How to build and load the Specpin browser extension from source.
---

The Specpin extension is not yet published to browser web stores. You must build it from source and load it as an unpacked extension.

## Prerequisites

- Node >= 20
- pnpm 10

## Build the extension

From the Specpin repository root:

```bash
pnpm install
pnpm build
```

Then build the extension for your browser:

```bash
# Chrome (Manifest V3)
pnpm --filter @specpin/extension build

# Firefox (Manifest V2)
pnpm --filter @specpin/extension build:firefox
```

The Chrome output lands in `apps/extension/.output/chrome-mv3`.  
The Firefox output lands in `apps/extension/.output/firefox-mv2`.

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the directory `apps/extension/.output/chrome-mv3`

The extension appears in your toolbar. Pin it for quick access.

## Load in Firefox

1. Open `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on...**
4. Select any file inside `apps/extension/.output/firefox-mv2` (e.g., `manifest.json`)

The extension loads temporarily and will disappear when you restart Firefox. Re-load it from `about:debugging` as needed.

:::note
Store links (Chrome Web Store, Firefox Add-ons) will be added here once Specpin is published.
:::

## Next steps

Now that the extension is installed, [get started with your first connection](/guide/getting-started/).
