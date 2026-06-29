---
title: Privacy Policy
description: Specpin's privacy and data-handling practices. Local-first, no data collection, no tracking, no remote code.
---

**Last updated**: June 29, 2026

Specpin is committed to protecting your privacy. This policy explains what data the browser extension collects (or does not collect) and how it is used.

## Summary

- ✅ **No personal data collection by default or ever**
- ✅ **No network requests beyond your own local sidecar on `localhost`**
- ✅ **No analytics, behavioral tracking, telemetry, or crash reporting**
- ✅ **No remote code: the extension loads and runs nothing from the network**
- ✅ **Open-source and auditable**

## Data Collection

Specpin does not collect, transmit, sell, or share any personal data. There is no cloud service, no analytics endpoint, and no telemetry. Everything the extension does happens on your machine.

### What we collect

Nothing. Specpin sends no data to us or to any third party. The only network connection it makes is to a sidecar **you run yourself** on `localhost` (see [Network Activity](#network-activity)).

### What we store locally

Specpin stores the following data **only on your device**, via the browser's extension storage:

| Data type | Storage location | Purpose | Synced? |
|-----------|------------------|---------|---------|
| Connection settings (sidecar URL + bearer token, per project) | `browser.storage` | Connect to your local sidecar(s) | No |
| Local project specs | `browser.storage` | Author and view specs without a running sidecar | No |
| Preferences (theme, interface language, display mode, default surface) | `browser.storage` | Remember your UI choices | No |

This data never leaves your device. There is no external storage and no cloud service.

## Browser Permissions

Specpin requests the following permissions. Each is used only for the purpose described.

### `storage` - Store data locally

Stores connection settings, local project specs, and UI preferences. All data stays on your device.

### `activeTab` / `tabs` - Route specs per page

Reads the active tab's origin to route the correct project's specs to each page, and relays spec updates (including live-reload events) from the background service worker to the content scripts of matching tabs.

**What it does NOT do**: send your browsing history anywhere, track the pages you visit, or store your browsing history.

### `alarms` - Keep the connection alive

Runs a one-minute keepalive alarm so the background service worker stays alive to maintain the live-reload (Server-Sent Events) connection to your local sidecar. The browser terminates idle service workers; the alarm wakes it to keep the spec stream connected.

### `contextMenus` - Right-click menu

Adds a "Specpin" submenu to the page right-click menu for quick actions (toggle, capture, display mode).

### `sidePanel` (Chrome only) - Side panel surface

Opens the Specpin surface in Chrome's side panel alongside the page. Firefox uses its built-in `sidebar_action` instead.

### `host_permissions` - `http://127.0.0.1/*`, `http://localhost/*`

Lets the background service worker connect to your local sidecar over `localhost` HTTP and Server-Sent Events to read `.specs/` and receive live-reload updates. Specpin makes **no** requests to any remote host.

## Network Activity

Specpin connects only to a sidecar **you run yourself** (`specpin serve`) on `localhost` (`127.0.0.1` / `localhost`). It communicates over HTTP and Server-Sent Events, authenticated with a bearer token.

| Destination | Used? |
|-------------|-------|
| Your local sidecar (`http://127.0.0.1:<port>`, `http://localhost:<port>`) | ✅ Only when you add a connection |
| Analytics services (Google Analytics, etc.) | ❌ Never |
| Crash/error reporting (Sentry, etc.) | ❌ Never |
| Advertising networks | ❌ Never |
| External APIs or CDNs | ❌ Never |
| Remote code / remote scripts | ❌ Never |

The local sidecar is hardened: it binds to `127.0.0.1` only, requires bearer-token auth, accepts only browser-extension origins via CORS, and confines all writes to your `.specs/` directory. See [Security and Privacy](/concepts/security-and-privacy/) for the full sidecar security model.

## Data Sharing

Specpin does **not** share any data with third parties, advertisers, analytics providers, or other extensions. There is no data to share - nothing is collected.

## Browser Sync

Specpin does not use browser sync storage. Your connection settings, local specs, and preferences are stored in local extension storage on the device where you set them, and are not synced across devices.

## Data Retention and Deletion

All Specpin data lives in your browser's local extension storage until you remove it.

**To delete all extension data:**

1. Open your browser's extensions page (`chrome://extensions` or `about:addons`).
2. Find Specpin and choose **Remove**.
3. All locally stored extension data is deleted immediately.

Your specs themselves are plain JSON files in your repository's `.specs/` directory and are under your control via Git.

## Children's Privacy

Specpin does not collect any data from anyone, including children under 13 (or the equivalent minimum age in your jurisdiction).

## Code Integrity

- **Open-source**: full source at [github.com/lamngockhuong/specpin](https://github.com/lamngockhuong/specpin)
- **Auditable**: anyone can review the code
- **No remote code**: all extension code is bundled and runs locally; nothing is fetched from the network
- **Apache-2.0 license**: free to inspect, modify, and redistribute

## Changes to This Policy

We may update this policy over time. Changes will be posted on this page with an updated "Last updated" date and reflected in the GitHub repository. Material changes will be noted in GitHub release notes and the extension's store update description.

## Compliance

Specpin complies with:

- Chrome Web Store and Firefox Add-on developer program policies
- General Data Protection Regulation (GDPR) - by collecting no data
- California Consumer Privacy Act (CCPA) - by collecting no data

Because Specpin collects no personal data, there is no data to access, export, correct, or delete on our side. All data stays on your device, fully under your control.

## Contact

Questions or privacy concerns?

- **Email**: hi@ohnice.app
- **GitHub Issues**: [github.com/lamngockhuong/specpin/issues](https://github.com/lamngockhuong/specpin/issues)
- **GitHub Discussions**: [github.com/lamngockhuong/specpin/discussions](https://github.com/lamngockhuong/specpin/discussions)

---

**In short**: Specpin is a privacy-first, local-first extension. Your data stays on your device - we collect nothing, send nothing, and track nothing. The only network connection it makes is to a sidecar you run yourself on `localhost`.
