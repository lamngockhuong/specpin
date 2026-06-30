---
title: Connecting Projects
description: How to connect Specpin to your projects using sidecar or local connections.
---

Specpin connects to projects in two ways: a **Sidecar** connection (a running `specpin serve` instance) or a **Local project** (specs stored in the browser).

## Add a new project

Open the Specpin popup or side panel, then click the settings gear (top-right) or the **+ New project** button. You will see two options:

### Sidecar connection

Connect to a running `specpin serve` instance.

1. Run `specpin serve` in your project directory (see [CLI](/sidecar/cli/) for details). It prints a URL and token:
   ```
   Specpin sidecar running.
     URL:     http://127.0.0.1:51234
     Token:   2da0480c...
   ```
2. In the extension, choose **Sidecar**.
3. Paste the **Sidecar URL** (e.g. `http://127.0.0.1:51234`).
4. Add a **Label** (optional, e.g. "Acme CRM").
5. Paste the **Token**.
6. Click **Test & add project**. If the connection succeeds, the project appears in the Options page list.

The URL may be a localhost address (`http://127.0.0.1:<port>` or `http://localhost:<port>`) or a **remote** sidecar over HTTPS (e.g. `https://specs.example.com`). A remote sidecar must use `https://` — plaintext `http://` to a remote host is rejected. When you add a remote connection, the browser asks for permission to access that host; approve it to connect. Removing the connection revokes that permission. See [Serve on a remote machine](/sidecar/cli/#serve-on-a-remote-machine) for running the sidecar behind a reverse proxy.

:::tip
Each sidecar runs on its own port. To serve multiple projects at once, run `specpin serve --port 51001` in project A and `specpin serve --port 51002` in project B, then add both connections with their own tokens.
:::

:::note
If a teammate changes a spec while you are editing the same project, your save is rejected with a "changed elsewhere" notice and the project reloads — review and save again. This prevents one write from silently overwriting another.
:::

### Local project

Create a project without a sidecar. Specs are stored in `browser.storage.local` and exportable as a `.specs.zip`.

1. Choose **Local project**.
2. Enter a **Project name**.
3. (Optional) Enter **Domains** (comma-separated, e.g. `localhost:3000, example.com`).
4. If you leave Domains blank and do not check **Apply to all sites**, the project serves no page (you can add domains later).
5. Click **Create**.

Local projects appear in the popup and side panel when a page matches their domains. You can capture and edit specs the same way as sidecar projects.

## Multi-project routing

One extension can serve many projects. Specs show on a page only if the project's manifest `domains` include that page's origin. A project with no domains pinned is inactive by default (its specs would otherwise appear everywhere). Check **Apply to all sites** in the connection settings to enable it.

## Per-project enable/disable

Each connection in the Options page has an **Enabled** / **Disabled** toggle. Disabling a project hides its specs everywhere and stops its SSE watch, but keeps the connection listed so you can re-enable it later.

When Specpin is turned off for the page (global toggle), all projects are ignored. The per-project toggle works independently of the global on/off.

## Manage connections

Open the extension Options page (click the settings gear from the popup or side panel).

- **Edit**: Change the URL, label, or token. Leave the token field blank to keep the current one. Click **Save changes** after editing.
- **Reconnect**: Test the connection again if the sidecar restarted or the token changed.
- **Remove**: Delete the connection. A confirmation dialog appears first.

Local projects show a **Rename** action (change the project name and domains) and an **Export** action (download a `.specs.zip` of the project's specs). Sidecar projects also show **Export** (creates a bundle from the live cache).

For local projects, the Options page shows a **Local** provenance label and lists the pinned sites (or "all sites" when no domains are pinned).
