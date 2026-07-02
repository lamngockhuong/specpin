---
title: Install the Extension
description: Install Specpin for Chrome from the Chrome Web Store, or build it from source.
---

Specpin for Chrome is available on the Chrome Web Store. Firefox users build from source for now.

## Install from the Chrome Web Store

Install Specpin directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/specpin/kkfmoieoahdjneagognaoedggkiiolkn). The extension appears in your toolbar. Pin it for quick access, then [get started with your first connection](/guide/getting-started/).

## Build from source (Firefox, or development)

For Firefox, or to hack on the extension, build it from source and load it as an unpacked extension.

### Prerequisites

- Node >= 20
- pnpm 10

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
Firefox Add-ons publication is coming soon. Until then, the temporary add-on above is the way to run Specpin on Firefox.
:::

## Next steps

Now that the extension is installed, [get started with your first connection](/guide/getting-started/).
