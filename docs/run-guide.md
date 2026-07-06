# Run Guide

> Tiếng Việt: [`vi/run-guide.md`](./vi/run-guide.md). English is the source of truth.

Specpin attaches living business specs to a running UI; it is **not** a code generator. This guide runs the full loop end to end: init the sidecar, serve, load the extension, connect, see specs render, and capture a new one.

> Prefer to let a coding agent author specs for you? See [`ai-authoring.md`](./ai-authoring.md): the `@specpin/cli` skill teaches Claude Code, Cursor, etc. to write schema-valid specs and run this same loop.

## Prerequisites

- Node >= 22, pnpm 11
- Go 1.26 (only if building the sidecar from source)
- Chrome or Firefox

## 1. Build the workspace

```bash
pnpm install
pnpm build
```

## 2. Install or build the sidecar

Install the published CLI (downloads the prebuilt binary for your OS and CPU):

```bash
npm install -g @specpin/cli     # or: pnpm add -g @specpin/cli, or: npx @specpin/cli serve
```

Or build it from source (requires Go 1.26):

```bash
cd apps/cli
make build        # syncs the embedded schema, produces bin/specpin
```

## 3. Run the demo app (optional, for a ready-made target)

```bash
pnpm --filter @specpin/demo-react-app dev   # http://localhost:3000
```

The demo is a small multi-screen Acme CRM (login, dashboard, customers list and detail, settings, new-deal) and ships `examples/demo-react-app/.specs/` with seeded specs across every screen. Log in with any values to reach the authed screens; navigate via the top nav bar.

## 4. Start the sidecar in a repo with a `.specs/` directory

In a fresh project, scaffold first:

```bash
specpin init --project "My App" --domains localhost:3000
```

Then serve (run from the directory that contains `.specs/`, e.g. the demo app):

```bash
cd examples/demo-react-app
/path/to/apps/cli/bin/specpin serve
```

It prints a connect URL and token:

```
Specpin sidecar running.
  URL:     http://127.0.0.1:51234
  Token:   2da0480c...
```

The port is auto-picked; pass `--port 5173` to pin one. The token is fresh each
run; pass `--token <secret>` (or set `SPECPIN_TOKEN`) to pin a stable one so
restarts don't de-authenticate connected clients. By default the sidecar binds
loopback (`127.0.0.1`); see [Serve on a remote machine](#serve-on-a-remote-machine)
to expose it to a team.

## 5. Load the extension

```bash
pnpm --filter @specpin/extension build            # chrome-mv3 in .output/
pnpm --filter @specpin/extension build:firefox    # firefox-mv2 in .output/
```

- Chrome: `chrome://extensions` -> Developer mode -> Load unpacked -> `apps/extension/.output/chrome-mv3`.
- Firefox: `about:debugging` -> This Firefox -> Load Temporary Add-on -> any file in `apps/extension/.output/firefox-mv2`.

## 6. Connect

Open the extension Options page (**Connected projects**), paste the URL and token from step 4 into the add form, optionally name it, click **Test & add project**. The project appears in the list with its status, project name, spec count, and domains. Each connection has an enable/disable toggle; a disabled project serves no page (its specs disappear everywhere) and its SSE watch stops, but it stays listed so it can be re-enabled. Add more projects the same way; **Edit**, **Remove**, and **Reconnect** act per row. **Edit** opens an inline form to change a project's URL, label, or token (leave the token blank to keep the current one) and re-tests the connection on save.

A project whose manifest pins no `domains` is inactive by default (its specs would otherwise show on every site). The row shows a warning and an **Apply to all sites** checkbox; tick it only if you intend that project's specs to appear everywhere.

## 7. See specs render

Visit the demo app (`http://localhost:3000`). Matched specs appear as tooltips on their elements (the badge turns amber when a match needs review). Edit a `.spec.json` on disk and the page live-updates via SSE.

The popup lists the specs for the current page and toggles Specpin on/off. The top-right header holds a settings gear (opens the Options page), a **+ New project** button (create a local project or connect a sidecar inline), and, when a project serves the page, an **Export** button (download one project's specs as a `.specs.zip`; if several serve the page, it opens a small picker to choose which one). Export covers both local projects (from their stored bundle) and connected sidecar projects (from their live cache; sidecar exports derive group names from file names since the cache flattens groups). The primary controls (**+ Capture spec** and the display-mode select) sit directly above the list so they stay visible without scrolling, with the spec **Language** picker just above them. Each spec row shows a small source badge (`sidecar` or `manual`) marking which source it came from. A search box above the list filters specs live by title, file, and tags. Just above the search box a **This page | All** toggle scopes the list: it defaults to only the specs pinned on the current page, and **All** switches to every spec the project serves for this origin (the toggle hides, and the full list shows, on pages Specpin cannot inspect such as the extension's own pages). When more than one project serves the page, the popup lists each matching project and renderers caption each spec with its project. When no project serves the page, the popup body is replaced by a create-a-project prompt (**+ New project**); the side panel shows the same as a short two-step (create a project, then capture your first spec). Turning Specpin off while a project still serves the page shows a paused panel (**Specpin is off**, with a count of how many specs are hidden here) and collapses the controls that only act on the list (search, language, capture, mode, filters) along with the status line, project list, and spec list; the on/off toggle and the settings gear stay so you can turn it back on.

### Side panel (docked)

The same controls are also available as a **side panel** that stays open while you browse. Unlike the popup it shows each spec's description and business rules inline, and it refreshes automatically as you switch tabs or navigate. The search box also filters by description in the side panel. Open it from the popup's **Open as side panel** link (Chrome) or Firefox's native sidebar toggle (**View -> Sidebar -> Specpin**). To make the toolbar icon open the side panel instead of the popup, set **Toolbar icon -> Open the side panel** on the Options page (Chrome only; on Firefox the toolbar icon always opens the popup).

### Match reliability

Each rendered spec shows how confidently it matched its element. An exact match (resolved by a `data-spec-id`/test-id, `aria-label`, or a stable `id`) is silent - the good case stays quiet. A lower-confidence match (resolved only by a CSS selector) gets a **Selector match** badge with a "why matched" hint. When exact and selector matching both fail, a **hybrid scorer** weighs the fingerprint's signals (text, nearby labels, attributes, structure, position) against the live DOM and, if one element is a confident, unambiguous winner, renders a **Scored match** badge showing its confidence and dominant signal; a mid-confidence scored match reads as needs-review. Badges appear in the tooltip/sidebar/modal and on the side-panel card. The popup and side panel also show a one-line **page health summary** (`N specs · X exact · Y scored · Z fuzzy · W orphaned`), and the side panel lists any **orphaned** specs - specs pinned to this page (by their `pageUrl` scope) whose element is no longer on the page, so you know a doc exists but its anchor is gone.

To harden a fragile spec, expand the **Fragile specs (N)** group in the popup or side panel (it appears only when the page has such specs): it lists every spec on the page with a weak anchor that is currently failing, each with a copyable `data-spec-id="…"` snippet. Add that attribute to the element in your source and the next match resolves exactly. Specpin only suggests the snippet - it never edits your source.

### Matching corpus (local, opt-in)

Options has a **Matching corpus (local, opt-in)** card to help tune the scorer against real drift. It is **off by default**; when enabled, Specpin records matching-drift data on your device only (`storage.local`, capped) - never uploaded. Two things feed it: re-pinning an orphaned/scored spec records the correction, and specs that go orphaned or scored at match time contribute a sanitized snapshot of nearby candidate elements. Only fingerprints are stored (no page HTML), with obvious PII in captured text (emails, long digit runs) masked at write time. Below the entry count the card **lists each stored entry** (newest first): a kind badge (**Re-pin** for a supervised correction, **Auto-capture** for a passive snapshot), the captured element (tag plus its strongest anchor), and a meta line - project, page path, time, and a kind-specific tail (a re-pin shows the prior match tier; an auto-capture shows the spec id plus which candidate the scorer would have picked, or that it abstained). Per row, **Details** expands the full redacted JSON of that entry and **Delete** removes just that one. The card also lets you **Export corpus (JSON)** (a local download) or **Clear corpus** (with a confirm). On a scored match's pinned tooltip you can also click **Correct** to affirm the match is right, feeding the same corpus. Contributors who want to actually retune the matcher from this data have a step-by-step guide in [scorer-tuning.md](./scorer-tuning.md).

## 8. Switch language

Spec content (title, description, business rules) is localized. The popup's **Language** dropdown sets the active locale and re-renders all display modes; the side panel header mirrors it. The choice persists across sessions. A spec with no text for the chosen locale falls back to the project's `defaultLocale`, then to any present locale. The dropdown offers the union of `settings.locales` across the connected projects.

## 9. Filter specs by tag, file, or page URL

The popup and side panel offer facet-based filters: Tags, Files, and This page (URL pattern). Unchecking a facet hides all matching specs immediately. A personal override (force-show or force-hide) syncs across machines via `chrome.storage.sync`. The side panel also offers a per-spec eye toggle for finer control (kept inline on each card, while the card's other actions - Copy link, Edit, Clone, Delete - are gathered under a **⋯** more-actions menu). **Reset** clears all personal overrides.

Team admins can set project-wide defaults in the Options page (**Team visibility** per connection): add facet keys (one per line, e.g. `tag:draft`, `file:login.spec.json`, `url:/admin/**`) to hide them for everyone. Team defaults are written to `.specs/views.json` (Git-committed) via the sidecar. Personal overrides win over team defaults: a personal force-show of `spec:<id>` is a hard rescue (reveals that spec even if its tag or file is team-hidden). The `url:` page gate wins over everything (hides specs on pages that do not match the glob). Empty state = all visible.

## 10. Capture a new spec (with translations)

Click **+ Capture spec** in the popup (or press `Alt+Shift+C`), click an element, then fill the form. The form has a row of **language tabs** (one per locale, plus a **+** tab to add one): click a tab to author that language's title/description/rules, then switch tabs to add a translation - switching tabs keeps what you already entered. The default language requires a title and description. The description and business-rules fields have a small **Markdown toolbar** (description: bold / italic / link / bullet / numbered; rules: bold / italic / link); each button inserts Markdown into the textarea around your selection. Below the display mode the form has optional **provenance** inputs: a **Status** select (draft / approved / deprecated; leave blank for none), a **Links** sub-form (repeatable label + `http`/`https` URL rows, "Add link" / × to remove), and **Linked tests** (one repo-relative test path per line - a *declared* link that `specpin validate` checks exists, never runs). The **Save to** picker lists every writable project serving the page, labelled by kind (`sidecar` or `local`); pick one (a lone target is selected automatically, and capture is disabled with an explanation when no project serves the page). On save the spec is validated and written: a sidecar target writes the chosen `.spec.json` (pretty-printed) so it shows up in `git diff`; a local target writes it into `browser.storage.local` (origin-bounded, never a sidecar). Captured specs carry `meta.source: "manual"`. The authored Markdown renders as formatted text in every display mode (see [schema-reference](./schema-reference.md#formatting-markdown-subset) for the supported subset). If the element you pinned has no stable anchor, the form shows a **Fragile anchor** hint with a copyable `data-spec-id="…"` snippet - add that attribute to your source to upgrade the match to exact (suggest-only; Specpin never edits source).

### Right-click menu

When Specpin is on, the page right-click menu has a **Specpin** submenu with four actions: **Pin spec to this element** (capture the element you right-clicked directly, skipping the hover-pick step), **Show spec here** (frame the matched element and pin a tooltip with its spec content, regardless of the spec's configured display mode; shows a brief notice when nothing here has a spec), **Capture spec (pick element)** (the same hover-pick mode as the popup button), and **Turn off Specpin**. The submenu is hidden while Specpin is off; turn it back on from the popup or `Alt+Shift+S`. The labels follow the Options page UI language.

## 11. Edit an existing spec

Open a spec for editing from either surface: click a tooltip badge to pin it and hit **Edit spec**, or open a side-panel card's **⋯** (more actions) menu and choose **Edit**. The same form opens pre-filled with the spec's content for every authored language (including the provenance fields - status, links, and linked tests); change the title, description, business rules, tags, display mode, or provenance and click **Save changes**. The spec keeps its `id` and provenance (`createdBy`/`createdAt`/`source`) and preserves any prior review stamp; only `updatedAt` is bumped. Clearing a link or the linked-tests list removes it (it is not silently kept). In edit mode a **Mark reviewed** action stamps `meta.reviewedAt` to now plus a reviewer token (`reviewedBy`, prefilled with the spec's non-PII `createdBy` token, editable) and saves through the same path - the reviewer field is **committed to `.specs/` and included in exports, so it must not contain PII/emails**. A spec whose last review is older than its project's staleness threshold shows a **Stale** indicator on every surface. The change writes back through the owning sidecar and live-updates the page via SSE, the same as editing the `.spec.json` on disk.

To point a spec at a different element, click **Re-link element** in the edit form, then click the new element on the page; the form reopens with your edits intact and the new fingerprint applied on save. Local (Manual) specs are now editable the same way; the edit writes back to `browser.storage.local` instead of a sidecar. (Side panel Edit drives the in-page form, so keep the panel docked next to the page it describes.)

To delete a writable spec, use **Delete spec** on the pinned tooltip or **Delete** from a side-panel card's **⋯** menu, then confirm. A sidecar spec is removed from its `.spec.json` on disk (recover it from Git if needed); a local spec is removed from `browser.storage.local`. Deletion is origin-bounded exactly like editing (a page can only delete specs on a project that serves it), and the page re-renders without the spec via SSE. Side panel Delete drives the same in-page confirm, so keep the panel docked next to the page.

### Provenance validation & freshness

`specpin validate` now also checks that every `verifiedBy` path exists in the repo - a broken-link check, not a test run (it never runs tests or reads pass/fail). Paths resolve against the **repo root**, which defaults to the parent of `--dir`; pass `--repo-root <path>` when your `.specs/` lives somewhere other than `<repo>/.specs` (e.g. `./config/specs`). Absolute paths, `..`-escapes, and symlinks that leave the repo are rejected; a missing file exits non-zero naming the spec id + path. When there is no readable working tree (e.g. a piped bundle) the check is skipped with a note rather than failing.

The **staleness threshold** (how old a review may be before a spec shows as *stale*) is set per project via `manifest.json` `settings.stalenessThresholdDays` (1-3650), defaulting to **90** days. On a page serving several projects, each spec uses its own project's threshold. Local/manual projects have no manifest, so they always use the 90-day default (there is no per-local override yet).

## 12. Coverage mode (find undocumented interactive elements)

Press `Alt+Shift+U` to toggle **coverage mode**: dashed ghost "+" markers appear on every *undocumented interactive element* on the page (buttons, links with href, inputs/select/textarea, ARIA widget roles like button/link/checkbox/tab/menuitem/combobox/slider, elements with `onclick`, `tabindex >= 0`, or `contenteditable`). Hidden elements, display:none, zero-size, disabled, or `aria-disabled` elements are never marked.

The mode state persists across page reloads (off by default, so a page stays byte-identical when the mode is off). The popup and side panel show a one-line **coverage summary**: "N interactive · M documented · K gaps". When there are gaps, a **"Capture all gaps (K)"** button lets you bulk-capture them all at once (see Bulk capture below).

Each marker has two quick actions:

- **Capture**: Opens the capture form on that element.
- **Ignore** (appears only when the element has a stable anchor): Dismisses the marker as a personal choice (stored in `storage.sync` per origin), so the gap stays hidden after reload and on other machines.

The markers use the same collision-avoidance solver as spec badges, styled in an isolated Shadow DOM, and respect your reduced-motion preference.

## 13. Bulk capture

Capture multiple specs in one workflow.

**Entry points:**

1. Click the **Bulk capture** button in the popup or side panel (next to "+ Capture spec").
2. From the coverage summary (when coverage mode has gaps), click **"Capture all gaps (K)"** to pre-load all undocumented elements.

**Multi-select picker:**

1. Elements appear with hover highlights.
2. Click elements to toggle them into/out of the selection (each selected element gets a persistent green outline).
3. Press **Enter** to confirm and move to the form; press **Esc** to cancel.

**Bulk form:**

1. A **Shared fields** section at the top: tags, business rules, status, and (if multiple projects serve the page) a target-project picker; otherwise a target file.
2. A per-element list below, one row per selected element:
   - **Title** (auto-derived from visible text → aria-label → title attr → placeholder → humanized tag/role, editable inline).
   - A remove button (×) per row.
   - Rows with colliding titles are flagged so you can disambiguate them.
3. All shared fields are applied to every spec.

**Submit and error handling:**

- Click **Save specs** to write all rows as separate specs to one shared `.spec.json` file (one per page/route).
- Specs are written sequentially. If a mid-batch failure occurs, succeeded rows are kept; the form stays open and marks which rows saved and which to retry.
- Each spec's description is seeded from its row title (bulk collects titles, not separate descriptions).

## 14. Templates (pre-fill common patterns)

Both the capture form (single element) and the bulk form have a **"Start from template"** dropdown. Pre-built templates include:

- **Form validation**: Prefills tags, business rules, and status for form validation specs.
- **API error handling**: Prefills for error-handling specs.
- **Auth flow**: Prefills for authentication-related specs.

Selecting a template prefills **empty fields only**: it never overwrites text you already entered. No confirm dialog. There's no persistence or schema change; templates are fixed in the UI and localized to the extension's UI language.

## 15. Clone ("Duplicate to element")

When viewing an editable spec (a tooltip badge or side-panel card), a **Duplicate to element** action appears (shown only when you have write permission for that spec's project). On the side-panel card it lives in the **⋯** (more actions) menu as **Clone**.

1. Click **Duplicate to element**.
2. The element picker appears. Click the target element.
3. The capture form opens, prefilled with the source spec's content (title, description, business rules, tags).
4. The new spec receives a **fresh fingerprint**, a new `id` (re-derived from the title on save), and **provenance reset**:
   - `status` → `draft`
   - `verifiedBy` and review stamp (`meta.reviewedAt`/`reviewedBy`) are dropped.

This ensures an approved source spec never launders an unreviewed copy into "approved": the cloned spec always starts as draft.

## 16. Guided tours (guide mode)

A **guide** is a step-by-step walkthrough over the specs already on a page: it spotlights each element in turn and shows that spec's content in a popover with **Back / Skip / Next** (the last step is **Done**), a step counter, and `←` / `→` / `Esc` keyboard control. It is launched on demand and does not replace the normal tooltip/sidebar/modal rendering.

**Launch.** The popup and side panel have a **Guides** section: click **Start guided tour** to walk every matched spec in default order (no setup needed), or **Start** next to a named guide to run its curated steps. `Alt+Shift+G` starts the default tour from the keyboard (press again to stop). From the popup the tour launches and the popup closes so the page is unobscured; the side panel stays open.

**Curate.** Click **+ New guide** (or **Edit** on a guide) to open the editor: give it a name (and optional description), add the page's specs as ordered steps (use the ↑ / ↓ buttons to reorder, × to remove), and choose where to save it in the **Save to** picker:

- a **sidecar** project - committed to that repo's `.specs/guides.json` and shared with the team via Git;
- a **local** project - stored in the extension alongside that local project;
- **Personal** - private to you, synced across your machines, never written to Git.

Leave the steps empty to save a guide that always walks every matched spec in default order. A step whose spec is no longer on the page is flagged in the editor (and skipped at launch). Delete a guide from the same list, or manage a connection's team guides (list + delete) from the Options page under **Team guides**.

A guide built for a page reflects whatever specs match it at launch; if a teammate changes the specs mid-tour, the tour stops cleanly and the normal rendering returns.

## 17. Connect several projects at once

One extension can serve many projects. Run a sidecar per project on its own port (each prints its own token), and add each in Options:

```bash
# project A
cd /path/to/project-a && /path/to/bin/specpin serve --port 51001
# project B (another terminal)
cd /path/to/project-b && /path/to/bin/specpin serve --port 51002
```

To demo this against the single demo app, run two sidecars over two `.specs/` directories on different ports; each page shows only the specs of the project(s) whose `domains` match its origin.

## 18. Serve on a remote machine

By default the sidecar is a single-user localhost tool. To share one `.specs/`
with a team, run it on a shared host and connect the extension to it over
**HTTPS**. The Go binary speaks plain HTTP only; **TLS is terminated by a reverse
proxy** in front of it. Remote *requires* HTTPS: the extension's requests run from
a secure context, so a plaintext `http://` remote is blocked as mixed content and
the extension rejects it.

### Recommended: loopback bind + co-located proxy

Keep the sidecar on `127.0.0.1` and run the proxy on the **same host**. Pin the
port and the token so restarts don't churn the URL or de-authenticate the team:

```bash
specpin serve --port 51234 --token "$(openssl rand -hex 24)"
```

**Caddy** (automatic HTTPS):

```
specs.example.com {
  reverse_proxy 127.0.0.1:51234
}
```

**nginx** - must disable buffering (for SSE) and forward `OPTIONS` +
`Authorization` (for the CORS preflight on writes), not just `proxy_pass`:

```nginx
location / {
  proxy_pass http://127.0.0.1:51234;
  proxy_set_header Host $host;
  proxy_pass_request_headers on;   # keep Authorization + If-Match + Access-Control-*
  proxy_buffering off;             # SSE: stream events as they arrive
  proxy_read_timeout 1h;           # SSE idle (the server heartbeat ~20s keeps it warm)
}
```

The server sends an SSE heartbeat (~20s) so an idle-timeout proxy keeps `/events`
open. If `OPTIONS` or `Authorization`/`If-Match` are not forwarded, writes to
`/specs`, `/views`, and `/guides` fail their preflight.

### Advanced: bind off-loopback (proxy on another host)

`specpin serve --host <addr>` binds a non-loopback address. **This does not put a
proxy in the path** - it exposes the raw, **plaintext, token-only** port directly
to the network. Only use it when the proxy runs on a *different* machine, and
**firewall the raw port** so only the proxy can reach it. Always pin `--port`
(an auto-picked port changes on restart and breaks the proxy config). The serve
command prints a blunt warning whenever it binds off-loopback.

> Note: the extension treats only `localhost` and `127.0.0.1` as local for
> plaintext `http://`. If you bind IPv6 loopback (`--host ::1`) or another
> loopback IP, connect the extension over `https://` (or use `127.0.0.1`), since a
> plaintext non-`127.0.0.1`/`localhost` URL is rejected as remote.

### No domain? Serve over IP

Internal servers often have only an IP and no public domain, so the Caddy
*automatic* HTTPS above (which needs a domain for the ACME challenge) doesn't
apply. You still cannot connect over plain `http://<ip>`: the **browser** - not
Specpin - blocks a plaintext request from the extension's secure-context service
worker to any host other than `localhost`/`127.0.0.1`. The extension accepts
`https://<ip>` as-is (no domain required), so the job is to put HTTPS on the IP,
or to make the remote look like localhost. Two paths, both work today in every
browser:

**Path A - HTTPS on the IP via an internal CA (team-friendly).** A certificate's
Subject Alternative Name (SAN) can be a bare IP, so no domain is needed; trust
comes from an internal CA you distribute to your team's browsers once. Works for
private LAN IPs **and** public IPs alike.

- *Caddy* (`tls internal` issues an internal-CA cert for the IP):

  ```
  192.168.1.50 {
    tls internal
    reverse_proxy 127.0.0.1:51234
  }
  ```

  Then trust Caddy's root CA on each machine: run `caddy trust`, or import
  `pki/authorities/local/root.crt` (under Caddy's data dir) into each browser/OS
  trust store.

- *nginx / no Caddy* - mint an IP-SAN cert yourself and reuse the nginx block
  from [Recommended](#recommended-loopback-bind--co-located-proxy) (the
  `proxy_buffering off` + `Authorization`/`If-Match` forwarding still matters):

  ```bash
  mkcert 192.168.1.50            # easiest; also installs its root CA locally
  # or with openssl, the key bit is the SAN:
  #   openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem \
  #     -days 365 -subj "/CN=192.168.1.50" -addext "subjectAltName=IP:192.168.1.50"
  ```

  Distribute the **root CA** (mkcert's `rootCA.pem`, or your openssl CA) to team
  browsers; a bare self-signed leaf with no trusted root will still error.

Then connect the extension to `https://192.168.1.50` and approve the permission
prompt (see [Connect the extension](#connect-the-extension)).

**Path B - SSH tunnel to localhost (zero cert, per-user).** For one user, or
when installing a root CA isn't allowed, forward a local port to the server's
loopback sidecar - `localhost` is exempt from mixed-content everywhere, so no
cert and no proxy are needed:

```bash
# On the server, keep the sidecar on loopback (default) with a pinned port + token:
specpin serve --port 51234 --token "$(openssl rand -hex 24)"
# On your machine, tunnel a local port to it:
ssh -N -L 9123:127.0.0.1:51234 user@192.168.1.50
# Connect the extension to:  http://localhost:9123
```

SSH provides the encryption and authentication. It's per-user (each teammate
runs their own tunnel) and the tunnel must stay up while you work.

> **Why not just `http://192.168.1.50`?** A public IP is never allowed -
> plaintext remote is blocked, period. A private LAN IP is allowed *only* on
> Chrome 142+ via [Local Network Access](https://developer.chrome.com/blog/local-network-access),
> and even there the permission prompt can't be raised from the extension's
> background service worker, while [Firefox has no equivalent](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access).
> So Specpin intentionally rejects plaintext remote rather than ship a
> connection that dies by browser and version.

### Connect the extension

In the popup or side panel, **+ New project → Sidecar** (or the Options
**Connected projects** add form): paste `https://specs.example.com` and the token,
then **approve the permission prompt** for that host. The extension requests host
access per remote origin at connect time and revokes it when you delete the
connection, so the default install carries no broad-host permission.

### Threat model (read before exposing it)

- **The bearer token is the only authorization boundary for network clients.**
  CORS rejects browser requests from non-extension origins, but it does **not**
  constrain `curl` or any non-browser client (a request with no `Origin` passes).
  Anyone with the token has full read/write. Treat it like a password; distribute
  it out-of-band. Pin it with `--token`/`SPECPIN_TOKEN` - otherwise every restart
  mints a new token and every client must be updated.
- **The raw non-loopback port is plaintext and token-only.** Firewall it; never
  expose it to the public internet without the proxy in front.
- **SSE liveness needs a local-disk `.specs/`.** File-change events rely on
  inotify; networked/mounted filesystems (NFS, some Docker volumes) may not emit
  them, leaving specs stale under a green "connected" status. Keep `.specs/` on
  local disk.
- **Concurrent edits are safe but coarse.** Writes are serialized server-side, and
  a write against a stale read is rejected with `409` (the extension reloads and
  asks you to re-save) rather than silently overwriting a teammate's change.
- **An internal-CA / self-signed cert is only as safe as the root you trust.**
  Any machine that trusts that root accepts every cert it signs, so keep the CA
  private key secure and scope trust to managed machines. On untrusted clients
  prefer the SSH-tunnel path, which needs no added trust.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+S` | toggle Specpin on/off |
| `Alt+Shift+M` | cycle display mode |
| `Alt+Shift+C` | toggle capture mode (`Esc` cancels) |
| `Alt+Shift+U` | toggle coverage mode (ghost markers on undocumented elements) |
| `Alt+Shift+N` | cycle focus through matched specs (flash each, wrap around) |
| `Alt+Shift+G` | start / stop the default guided tour (in-tour: `←` / `→` step, `Esc` exits) |

## Display modes

Specs render as a **tooltip** (hover peek), a **sidebar** (persistent list), or a **modal** (a draggable, non-blocking panel listing every spec on the page). The modal opens centered but you can drag it by its header to anywhere on screen, and the page behind stays interactive (no dimming overlay) so you can keep it open while you work. Switch with the popup's mode dropdown or cycle with `Alt+Shift+M`. Per-spec `preferredDisplayMode` and the manifest `defaultDisplayMode` still apply when no mode is forced.

You can dismiss the sidebar (its **x** button) or the modal (its **x** button only - `Esc` and clicks outside no longer close it). A dismissed surface collapses to a small **Specpin** pill in the page's bottom-right corner showing the matched-spec count; click it to reopen. Drag the pill to move it anywhere on the page, and the new position is remembered for next time (clamped back into view if the window is smaller). The dismissed state survives re-renders and in-page navigation, and clears whenever you explicitly pick a mode (the dropdown or `Alt+Shift+M`).

## Use without a sidecar (Manual import)

To view specs without running `specpin serve`, open the extension Options page, go to the **Spec** section, and switch to the **Manual** tab. There are two ways to import:

**From files (no JSON assembly).** Click the file picker, select `manifest.json` plus one or more `*.spec.json` files from your `.specs/` directory, then **Load from files**. The extension assembles and validates them in-page.

**From a pasted bundle.** Paste a single JSON object of this shape, then **Load pasted bundle**:

```json
{ "manifest": { …manifest.json… }, "files": { "login.spec.json": { …spec file… } } }
```

To produce that bundle from a repo's `.specs/` without hand-assembly, use the CLI:

```bash
specpin bundle --dir .specs            # print bundle JSON to stdout (copy/paste or pipe)
specpin bundle --dir .specs --out bundle.json   # write it to a file instead
```

`bundle` only reads and assembles; it does not validate (run `specpin validate` for schema checks, or rely on the in-page validation on import). Either path validates against the schema before anything is stored.

**Each import appends a batch.** Loading a bundle (paste or files) adds it as a new batch rather than replacing the previous one, so several imports coexist. If a new import duplicates an earlier one (same project name) it is still loaded, with a non-blocking note naming the prior batch; a cross-batch spec-id overlap on the same site is flagged too (only the first matching batch renders/edits each id). The loaded batches are listed below the buttons, one card per import, with the batch's pinned sites (its manifest `domains`, or "all sites" when it pins none) shown inline. Each batch has **Export** (download its `.specs.zip`), **Rename** (change the project name and pinned sites), and **Remove**; **Clear all manual specs** empties the whole list. Manual specs persist across browser restarts and merge into a page's specs alongside any connected projects whose `domains` match the page (manual specs use their own manifest `domains`; repeated spec ids across batches render once).

### Local authoring loop (no sidecar)

The Manual source is a full local authoring path, not just a read-only viewer:

1. **Create** a local project from the popup or side panel: **+ New project** -> *Local project*, give it a name and (optionally) the sites it applies to. With no sites and no **Apply to all sites**, the project serves no page (so it has no writable target yet) - set one or the other to capture into it.
2. **Capture / edit** specs into it exactly like a sidecar project (capture picks it in the **Save to** picker; edit works in place). Writes go to `browser.storage.local`, origin-bounded to the project's sites, and are schema-validated before they are stored.
3. **Export** the project (popup/panel **Export**, or per-batch **Export** in Options) to a `<project>.specs.zip` containing `manifest.json` + one `*.spec.json` per group. Unzip it into a repo's `.specs/`, or re-import the files through the multi-file picker - the round-trip preserves group names and spec content, and `specpin serve` reads the result.

Created-in-extension projects count against the same 50-batch cap as imports and show a **Local** provenance label in Options.

## Validate specs offline

`specpin validate` checks `manifest.json` and every `*.spec.json` against the schema without serving anything:

```bash
specpin validate --dir .specs
```

Exit codes: `0` all valid, `1` invalid specs found (fix the spec), `2` could not run (directory or manifest missing). It also warns when `manifest.specFiles` and the on-disk `*.spec.json` files disagree; pass `--strict-manifest` to make that drift fail instead of warn.

## Report on spec freshness and governance

`specpin report` audits spec health (staleness, draft specs, required specs) for CI gates:

```bash
specpin report --dir .specs
```

Prints freshness status (specs older than `settings.stalenessThresholdDays`), spec counts by status/file, and required-spec existence check (from `.specs/required.json`, if present). Exit `0` by default (warn-only). Gate with `--fail-on <conds>` (comma list of: `stale`, `draft-committed`, `missing-required`, `missing-verifiedby`) to exit `1` on violations. Exit `2` = could not run (missing dir/manifest). Use `--json` for CI parsing.

## Lint specs in CI

Use the reusable action to fail PRs that introduce invalid specs. No Node toolchain needed; the validator is built from a pinned Specpin ref (never the calling repo's PR), so a malicious PR cannot alter validation:

```yaml
# .github/workflows/spec-lint.yml in your repo
on: [pull_request]
jobs:
  spec-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: lamngockhuong/specpin/.github/actions/spec-lint@v0.1.0  # pin to a release tag
        with:
          dir: .specs
```

Pin `@<tag>` (not `@main`) for supply-chain safety once a release is tagged.
