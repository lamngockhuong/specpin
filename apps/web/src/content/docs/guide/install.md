---
title: Install the Extension
description: Install Specpin from the Chrome Web Store or Firefox Add-ons, or build it from source.
---

Specpin is available on the Chrome Web Store and Firefox Add-ons. You can also build it from source for development.

## Install from the Chrome Web Store

Install Specpin directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/specpin/kkfmoieoahdjneagognaoedggkiiolkn). The extension appears in your toolbar. Pin it for quick access, then [get started with your first connection](/guide/getting-started/).

## Install from Firefox Add-ons

Install Specpin directly from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/specpin/). The extension appears in your toolbar. Pin it for quick access, then [get started with your first connection](/guide/getting-started/).

## Build from source (development)

To hack on the extension, build it from source and load it as an unpacked extension.

### Prerequisites

- Node >= 22
- pnpm 11

### Build the extension

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

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the directory `apps/extension/.output/chrome-mv3`

The extension appears in your toolbar. Pin it for quick access.

### Load in Firefox

1. Open `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on...**
4. Select any file inside `apps/extension/.output/firefox-mv2` (e.g., `manifest.json`)

The extension loads temporarily and will disappear when you restart Firefox. Re-load it from `about:debugging` as needed.

:::note
For everyday use, install from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/specpin/) instead — the temporary add-on above is only for development, since it disappears on restart.
:::

## Next steps

Now that the extension is installed, [get started with your first connection](/guide/getting-started/).
