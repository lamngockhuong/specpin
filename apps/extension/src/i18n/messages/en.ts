// English UI-chrome catalog: the canonical key set (source of truth). Keys are
// dot-path strings grouped by surface. Vietnamese (vi.ts) is typed against
// `keyof Messages`, so every key here MUST have a VI translation (compile-time
// completeness). Interpolation uses `{name}` placeholders resolved by t().
//
// English values are kept byte-identical to the literals they replaced so the
// default-locale UI (and the existing tests) render unchanged. Counts that
// inflect in English (spec / specs) use the `plural()` helper with the *One/*Other
// pair; everywhere the source already said "spec(s)" a single key keeps that.
const en = {
  // Shared across popup + side panel + renderers.
  "common.specpin": "Specpin",
  "common.loading": "Loading…",
  "common.showSpecsLabel": "Show specs on this page",
  "common.showSpecsAria": "Show all Specpin specs on this page",
  "common.languageLabel": "Language",
  "common.specLanguageTitle": "Spec language",
  "common.searchPlaceholder": "Search specs…",
  "common.searchAria": "Search specs",
  "common.displayModeTitle": "Display mode",
  "common.modePerSpec": "Per-spec mode",
  "common.modeTooltip": "Tooltip",
  "common.modeSidebar": "Sidebar",
  "common.modeModal": "Modal",
  "common.connectionSettings": "Connection settings",
  "common.captureSpec": "Capture spec",
  "common.edit": "Edit",
  "common.delete": "Delete",
  "common.cancel": "Cancel",
  "common.ok": "OK",
  "common.close": "Close",
  "common.hidePanel": "Hide panel",
  "common.reopenPanel": "Show Specpin specs",
  "common.and": "and",
  "common.clickToHighlight": "Click to highlight on the page",
  // Deep-link "Copy link" affordance (side-panel card + tooltip pin).
  "common.copyLink": "Copy link",
  "common.copyLinkTitle": "Copy a shareable link to this spec",
  "common.moreActions": "More actions",
  "common.linkCopied": "Link copied",
  "common.cannotActOnPage": "Can't do that on this page. Switch to the website tab first.",
  "common.specsOnThisPage": "Specs on this page",
  "common.needsReview": "Needs review",
  "common.needReview": "{count} need review",
  "common.specsFoundOne": "{count} spec found",
  "common.specsFoundOther": "{count} specs found",
  "common.specsCountPill": "{count} specs",
  // Status header (origin-scoped).
  "common.statusNotConfigured": "Not configured",
  "common.statusConnectedSidecar": "Connected (sidecar)",
  "common.statusDisconnectedSidecar": "Disconnected (sidecar)",
  "common.statusConnectedManual": "Connected (manual)",
  "common.statusNoProject": "No project for this page",
  // Spec-list empty states.
  "common.noSpecsForPage": "No specs for this page.",
  "common.specpinOff": "Specpin is off.",
  "common.noSearchMatch": "No specs match your search.",
  // Provenance badge.
  "common.sourceManual": "manual",
  "common.sourceSidecar": "sidecar",
  "common.sourceManualTitle": "From a Manual import (read-only)",
  "common.sourceSidecarTitle": "From a sidecar connection",
  // Facet filters.
  "common.filterTitle": "Filter",
  "common.filterReset": "Reset",
  "common.filterTags": "Tags",
  "common.filterFiles": "Files",
  "common.filterSpecs": "Specs",
  "common.filterThisPage": "This page",
  "common.filterHidePage": "Hide specs on this page",
  // Spec-list scope toggle (This page | All), above the search box.
  "common.scopeThisPage": "This page",
  "common.scopeAll": "All",
  "common.scopeAria": "Show specs for this page or all specs",
  "common.markerTeam": "team",
  "common.markerTeamTitle": "Hidden by the team default",
  "common.markerYou": "you",
  "common.markerYouTitle": "Your personal override",
  "common.viewChangelog": "View changelog",

  // Popup-only.
  "popup.openSidepanel": "Open as side panel ⇥",
  "popup.newProject": "New project",
  "popup.exportLocal": "Export local specs",
  "popup.exportPickProject": "Export which project?",

  // Shared "+ New project" inline form (popup + side panel).
  "addProject.modeLocal": "Local project",
  "addProject.modeSidecar": "Sidecar",
  "addProject.projectPlaceholder": "Project name",
  "addProject.domainsPlaceholder": "Domains (optional, comma-separated)",
  "addProject.applyAllSites": "Apply to all sites",
  "addProject.applyAllHint": "Without domains or this, the project serves no page.",
  "addProject.urlPlaceholder": "http://127.0.0.1:PORT",
  "addProject.labelPlaceholder": "Label (optional)",
  "addProject.tokenPlaceholder": "Token",
  "addProject.create": "Create",
  "addProject.cancel": "Cancel",
  "addProject.projectRequired": "Project name is required.",
  "addProject.couldNotCreate": "Could not create the project.",
  "addProject.urlTokenRequired": "URL and token are required.",
  "addProject.urlError":
    "URL must be a localhost address (http://localhost or http://127.0.0.1, optional port) or a remote https:// URL.",
  "addProject.urlErrorRemoteHttps":
    "A remote sidecar must use https:// (plaintext http is blocked).",
  "addProject.permissionDenied":
    "Permission to access that host was denied, so the project was not added.",
  "addProject.couldNotConnect": "Could not connect to the sidecar.",

  // Side panel per-spec controls.
  "sidepanel.hide": "Hide",
  "sidepanel.show": "Show",
  "sidepanel.hideThisSpec": "Hide this spec",
  "sidepanel.showThisSpec": "Show this spec",
  "sidepanel.editThisSpec": "Edit this spec",
  "sidepanel.deleteThisSpec": "Delete this spec",

  // Tooltip renderer.
  "tooltip.editSpec": "Edit spec",
  "tooltip.deleteSpec": "Delete spec",
  "tooltip.openInPanel": "Open in side panel",

  // Spec delete flow (shared by tooltip + side panel).
  "spec.deleteConfirm": "Delete this spec? Recover it from Git if needed.",
  "spec.deleteConfirmLocal": "Delete this spec? This can't be undone.",
  "spec.deleteConflict": "The spec changed elsewhere; the view was refreshed. Nothing was deleted.",
  "spec.deleteFailed": "Could not delete spec: {error}",
  // Deep-link resolver: the target spec exists but its element is not on the page.
  "spec.linkElementMissing": "This spec's element isn't on this page.",

  // What-changed digest (popup + side panel): a count of new/edited specs since
  // the last visit, with a per-project content-hash snapshot in storage.local.
  "digest.changedSince": "{count} changed since last visit",
  "digest.markSeen": "Mark all seen",
  "digest.tagNew": "new",
  "digest.tagEdited": "edited",

  // Match-confidence badge + "why matched" (in-page renderers + side-panel cards).
  // The exact tier renders no badge (good state = silent), so there is no
  // match.exact key. `whyPrefix` + a `by*` anchor name form "Matched by …".
  "match.fuzzy": "Selector match",
  "match.whyPrefix": "Matched by",
  "match.byTestId": "data-spec-id",
  "match.byAria": "aria-label",
  "match.byId": "id",
  "match.byCss": "CSS selector",
  // Scored (hybrid) tier: matched by weighted signals when exact/css failed.
  "match.scored": "Scored match",
  "match.signal.text": "text",
  "match.signal.labels": "nearby labels",
  "match.signal.attributes": "attributes",
  "match.signal.tag": "tag",
  "match.signal.structure": "structure",
  "match.signal.position": "position",

  // Page match-health summary + orphaned list (popup + side panel).
  "health.summary":
    "{total} specs · {exact} exact · {scored} scored · {fuzzy} fuzzy · {orphaned} orphaned",
  "health.orphanedTitle": "Orphaned ({count})",
  "health.orphanedHint": "These specs target this page but their element wasn't found.",
  "health.orphanedNotFound": "Not found on this page",
  "health.fuzzy": "fuzzy",
  "health.scored": "scored",

  // data-spec-id helper: weak-anchor capture hint + fragile-spec list. The list is
  // a collapsible group titled "helper.scanTitle (N)", hidden when the count is 0.
  "helper.weakAnchorTitle": "Fragile anchor",
  "helper.weakAnchorHint":
    "This element has no stable anchor. Add this attribute to its source to make the match exact and stable:",
  "helper.copySnippet": "Copy",
  "helper.copied": "Copied!",
  "helper.scanTitle": "Fragile specs",

  // Capture / edit form.
  "capture.titleCapture": "Capture spec",
  "capture.titleEdit": "Edit spec",
  "capture.addLanguagePrompt": "Add a language (BCP-47, e.g. vi, ja, en-US):",
  "capture.invalidLocale": '"{code}" is not a valid BCP-47 locale code.',
  "capture.languageLabel": "Language",
  "capture.languageHint": "(title & description per language)",
  "capture.addLanguageTab": "Add language",
  "capture.titleField": "Title",
  "capture.titlePlaceholder": "Login button",
  "capture.descField": "Description",
  "capture.descPlaceholder": "What this element does",
  "capture.rulesField": "Business rules",
  "capture.rulesHint": "(one per line)",
  "capture.tagsField": "Tags",
  "capture.tagsHint": "(comma-separated)",
  "capture.tagsPlaceholder": "auth, critical",
  "capture.displayModeLabel": "Display mode",
  "capture.modeDefault": "Use project default",
  "capture.pageScopeField": "Page scope",
  "capture.pageScopeHint": "(path glob; blank = all pages)",
  "capture.pageScopePlaceholder": "/orders/**",
  "capture.targetProject": "Target project",
  "capture.targetFile": "Target file",
  "capture.targetKindLocal": "local",
  "capture.targetKindSidecar": "sidecar",
  "capture.noWritableProject":
    "No writable project serves this page. Create a local project or connect a sidecar first.",
  "capture.relink": "Re-link element",
  "capture.relinkNote": "Re-linked to a new element. Save to apply.",
  "capture.couldNotSave": "Could not save:",
  "capture.fieldTitle": "title",
  "capture.fieldDescription": "description",
  "capture.enterFieldsForDefault": "Enter a {fields} for the default language ({locale}).",
  "capture.saveSpec": "Save spec",
  "capture.saveChanges": "Save changes",
  "capture.saveFailed": "Save failed; check the sidecar.",
  "capture.specChangedReloaded":
    "These specs changed elsewhere and were reloaded. Review your edit and save again.",
  "capture.fmtHint": "(Markdown supported)",
  "capture.fmtBold": "Bold",
  "capture.fmtItalic": "Italic",
  "capture.fmtLink": "Link",
  "capture.fmtBullet": "Bullet list",
  "capture.fmtNumber": "Numbered list",
  "capture.fmtLinkPrompt": "Link URL (http, https, or mailto):",

  // Page right-click context menu (background-set titles; shown only when on).
  "contextMenu.parent": "Specpin",
  "contextMenu.pin": "Pin spec to this element",
  "contextMenu.show": "Show spec here",
  "contextMenu.capture": "Capture spec (pick element)",
  "contextMenu.toggleOff": "Turn off Specpin",
  "contextMenu.noSpecHere": "No spec on this element.",

  // Options page (static HTML + dynamic rows).
  "options.pageTitle": "Specpin Settings",
  // Sidebar-rail nav labels (short forms of the section headings below).
  "options.navSpec": "Spec",
  "options.navAppearance": "Appearance",
  "options.navToolbar": "Toolbar",
  "options.navCorpus": "Matching",
  "options.navSupport": "Support",
  // Segmented control inside the Spec pane: live sidecar vs pasted bundle.
  "options.specTabLive": "Live",
  "options.specTabManual": "Manual",
  "options.connectedProjects": "Connected projects",
  "options.connectedLead":
    "Run <code>specpin serve</code> in each project, then add its URL and token below. Specs show on a page only if the project's manifest <code>domains</code> include that page.",
  "options.addProject": "Add a project",
  "options.sidecarUrl": "Sidecar URL",
  "options.labelField": "Label",
  "options.optional": "(optional)",
  "options.labelPlaceholder": "e.g. Acme CRM",
  "options.token": "Token",
  "options.tokenPlaceholder": "paste bearer token",
  "options.applyAllLabel": "Apply to all sites if this project pins no domains",
  "options.testAddProject": "Test & add project",
  "options.appearance": "Appearance",
  "options.appearanceLead":
    "How Specpin's own interface looks. These apply to every Specpin surface (popup, side panel, options, and the in-page tooltip/sidebar/modal).",
  "options.theme": "Theme",
  "options.badgeNumberingLabel": "Number spec badges (show position instead of S)",
  "options.badgeColorLabel": "Spec badge color",
  "options.badgeColorReset": "Reset",
  "options.themeSystem": "System default",
  "options.themeLight": "Light",
  "options.themeDark": "Dark",
  "options.languageSetting": "Language",
  "options.languageSettingLead":
    "The language of Specpin's own interface. Independent from a project's spec content language.",
  "options.uiLanguageSystem": "System default",
  "options.toolbarIcon": "Toolbar icon",
  "options.toolbarLead":
    "What clicking the Specpin toolbar icon opens. <strong>Chrome only</strong>: on Firefox the icon always opens the popup, and the side panel is opened from Firefox's own sidebar toggle (View → Sidebar).",
  "options.toolbarLabel": "When I click the toolbar icon",
  "options.toolbarPopup": "Open the popup",
  "options.toolbarSidepanel": "Open the side panel",
  "options.manualSpecs": "Manual specs (no sidecar)",
  "options.manualLead":
    'Paste a bundle to view specs without running <code>specpin serve</code>. Read-only: capture still needs a sidecar. Shape: <code>{ "manifest": {…}, "files": { "x.spec.json": {…} } }</code>',
  "options.fromFiles": "From files",
  "options.fromFilesHint":
    "(pick a whole .specs/ folder - manifest.json, *.spec.json, and any guides.json / views.json / required.json - or an exported .specs.zip, compressed or not)",
  "options.loadFromFiles": "Load from files",
  "options.orPaste": "Or paste bundle JSON",
  "options.loadPasted": "Load pasted bundle",
  "options.clearAll": "Clear all manual specs",
  "options.urlError":
    "URL must be a localhost address (http://127.0.0.1:PORT or http://localhost:PORT) or a remote https:// URL.",
  "options.urlErrorRemoteHttps": "A remote sidecar must use https:// (plaintext http is blocked).",
  "options.disableProject": "Disable this project",
  "options.enableProject": "Enable this project",
  "options.enabled": "Enabled",
  "options.disabled": "Disabled",
  "options.reconnect": "Reconnect",
  "options.remove": "Remove",
  "options.connected": "connected",
  "options.disconnected": "disconnected",
  "options.error": "error: {error}",
  "options.disabledState": "disabled · {state}",
  "options.noDomains": "no domains pinned",
  "options.specCount": "{count} spec(s)",
  "options.warnAllSites": "This project pins no domains; its specs show on every site you visit.",
  "options.warnInactive":
    "This project pins no domains, so it is inactive. Enabling the option below shows its specs on every site you visit.",
  "options.applyToAllSites": "Apply to all sites",
  "options.labelOptional": "Label (optional)",
  "options.tokenKeepPlaceholder": "leave blank to keep current token",
  "options.saveChanges": "Save changes",
  "options.urlRequired": "URL is required.",
  "options.couldNotConnect": "Could not connect: {error}",
  "options.teamViewsSummary": "Team default visibility (shared via Git)",
  "options.teamViewsNote":
    "One facet key per line: tag:<t>, file:<name.spec.json>, spec:<id>, or url:<glob>. Saved to .specs/views.json and applied for everyone on this project.",
  "options.saveTeamDefault": "Save team default",
  "options.savedTeamViews": "Saved to .specs/views.json.",
  "options.teamViewsFailed": "Failed: {errors}",
  // Manual-batch variants of the two sidecar sections: a local batch has no Git
  // write of its own, so it saves to storage and exports to commit.
  "options.batchViewsSummary": "Default view (saved to this batch)",
  "options.batchViewsNote":
    "One facet key per line: tag:<t>, file:<name.spec.json>, spec:<id>, or url:<glob>. Saved to this batch; Export the batch to write .specs/views.json and commit it via Git.",
  "options.batchViewsSaved": "Saved to this batch.",
  "options.batchGuidesSummary": "Batch guides",
  "options.batchGuidesNote":
    "Onboarding guides imported with this batch. Add or edit them from the popup; Export the batch to write them to .specs/guides.json.",
  "options.noProjects": "No projects yet. Add one below.",
  "options.untitled": "untitled",
  "options.sourcePasted": "pasted",
  "options.sourceFiles": "files",
  "options.sourceLocal": "Local",
  "options.export": "Export",
  "options.rename": "Rename",
  "options.projectNameLabel": "Project name",
  "options.domainsLabel": "Sites (comma-separated, optional)",
  "options.renamed": 'Renamed to "{project}".',
  "options.batchRemoved": "Batch removed.",
  "options.confirmRemoveConnection": "Remove this connection?",
  "options.confirmRemoveBatch": "Remove this batch?",
  "options.confirmClearLocal": "Clear all manual specs? This cannot be undone.",
  "options.sharedSpecs": "{count} shared spec(s)",
  "options.sitesPrefix": "Sites: {sites}",
  "options.sitesAll": "Sites: all sites (no domains pinned)",
  "options.noManualSpecs": "No manual specs loaded.",
  "options.urlTokenRequired": "Both URL and token are required.",
  "options.added": 'Added "{project}".',
  "options.couldNotAddBatch": "Could not add batch.",
  "options.loadedDuplicates":
    "Loaded (total {total} spec(s)). Note: duplicates {names} you imported earlier.",
  "options.loadedIdCollisions":
    "Loaded (total {total} spec(s)). Note: spec id(s) {ids} also exist in another project on the same site; only the first will render.",
  "options.loadedTotal": "Loaded. Total {count} spec(s) across all batches.",
  "options.pasteBundleFirst": "Paste a bundle first.",
  "options.invalidBundle": "Invalid bundle:\n- {errors}",
  "options.pickFiles": "Pick manifest.json and at least one .spec.json file.",
  "options.invalidSelection": "Invalid selection:\n- {errors}",
  "options.invalidZip": "Couldn't read the zip: {error}",
  "options.allCleared": "All manual specs cleared.",

  // Matching corpus card (local, opt-in) + the scored-match confirm loop.
  "options.corpusTitle": "Matching corpus (local, opt-in)",
  "options.corpusLead":
    "Collect local matching data to help tune Specpin's element matching. Off by default, stored only on this device, never uploaded; sensitive text (emails, long numbers) is masked.",
  "options.corpusOptIn": "Collect matching drift data on this device",
  "options.corpusCount": "{count} entries stored.",
  "options.corpusExport": "Export corpus (JSON)",
  "options.corpusClear": "Clear corpus",
  "options.corpusExported": "Exported {count} entries.",
  "options.corpusCleared": "Corpus cleared.",
  "options.corpusEmpty": "The corpus is empty, nothing to export.",
  "options.confirmClearCorpus": "Clear the local matching corpus? This cannot be undone.",
  "options.corpusKindSupervised": "Re-pin",
  "options.corpusKindPassive": "Auto-capture",
  "options.corpusConfirmed": "confirmed",
  "options.corpusPrev": "was {strategy} {confidence}",
  "options.corpusSpec": "spec: {id}",
  "options.corpusScorerPicked": "scorer picked #{n} of {count}",
  "options.corpusScorerAbstained": "scorer abstained ({count} candidates)",
  "options.corpusDetails": "Details",
  "options.confirmDeleteCorpusEntry": "Delete this corpus entry? This cannot be undone.",
  "options.corpusEntryDeleted": "Entry deleted.",
  "match.correct": "Correct",

  // Support & Feedback card.
  "options.supportFeedback": "Support & Feedback",
  "options.supportLead": "Found a bug or have a question? Reach the project on GitHub.",
  "options.reportIssue": "Report an Issue",
  "options.askQuestion": "Ask a Question",
  "options.changelog": "What's New",

  // Guide-mode tour chrome (the in-page walkthrough controls).
  "guide.defaultName": "Guided tour",
  "guide.next": "Next",
  "guide.prev": "Back",
  "guide.skip": "Skip",
  "guide.done": "Done",
  "guide.close": "Close guide",
  "guide.stepCounter": "{current} / {total}",
  "guide.elementMissing": "This step's element isn't on the page.",

  // Guide launch list + curation editor (popup / side panel).
  "guide.sectionTitle": "Guides",
  "guide.start": "Start",
  "guide.startDefault": "Start guided tour",
  "guide.newGuide": "New guide",
  "guide.edit": "Edit",
  "guide.delete": "Delete",
  "guide.deleteConfirm": 'Delete guide "{name}"?',
  "guide.noGuides": "No guides for this page yet.",
  "guide.editorTitleNew": "New guide",
  "guide.editorTitleEdit": "Edit guide",
  "guide.nameLabel": "Name",
  "guide.namePlaceholder": "Guide name",
  "guide.descLabel": "Description (optional)",
  "guide.stepsLabel": "Steps (in order)",
  "guide.addStepLabel": "Add a step",
  "guide.moveUp": "Move up",
  "guide.moveDown": "Move down",
  "guide.removeStep": "Remove step",
  "guide.addStep": "Add",
  "guide.missingSpec": "Missing spec: {id}",
  "guide.saveTo": "Save to",
  "guide.personal": "Personal (only you)",
  "guide.save": "Save guide",
  "guide.nameRequired": "A guide name is required.",
  "guide.emptyDefaultHint": "Leave steps empty to walk every spec in default order.",
  "guide.noTargets": "No project on this page can store a team guide; saved guides go to Personal.",
  "guide.saved": "Guide saved.",
  "guide.saveFailed": "Could not save guide: {error}",
  "guide.deleteFailed": "Could not delete guide: {error}",

  // Options: per-connection team-guides management.
  "options.teamGuidesSummary": "Team guides",
  "options.teamGuidesNote": "Named onboarding tours committed to .specs/guides.json.",
  "options.noTeamGuides": "No team guides.",

  // Capture/edit form: provenance authoring + Mark-reviewed.
  "capture.statusLabel": "Status",
  "capture.statusHint": "optional lifecycle",
  "capture.statusNeutral": "— (none)",
  "capture.linksLabel": "Links",
  "capture.linksHint": "tickets, docs, PRs (http/https)",
  "capture.addLink": "Add link",
  "capture.linkLabelPlaceholder": "Label (e.g. JIRA-123)",
  "capture.linkUrlPlaceholder": "https://…",
  "capture.linkRemove": "Remove link",
  "capture.verifiedByLabel": "Linked tests",
  "capture.verifiedByHint": "one repo-relative path per line; declared, not run",
  "capture.verifiedByPlaceholder": "tests/login.spec.ts",
  "capture.reviewLabel": "Review",
  "capture.markReviewed": "Mark reviewed",
  "capture.reviewedOn": "Reviewed {date}",
  "capture.notReviewed": "Not reviewed yet",
  "capture.reviewedByPlaceholder": "Reviewer (e.g. manual)",
  "capture.reviewedByWarning":
    "Committed to .specs/ and included in exports — do not enter PII/emails.",

  // Provenance/trust block shown on every reader surface.
  "prov.statusDraft": "Draft",
  "prov.statusApproved": "Approved",
  "prov.statusDeprecated": "Deprecated",
  "prov.linkedTests": "Linked tests ({count})",
  "prov.linkedTestsTitle":
    "Tests that declare this spec. specpin validate checks these paths exist; it does not run them.",
  "prov.reviewed": "Reviewed {when}",
  "prov.reviewedBy": "Reviewed {when} by {who}",
  "prov.stale": "Stale",
  "prov.staleTitle": "Not reviewed in over {days} days",
  // "No project serves this page" empty state (popup Option A + panel Option B).
  "emptyState.title": "No specs cover this page yet",
  "emptyState.subtitle": "Create a project for this site to start pinning specs onto its elements.",
  "emptyState.panelSubtitle":
    "Set up a project to pin living specs onto this site's elements. Everything you capture is saved as JSON in your repo.",
  "emptyState.newProject": "+ New project",
  "emptyState.startTitle": "Start specs for this page",
  "emptyState.step1Title": "Create a project",
  "emptyState.step1Body": "A .specs/ folder rooted at this site's origin.",
  "emptyState.step2Title": "Capture your first spec",
  "emptyState.step2Body": "Click any element to pin a rule or description onto it.",
  // "Specpin is off" paused state (a project serves the page but specs are hidden).
  "offState.title": "Specpin is off",
  "offState.hiddenOne": "{count} spec hidden on this page",
  "offState.hiddenOther": "{count} specs hidden on this page",
  "offState.subtitle": "Turn it back on above.",

  // Coverage mode: ghost markers on undocumented interactive elements (Alt+Shift+U)
  // + the popup / side-panel count line and per-marker actions.
  "coverage.capture": "Capture spec",
  "coverage.ignore": "Ignore this gap",
  "coverage.summary": "{interactive} interactive · {documented} documented · {gaps} gaps",
  "coverage.hint": "Alt+Shift+U marks undocumented elements on the page.",
  "coverage.captureAllGaps": "Capture all gaps ({count})",

  // Bulk capture: pick many elements → one shared-fields form → N specs. The
  // shared fields apply to every spec; each row's title is auto-derived + editable.
  "bulk.title": "Bulk capture",
  "bulk.selectedCount": "{count} elements",
  "bulk.sharedHint": "These fields apply to every spec below. Edit each title inline.",
  "bulk.elementsTitle": "Elements",
  "bulk.rowRemove": "Remove element",
  "bulk.duplicateTitle": "Same title as another row — make it unique",
  "bulk.save": "Save all",
  "bulk.rowOk": "Saved",
  "bulk.rowFailed": "Failed",
  "bulk.partial": "{failed} of {total} couldn't be saved. Fix the flagged rows and save again.",
  "bulk.empty": "No elements to capture.",

  // Built-in spec templates: prefill the capture + bulk forms (fill-empty only).
  // Rule bodies are localized so the prefill matches the UI language.
  "template.label": "Start from template",
  "template.none": "No template",
  "template.formValidation.label": "Form validation",
  "template.formValidation.rule1": "All required fields must be filled before submit.",
  "template.formValidation.rule2": "Invalid input shows an inline error message.",
  "template.apiError.label": "API error handling",
  "template.apiError.rule1": "A failed request shows a user-facing error, not a blank state.",
  "template.apiError.rule2": "The action can be retried without reloading the page.",
  "template.authFlow.label": "Auth flow",
  "template.authFlow.rule1": "Unauthenticated users are redirected to sign in.",
  "template.authFlow.rule2": "A successful sign-in returns the user to their intended page.",

  // Clone: duplicate a spec's content onto a newly-picked element (tooltip pin +
  // side-panel card, gated on writable).
  "clone.duplicate": "Duplicate to element",
  // Compact label for the side-panel card action; "clone.duplicate" is its tooltip.
  "clone.duplicateShort": "Clone",

  // Element-picker HUD: the on-screen banner shown while picking an element.
  // Each flow gets its own instruction; bulk adds a live count + Done control.
  "picker.hudLabel": "Element picker",
  "picker.hint.capture": "Click an element on the page to capture a spec.",
  "picker.hint.clone": "Click the element to clone this spec onto.",
  "picker.hint.relink": "Click the new element to link this spec to.",
  "picker.hint.bulk": "Click elements to select them, then Done.",
  "picker.selectedCount": "{count} selected",
  "picker.done": "Done",

  // Keyboard cheat-sheet: the in-page help overlay + the Options "Shortcuts" card.
  // One description per chord in chords.ts (keyed by that chord's descKey).
  "shortcuts.title": "Keyboard shortcuts",
  "shortcuts.close": "Close",
  "shortcuts.toggleEnabled": "Turn Specpin on or off",
  "shortcuts.cycleMode": "Cycle the display mode (tooltip / sidebar / modal)",
  "shortcuts.toggleCapture": "Toggle capture mode to document an element",
  "shortcuts.toggleGuide": "Start or stop the guided tour",
  "shortcuts.cycleSpec": "Move focus through the matched specs on the page",
  "shortcuts.toggleCoverage": "Toggle markers on undocumented interactive elements",
  "shortcuts.toggleHelp": "Show this keyboard shortcut list",
  "options.navShortcuts": "Shortcuts",
  "options.shortcuts": "Keyboard shortcuts",
  "options.shortcutsLead":
    "Every keyboard chord Specpin listens for. Press Alt+Shift+? on any page to open this list there.",

  // First-run welcome page (entrypoints/welcome), opened once on install.
  "welcome.title": "Welcome to Specpin",
  "welcome.lead":
    "Specpin pins your business specifications onto the elements of a running UI. Here is how to get started.",
  "welcome.step1": "Run specpin serve in a repo that has a .specs/ folder.",
  "welcome.step2": "Open Options and connect the printed sidecar URL + token.",
  "welcome.step3": "Open your app - specs render right on their elements.",
  "welcome.openOptions": "Open Options",
  "welcome.docsLink": "Read the docs",
} satisfies Record<string, string>;

export type Messages = typeof en;
export default en;
