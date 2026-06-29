---
title: Introduction
description: What Specpin is and how it attaches living business specs to your running web UI.
---

Specpin attaches business specifications (rules, descriptions, acceptance criteria) directly onto the elements of a running web UI, then renders them in-browser as you hover or browse.

## What problem does it solve?

Documentation that drifts from code becomes noise. Specpin keeps specs alive by pinning them to the interface itself. The specs survive refactors, version alongside your code in Git, and appear exactly where you need them.

## What it is

- **A browser extension** that matches specs to DOM elements via resilient fingerprints (test-id, aria, selector, xpath, text, position).
- **A Go sidecar** (`specpin serve`) that exposes your `.specs/` directory over token-authenticated localhost, with live-reload over SSE.
- **Git-native knowledge layer** living as JSON in your repo, reviewable via PR, diffable, versioned.
- **Framework-agnostic** because matching happens on pure DOM.

## What it is NOT

Specpin is **not** a spec-driven code generator. It is unrelated to GitHub Spec Kit / OpenSpec. It generates no application code. It is a knowledge layer that pins living documentation onto the interface you already have.

## What you need

To use Specpin, you need at least one project:

- **Sidecar project**: a repo with a `.specs/` directory, served via `specpin serve` (Git-native, reviewable, team-shared).
- **Local project**: specs stored in `browser.storage.local`, created directly in the extension (individual, portable, exportable as `.specs.zip`).

## Next steps

- [Install the extension](/guide/install/)
- [Get started with your first connection](/guide/getting-started/)
