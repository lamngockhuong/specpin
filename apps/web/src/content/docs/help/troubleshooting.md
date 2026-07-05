---
title: Troubleshooting
description: Common issues and solutions for Specpin, plus a quick FAQ.
---

This page covers common issues when using Specpin and how to fix them.

## Connection Issues

### The extension says "Disconnected (sidecar)"

**Cause:** The sidecar is not running, or the extension cannot reach it.

**Fix:**

1. Make sure `specpin serve` is running in the project directory (the one with `.specs/`).
2. Check that the URL in the extension matches the printed URL (e.g., `http://127.0.0.1:51234`).
3. Check that the token in the extension matches the printed token. The token changes every time you restart `specpin serve`.
4. If the port changed (auto-picked on restart), update the URL in the extension's Options page.
5. Click **Reconnect** in the Options page to test the connection.

### The extension says "Not configured"

**Cause:** No project is connected yet, or no project serves this page's origin.

**Fix:**

1. Open the extension Options page.
2. Add a connection: paste the URL and token printed by `specpin serve`.
3. If the project's `domains` in `.specs/manifest.json` do not include the current page's origin, the project will not serve that page. Edit `manifest.json` to add the domain, or enable **Apply to all sites** in the Options page (only if you want this project's specs on every site).

### "No project for this page"

**Cause:** You have connections configured, but none of them serve the current page (their `domains` do not match).

**Fix:**

1. In this state the popup shows a **+ New project** prompt (the side panel shows a short two-step). Click it to create a local project or connect a sidecar for this page.
2. Or check `.specs/manifest.json` in the project and add the current page's domain (e.g., `localhost:3000`, `example.com`) to the `domains` array.
3. Or enable **Apply to all sites** for that project in the Options page (use with caution: specs will appear on every site you visit).

### Connection test fails with CORS or origin error

**Cause:** The sidecar rejects requests from web origins. Only browser extension origins are allowed.

**Fix:** This is expected behavior. You can only connect from the browser extension, not from a web page. Make sure you are pasting the URL and token into the extension's Options page, not into a browser console or a web form.

## Specs Not Appearing

### "No specs for this page."

**Possible causes:**

1. **Specpin is off.** The popup shows a **Specpin is off** panel with a count of how many specs are hidden here. Turn it on with the toggle in the popup or press `Alt+Shift+S`.
2. **The project is disabled.** Check the Options page and make sure the project has **Enabled** next to it. Click the toggle to enable it.
3. **The project's `domains` do not match the page.** See [Connection Issues](#connection-issues) above.
4. **The specs are hidden by filters.** Check the **Filter** section in the popup or side panel. Uncheck any filters that might be hiding specs. Click **Reset** to clear personal overrides.
5. **The specs are hidden by team defaults.** If the project has team visibility settings in `.specs/views.json`, specs matching those facets are hidden by default. Personal overrides can show them (click the eye icon in the side panel or uncheck the facet in the Filter section).

### Specs show in the list but do not render on the page

**Possible causes:**

1. **The display mode is set to a closed surface.** If you dismissed the sidebar or modal, it collapses to a small pill in the bottom-right corner. Click the pill to reopen it.
2. **The element is not on the page yet.** Some elements appear only after user interaction (modals, dropdowns, lazy-loaded sections). Navigate or interact to reveal the element, and the spec will render.
3. **The spec is marked "Needs review."** The extension could not confidently match the element. See [Specs Not Matching](#specs-not-matching) below.

## Specs Not Matching

### A spec shows a "Needs review" badge

**Cause:** The element changed (refactored, removed, moved), and the extension could not find a confident match.

**Fix:**

1. Click the spec in the popup or side panel, then click **Edit spec**.
2. Click **Re-link element**.
3. Click the correct element on the page.
4. Click **Save changes**.

The extension will capture a fresh fingerprint and save it back to `.specs/`. The spec will now match again.

### Multiple specs match the same element

**Cause:** Two specs have overlapping fingerprints (e.g., both point to the same `data-testid`).

**Fix:**

1. Check the spec files in `.specs/` and confirm which one is correct.
2. Delete or update the incorrect spec.
3. For critical elements, add a unique `data-spec-id` attribute in your source code:
   ```html
   <button data-spec-id="submit-order">Submit</button>
   ```
   Then update the spec's fingerprint to use that attribute (click **Re-link element** in the edit form).

## Extension Issues

### The extension does not load in Chrome

**Fix:**

1. Build the extension: `pnpm --filter @specpin/extension build` (produces `.output/chrome-mv3`).
2. Go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `apps/extension/.output/chrome-mv3`.
3. If the extension is already loaded, click the refresh icon next to it after rebuilding.

### The extension does not load in Firefox

**Fix:**

1. Build the extension: `pnpm --filter @specpin/extension build:firefox` (produces `.output/firefox-mv2`).
2. Go to `about:debugging`, click **This Firefox**, click **Load Temporary Add-on**, and select any file inside `apps/extension/.output/firefox-mv2`.
3. Temporary add-ons are removed when Firefox closes. You must reload them each session.

### The right-click menu shows no Specpin submenu

**Cause:** Specpin is off.

**Fix:** Turn Specpin on from the popup or press `Alt+Shift+S`. The right-click submenu appears only when Specpin is on.

## Sidecar Issues

### `specpin serve` prints "address already in use"

**Cause:** Another process is using the port, or a previous `specpin serve` is still running.

**Fix:**

1. Kill the previous process (find it with `lsof -i :<port>` or `netstat -ano | findstr :<port>` on Windows, then kill the PID).
2. Or use a different port: `specpin serve --port 5173`.

### The sidecar crashes or hangs

**Cause:** A corrupted `.specs/` directory, or an invalid spec file.

**Fix:**

1. Run `specpin validate --dir .specs` to check for schema errors.
2. Fix any invalid specs reported by `validate`.
3. Restart `specpin serve`.

### The token printed by `specpin serve` does not work

**Cause:** The token was copied incorrectly, or an older token is still in the extension settings.

**Fix:**

1. Copy the entire token printed by `specpin serve` (it is a long hex string).
2. Open the extension Options page, click **Edit** next to the connection, paste the new token, and click **Save changes**.
3. The token changes every time you restart `specpin serve`. Update it in the extension after every restart.

## Capture and Edit Issues

### "No writable project serves this page"

**Cause:** No connected project (sidecar or local) has `domains` that match the current page.

**Fix:**

1. Add the page's origin to a project's `domains` in `.specs/manifest.json`, or enable **Apply to all sites** for a local project in the Options page.
2. Or create a new local project from the popup: click **+ New project** -> **Local project**, give it a name, and add the current page's domain.

### Capture or edit saves but the page does not refresh

**Cause:** Live-reload (SSE) is not connected, or the sidecar is not sending the `SPECS_CHANGED` event.

**Fix:**

1. Check that `specpin serve` is running and the extension is connected.
2. Refresh the page manually to see the updated spec.
3. If this happens consistently, check the browser console for SSE errors.

## FAQ

### Is my data sent anywhere?

Not to us. Specpin is local-first: by default the sidecar binds to `127.0.0.1` and the extension connects over localhost. If you opt into a remote sidecar, specs go only to that host - one you run yourself. No Specpin-operated server ever sees your specs or your page. See [Security and Privacy](/concepts/security-and-privacy/) for full details.

### Do I need the CLI to use Specpin?

Only if you want to serve specs from a repository's `.specs/` directory. The CLI (`specpin serve`) exposes those specs over localhost. If you only use **local projects** (created in the extension and stored in browser storage), you do not need the CLI at all.

### What is the difference between Chrome and Firefox support?

The extension works on both browsers with minor differences:

- **Chrome:** Supports both the popup and the side panel. You can choose which one opens when you click the toolbar icon (Options page -> **Toolbar icon**).
- **Firefox:** The toolbar icon always opens the popup. The side panel is opened from Firefox's own sidebar toggle (**View -> Sidebar -> Specpin**).

### Why does the token keep changing?

By default the token changes every time you restart `specpin serve`. This is by design for security: if a token is leaked, it becomes invalid when the sidecar restarts. Update the token in the extension's Options page after every restart. For a long-running or shared sidecar, pin a stable token with `--token <secret>` (or the `SPECPIN_TOKEN` environment variable) so restarts do not disconnect everyone.

### Can I use Specpin without Git?

Yes. Specs are stored as JSON files in `.specs/`, but you do not need to commit them to Git. You can author and view specs without version control. However, versioning specs in Git (and reviewing changes via pull requests) is the recommended workflow.

### Can I connect to a sidecar on a different machine?

Yes. Run the sidecar on the remote host behind an HTTPS reverse proxy (keep it on loopback with a co-located proxy, or use `--host` plus a firewall), pin a stable `--token`, and connect the extension to the `https://` proxy URL. Remote connections must use HTTPS - plaintext `http://` to a remote host is blocked. See [Serve on a remote machine](/sidecar/cli/#serve-on-a-remote-machine) for details.

### Where can I get help?

- **Report a bug:** [GitHub Issues](https://github.com/lamngockhuong/specpin/issues)
- **Ask a question:** [GitHub Discussions](https://github.com/lamngockhuong/specpin/discussions)
