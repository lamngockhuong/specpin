import type { Messages } from "./en.js";

// Japanese UI-chrome catalog. Typed as `Record<keyof Messages, string>` so it
// MUST cover every English key (a missing key is a compile error). Term decisions
// mirror vi.ts: "spec" stays "spec" (project jargon); "sidecar" stays "sidecar";
// "manual" stays "manual"; "token" stays "token"; "Specpin" stays "Specpin".
// Standard UI words use katakana (ツールチップ / サイドバー / モーダル / popup stays
// "popup" where the UI itself does). Japanese has no plural inflection, so the
// One/Other count pairs share the same wording.
const ja: Record<keyof Messages, string> = {
  // Shared across popup + side panel + renderers.
  "common.specpin": "Specpin",
  "common.loading": "読み込み中…",
  "common.showSpecsLabel": "このページのspecを表示",
  "common.showSpecsAria": "このページのすべてのSpecpin specを表示",
  "common.languageLabel": "言語",
  "common.specLanguageTitle": "specの言語",
  "common.searchPlaceholder": "specを検索…",
  "common.searchAria": "specを検索",
  "common.displayModeTitle": "表示モード",
  "common.modePerSpec": "specごとのモード",
  "common.modeTooltip": "ツールチップ",
  "common.modeSidebar": "サイドバー",
  "common.modeModal": "モーダル",
  "common.connectionSettings": "接続設定",
  "common.captureSpec": "+ specを記録",
  "common.edit": "編集",
  "common.delete": "削除",
  "common.cancel": "キャンセル",
  "common.ok": "OK",
  "common.close": "閉じる",
  "common.hidePanel": "パネルを隠す",
  "common.reopenPanel": "Specpin specを表示",
  "common.and": "と",
  "common.clickToHighlight": "クリックでページ上をハイライト",
  "common.copyLink": "リンクをコピー",
  "common.copyLinkTitle": "このspecへの共有リンクをコピー",
  "common.linkCopied": "リンクをコピーしました",
  "common.cannotActOnPage":
    "このページでは実行できません。先にウェブサイトのタブに切り替えてください。",
  "common.specsOnThisPage": "このページのspec",
  "common.needsReview": "要確認",
  "common.needReview": "{count} 件が要確認",
  "common.specsFoundOne": "{count} 件のspecが見つかりました",
  "common.specsFoundOther": "{count} 件のspecが見つかりました",
  "common.specsCountPill": "{count} 件のspec",
  // Status header (origin-scoped).
  "common.statusNotConfigured": "未設定",
  "common.statusConnectedSidecar": "接続済み (sidecar)",
  "common.statusDisconnectedSidecar": "切断 (sidecar)",
  "common.statusConnectedManual": "接続済み (manual)",
  "common.statusNoProject": "このページのプロジェクトがありません",
  // Spec-list empty states.
  "common.noSpecsForPage": "このページのspecはありません。",
  "common.specpinOff": "Specpinはオフです。",
  "common.noSearchMatch": "検索に一致するspecはありません。",
  // Provenance badge.
  "common.sourceManual": "manual",
  "common.sourceSidecar": "sidecar",
  "common.sourceManualTitle": "Manualインポートから (読み取り専用)",
  "common.sourceSidecarTitle": "sidecar接続から",
  // Facet filters.
  "common.filterTitle": "フィルター",
  "common.filterReset": "リセット",
  "common.filterTags": "タグ",
  "common.filterFiles": "ファイル",
  "common.filterSpecs": "spec",
  "common.filterThisPage": "このページ",
  "common.filterHidePage": "このページのspecを隠す",
  "common.scopeThisPage": "このページ",
  "common.scopeAll": "すべて",
  "common.scopeAria": "このページのspecまたはすべてのspecを表示",
  "common.markerTeam": "チーム",
  "common.markerTeamTitle": "チームのデフォルトで非表示",
  "common.markerYou": "あなた",
  "common.markerYouTitle": "あなたの個人設定",
  "common.viewChangelog": "変更履歴を見る",

  // Popup-only.
  "popup.openSidepanel": "サイドパネルで開く ⇥",
  "popup.newProject": "新規プロジェクト",
  "popup.exportLocal": "ローカルのspecをエクスポート",
  "popup.exportPickProject": "どのプロジェクトをエクスポートしますか？",

  // Shared "+ New project" inline form (popup + side panel).
  "addProject.modeLocal": "ローカルプロジェクト",
  "addProject.modeSidecar": "Sidecar",
  "addProject.projectPlaceholder": "プロジェクト名",
  "addProject.domainsPlaceholder": "ドメイン (任意、カンマ区切り)",
  "addProject.applyAllSites": "すべてのサイトに適用",
  "addProject.applyAllHint":
    "ドメインもこの設定もない場合、プロジェクトはどのページにも表示されません。",
  "addProject.urlPlaceholder": "http://127.0.0.1:PORT",
  "addProject.labelPlaceholder": "ラベル (任意)",
  "addProject.tokenPlaceholder": "Token",
  "addProject.create": "作成",
  "addProject.cancel": "キャンセル",
  "addProject.projectRequired": "プロジェクト名は必須です。",
  "addProject.couldNotCreate": "プロジェクトを作成できませんでした。",
  "addProject.urlTokenRequired": "URLとtokenは必須です。",
  "addProject.urlError":
    "URLはlocalhostアドレス (http://localhostまたはhttp://127.0.0.1、ポートは任意) かリモートのhttps:// URLである必要があります。",
  "addProject.urlErrorRemoteHttps":
    "リモートのsidecarはhttps://を使う必要があります (平文httpはブロックされます)。",
  "addProject.permissionDenied":
    "そのホストへのアクセス許可が拒否されたため、プロジェクトは追加されませんでした。",
  "addProject.couldNotConnect": "sidecarに接続できませんでした。",

  // Side panel per-spec controls.
  "sidepanel.hide": "隠す",
  "sidepanel.show": "表示",
  "sidepanel.hideThisSpec": "このspecを隠す",
  "sidepanel.showThisSpec": "このspecを表示",
  "sidepanel.editThisSpec": "このspecを編集",
  "sidepanel.deleteThisSpec": "このspecを削除",

  // Tooltip renderer.
  "tooltip.editSpec": "specを編集",
  "tooltip.deleteSpec": "specを削除",
  "tooltip.openInPanel": "サイドパネルで開く",

  // Spec delete flow (shared by tooltip + side panel).
  "spec.deleteConfirm": "このspecを削除しますか？必要ならGitから復元できます。",
  "spec.deleteConfirmLocal": "このspecを削除しますか？この操作は元に戻せません。",
  "spec.deleteConflict":
    "specが他の場所で変更されたため、表示を更新しました。削除は行われていません。",
  "spec.deleteFailed": "specを削除できませんでした: {error}",
  "spec.linkElementMissing": "このspecの要素はこのページにありません。",

  "digest.changedSince": "前回の訪問から{count}件が変更されました",
  "digest.markSeen": "すべて既読にする",
  "digest.tagNew": "新規",
  "digest.tagEdited": "編集済み",

  // Match-confidence badge + "why matched".
  "match.fuzzy": "セレクタ一致",
  "match.whyPrefix": "一致方法:",
  "match.byTestId": "data-spec-id",
  "match.byAria": "aria-label",
  "match.byId": "id",
  "match.byCss": "CSS セレクタ",
  "match.scored": "スコア一致",
  "match.signal.text": "テキスト",
  "match.signal.labels": "近傍ラベル",
  "match.signal.attributes": "属性",
  "match.signal.tag": "タグ",
  "match.signal.structure": "構造",
  "match.signal.position": "位置",

  // Page match-health summary + orphaned list.
  "health.summary":
    "{total} 件 · 正確 {exact} · スコア {scored} · あいまい {fuzzy} · 孤立 {orphaned}",
  "health.orphanedTitle": "孤立 ({count})",
  "health.orphanedHint":
    "これらの spec はこのページを対象にしていますが、要素が見つかりませんでした。",
  "health.orphanedNotFound": "このページに見つかりません",
  "health.fuzzy": "あいまい",
  "health.scored": "スコア",

  // data-spec-id helper.
  "helper.weakAnchorTitle": "壊れやすいアンカー",
  "helper.weakAnchorHint":
    "この要素には安定したアンカーがありません。次の属性をソースに追加すると、一致が正確で安定します:",
  "helper.copySnippet": "コピー",
  "helper.copied": "コピーしました！",
  "helper.scanTitle": "壊れやすい spec",

  // Capture / edit form.
  "capture.titleCapture": "specを記録",
  "capture.titleEdit": "specを編集",
  "capture.addLanguagePrompt": "言語を追加 (BCP-47、例: vi、ja、en-US):",
  "capture.invalidLocale": '"{code}" は有効なBCP-47ロケールコードではありません。',
  "capture.languageLabel": "言語",
  "capture.languageHint": "(言語ごとのタイトルと説明)",
  "capture.addLanguageTab": "言語を追加",
  "capture.titleField": "タイトル",
  "capture.titlePlaceholder": "ログインボタン",
  "capture.descField": "説明",
  "capture.descPlaceholder": "この要素の役割",
  "capture.rulesField": "ビジネスルール",
  "capture.rulesHint": "(1行に1つ)",
  "capture.tagsField": "タグ",
  "capture.tagsHint": "(カンマ区切り)",
  "capture.tagsPlaceholder": "auth, critical",
  "capture.displayModeLabel": "表示モード",
  "capture.modeDefault": "プロジェクトのデフォルトを使用",
  "capture.pageScopeField": "ページ範囲",
  "capture.pageScopeHint": "(パスの glob パターン。空欄 = 全ページ)",
  "capture.pageScopePlaceholder": "/orders/**",
  "capture.targetProject": "対象プロジェクト",
  "capture.targetFile": "対象ファイル",
  "capture.targetKindLocal": "ローカル",
  "capture.targetKindSidecar": "sidecar",
  "capture.noWritableProject":
    "このページに書き込み可能なプロジェクトがありません。先にローカルプロジェクトを作成するか、sidecarに接続してください。",
  "capture.relink": "要素を再リンク",
  "capture.relinkNote": "新しい要素に再リンクしました。適用するには保存してください。",
  "capture.couldNotSave": "保存できませんでした:",
  "capture.fieldTitle": "タイトル",
  "capture.fieldDescription": "説明",
  "capture.enterFieldsForDefault": "デフォルト言語 ({locale}) の{fields}を入力してください。",
  "capture.saveSpec": "specを保存",
  "capture.saveChanges": "変更を保存",
  "capture.saveFailed": "保存に失敗しました。sidecarを確認してください。",
  "capture.specChangedReloaded":
    "これらのspecは別の場所で変更され、再読み込みされました。編集内容を確認して保存し直してください。",
  "capture.fmtHint": "(Markdown対応)",
  "capture.fmtBold": "太字",
  "capture.fmtItalic": "斜体",
  "capture.fmtLink": "リンク",
  "capture.fmtBullet": "箇条書き",
  "capture.fmtNumber": "番号付きリスト",
  "capture.fmtLinkPrompt": "リンクURL (http、https、または mailto):",

  // Page right-click context menu (background-set titles; shown only when on).
  "contextMenu.parent": "Specpin",
  "contextMenu.pin": "この要素にspecをピン留め",
  "contextMenu.show": "ここにspecを表示",
  "contextMenu.capture": "specを記録 (要素を選択)",
  "contextMenu.toggleOff": "Specpinをオフにする",
  "contextMenu.noSpecHere": "この要素にspecはありません。",

  // Options page (static HTML + dynamic rows).
  "options.pageTitle": "Specpin 設定",
  // サイドバーのナビゲーションラベル (下のセクション見出しの短縮形)。
  "options.navSpec": "Spec",
  "options.navAppearance": "外観",
  "options.navToolbar": "ツールバー",
  "options.navCorpus": "マッチング",
  "options.navSupport": "サポート",
  // Spec ペイン内のセグメントコントロール: ライブ sidecar と貼り付けバンドル。
  "options.specTabLive": "ライブ",
  "options.specTabManual": "手動",
  "options.connectedProjects": "接続済みプロジェクト",
  "options.connectedLead":
    "各プロジェクトで <code>specpin serve</code> を実行し、下にそのURLとtokenを追加してください。spec は、プロジェクトのmanifestの <code>domains</code> にそのページが含まれている場合にのみ表示されます。",
  "options.addProject": "プロジェクトを追加",
  "options.sidecarUrl": "sidecar URL",
  "options.labelField": "ラベル",
  "options.optional": "(任意)",
  "options.labelPlaceholder": "例: Acme CRM",
  "options.token": "Token",
  "options.tokenPlaceholder": "bearer tokenを貼り付け",
  "options.applyAllLabel":
    "このプロジェクトがドメインをピン留めしていない場合、すべてのサイトに適用",
  "options.testAddProject": "テストしてプロジェクトを追加",
  "options.appearance": "外観",
  "options.appearanceLead":
    "Specpin自身のインターフェースの見た目です。すべてのSpecpin画面 (popup、サイドパネル、設定、ページ内のツールチップ/サイドバー/モーダル) に適用されます。",
  "options.theme": "テーマ",
  "options.badgeNumberingLabel": "specバッジに番号を表示 (Sの代わりに位置を表示)",
  "options.themeSystem": "システムのデフォルト",
  "options.themeLight": "ライト",
  "options.themeDark": "ダーク",
  "options.languageSetting": "言語",
  "options.languageSettingLead":
    "Specpin自身のインターフェースの言語です。プロジェクトのspec内容の言語とは独立しています。",
  "options.uiLanguageSystem": "システムのデフォルト",
  "options.toolbarIcon": "ツールバーアイコン",
  "options.toolbarLead":
    "Specpinのツールバーアイコンをクリックしたときに開くものです。<strong>Chromeのみ</strong>: Firefoxではアイコンは常にpopupを開き、サイドパネルはFirefox自身のサイドバー切り替え (表示 → サイドバー) から開きます。",
  "options.toolbarLabel": "ツールバーアイコンをクリックしたとき",
  "options.toolbarPopup": "popupを開く",
  "options.toolbarSidepanel": "サイドパネルを開く",
  "options.manualSpecs": "手動spec (sidecarなし)",
  "options.manualLead":
    'バンドルを貼り付けると、<code>specpin serve</code> を実行せずにspecを表示できます。読み取り専用: 記録には依然としてsidecarが必要です。形式: <code>{ "manifest": {…}, "files": { "x.spec.json": {…} } }</code>',
  "options.fromFiles": "ファイルから",
  "options.fromFilesHint": "(manifest.json と1つ以上の *.spec.json を選択)",
  "options.loadFromFiles": "ファイルから読み込む",
  "options.orPaste": "またはバンドルJSONを貼り付け",
  "options.loadPasted": "貼り付けたバンドルを読み込む",
  "options.clearAll": "すべての手動specを消去",
  "options.urlError":
    "URLはlocalhostアドレス (http://127.0.0.1:PORTまたはhttp://localhost:PORT) かリモートのhttps:// URLである必要があります。",
  "options.urlErrorRemoteHttps":
    "リモートのsidecarはhttps://を使う必要があります (平文httpはブロックされます)。",
  "options.disableProject": "このプロジェクトを無効化",
  "options.enableProject": "このプロジェクトを有効化",
  "options.enabled": "有効",
  "options.disabled": "無効",
  "options.reconnect": "再接続",
  "options.remove": "削除",
  "options.connected": "接続済み",
  "options.disconnected": "切断",
  "options.error": "エラー: {error}",
  "options.disabledState": "無効 · {state}",
  "options.noDomains": "ドメイン未設定",
  "options.specCount": "{count} 件のspec",
  "options.warnAllSites":
    "このプロジェクトはドメインをピン留めしていないため、specは訪問するすべてのサイトに表示されます。",
  "options.warnInactive":
    "このプロジェクトはドメインをピン留めしていないため、非アクティブです。下のオプションを有効にすると、訪問するすべてのサイトにspecが表示されます。",
  "options.applyToAllSites": "すべてのサイトに適用",
  "options.labelOptional": "ラベル (任意)",
  "options.tokenKeepPlaceholder": "現在のtokenを保持するには空のままにしてください",
  "options.saveChanges": "変更を保存",
  "options.urlRequired": "URLは必須です。",
  "options.couldNotConnect": "接続できませんでした: {error}",
  "options.teamViewsSummary": "チームのデフォルト表示 (Gitで共有)",
  "options.teamViewsNote":
    "1行に1つのfacetキー: tag:<t>、file:<name.spec.json>、spec:<id>、または url:<glob>。.specs/views.json に保存され、このプロジェクトの全員に適用されます。",
  "options.saveTeamDefault": "チームのデフォルトを保存",
  "options.savedTeamViews": ".specs/views.json に保存しました。",
  "options.teamViewsFailed": "失敗: {errors}",
  "options.noProjects": "まだプロジェクトがありません。下で追加してください。",
  "options.untitled": "無題",
  "options.sourcePasted": "貼り付け",
  "options.sourceFiles": "ファイル",
  "options.sourceLocal": "ローカル",
  "options.export": "エクスポート",
  "options.rename": "名前を変更",
  "options.projectNameLabel": "プロジェクト名",
  "options.domainsLabel": "サイト (カンマ区切り、任意)",
  "options.renamed": '"{project}" に名前を変更しました。',
  "options.batchRemoved": "バッチを削除しました。",
  "options.confirmRemoveConnection": "この接続を削除しますか？",
  "options.confirmRemoveBatch": "このバッチを削除しますか？",
  "options.confirmClearLocal": "すべての手動specを消去しますか？元に戻せません。",
  "options.sharedSpecs": "{count} 件の共有spec",
  "options.sitesPrefix": "サイト: {sites}",
  "options.sitesAll": "サイト: すべてのサイト (ドメイン未設定)",
  "options.noManualSpecs": "手動specが読み込まれていません。",
  "options.urlTokenRequired": "URLとtokenの両方が必要です。",
  "options.added": '"{project}" を追加しました。',
  "options.couldNotAddBatch": "バッチを追加できませんでした。",
  "options.loadedDuplicates":
    "読み込みました (合計 {total} 件のspec)。注意: 以前にインポートした {names} と重複しています。",
  "options.loadedIdCollisions":
    "読み込みました (合計 {total} 件のspec)。注意: spec id {ids} は同じサイトの別プロジェクトにも存在します。最初のものだけが表示されます。",
  "options.loadedTotal": "読み込みました。すべてのバッチで合計 {count} 件のspec。",
  "options.pasteBundleFirst": "先にバンドルを貼り付けてください。",
  "options.invalidBundle": "無効なバンドル:\n- {errors}",
  "options.pickFiles": "manifest.json と少なくとも1つの .spec.json ファイルを選択してください。",
  "options.invalidSelection": "無効な選択:\n- {errors}",
  "options.allCleared": "すべての手動specを消去しました。",

  // Matching corpus card (local, opt-in) + confirm loop.
  "options.corpusTitle": "マッチングコーパス (ローカル、オプトイン)",
  "options.corpusLead":
    "Specpin の要素マッチングを調整するため、マッチングデータをローカルに収集します。デフォルトはオフ、この端末にのみ保存し、アップロードはしません。機微なテキスト (メール、長い数字列) はマスクされます。",
  "options.corpusOptIn": "この端末でマッチングのずれデータを収集する",
  "options.corpusCount": "{count} 件を保存済み。",
  "options.corpusExport": "コーパスをエクスポート (JSON)",
  "options.corpusClear": "コーパスを消去",
  "options.corpusExported": "{count} 件をエクスポートしました。",
  "options.corpusCleared": "コーパスを消去しました。",
  "options.corpusEmpty": "コーパスは空です。エクスポートする項目がありません。",
  "options.confirmClearCorpus": "ローカルのマッチングコーパスを消去しますか？元に戻せません。",
  "options.corpusKindSupervised": "再ピン留め",
  "options.corpusKindPassive": "自動記録",
  "options.corpusConfirmed": "確認済み",
  "options.corpusPrev": "以前は {strategy} {confidence}",
  "options.corpusSpec": "spec: {id}",
  "options.corpusScorerPicked": "スコアラーは候補 #{n}/{count} を選択",
  "options.corpusScorerAbstained": "スコアラーは判定なし（候補 {count} 件）",
  "options.corpusDetails": "詳細",
  "options.confirmDeleteCorpusEntry": "このコーパス項目を削除しますか？元に戻せません。",
  "options.corpusEntryDeleted": "項目を削除しました。",
  "match.correct": "正しい",

  // Support & Feedback card.
  "options.supportFeedback": "サポートとフィードバック",
  "options.supportLead":
    "バグを見つけた、または質問がありますか？GitHubでプロジェクトに連絡してください。",
  "options.reportIssue": "問題を報告",
  "options.askQuestion": "質問する",
  "options.changelog": "新着情報",

  // Guide-mode tour chrome (the in-page walkthrough controls).
  "guide.defaultName": "ガイドツアー",
  "guide.next": "次へ",
  "guide.prev": "戻る",
  "guide.skip": "スキップ",
  "guide.done": "完了",
  "guide.close": "ガイドを閉じる",
  "guide.stepCounter": "{current} / {total}",
  "guide.elementMissing": "このステップの要素はページにありません。",

  // Guide launch list + curation editor (popup / side panel).
  "guide.sectionTitle": "ガイド",
  "guide.start": "開始",
  "guide.startDefault": "ガイドツアーを開始",
  "guide.newGuide": "+ 新規ガイド",
  "guide.edit": "編集",
  "guide.delete": "削除",
  "guide.deleteConfirm": 'ガイド "{name}" を削除しますか？',
  "guide.noGuides": "このページのガイドはまだありません。",
  "guide.editorTitleNew": "新規ガイド",
  "guide.editorTitleEdit": "ガイドを編集",
  "guide.nameLabel": "名前",
  "guide.namePlaceholder": "ガイド名",
  "guide.descLabel": "説明 (任意)",
  "guide.stepsLabel": "ステップ (順番)",
  "guide.addStepLabel": "ステップを追加",
  "guide.moveUp": "上へ",
  "guide.moveDown": "下へ",
  "guide.removeStep": "ステップを削除",
  "guide.addStep": "追加",
  "guide.missingSpec": "見つからないspec: {id}",
  "guide.saveTo": "保存先",
  "guide.personal": "個人 (自分のみ)",
  "guide.save": "ガイドを保存",
  "guide.nameRequired": "ガイド名は必須です。",
  "guide.emptyDefaultHint":
    "ステップを空のままにすると、すべてのspecをデフォルトの順序でたどります。",
  "guide.noTargets":
    "このページのどのプロジェクトもチームガイドを保存できません。保存したガイドは個人に保存されます。",
  "guide.saved": "ガイドを保存しました。",
  "guide.saveFailed": "ガイドを保存できませんでした: {error}",
  "guide.deleteFailed": "ガイドを削除できませんでした: {error}",

  // Options: per-connection team-guides management.
  "options.teamGuidesSummary": "チームガイド",
  "options.teamGuidesNote": ".specs/guides.json にコミットされる名前付きオンボーディングツアー。",
  "options.noTeamGuides": "チームガイドはありません。",

  // Capture/edit form: provenance authoring + Mark-reviewed.
  "capture.statusLabel": "ステータス",
  "capture.statusHint": "任意のライフサイクル",
  "capture.statusNeutral": "— (なし)",
  "capture.linksLabel": "リンク",
  "capture.linksHint": "チケット、ドキュメント、PR (http/https)",
  "capture.addLink": "リンクを追加",
  "capture.linkLabelPlaceholder": "ラベル (例: JIRA-123)",
  "capture.linkUrlPlaceholder": "https://…",
  "capture.linkRemove": "リンクを削除",
  "capture.verifiedByLabel": "関連テスト",
  "capture.verifiedByHint": "1行に1つのリポジトリ相対パス。宣言のみで実行はしません",
  "capture.verifiedByPlaceholder": "tests/login.spec.ts",
  "capture.reviewLabel": "レビュー",
  "capture.markReviewed": "レビュー済みにする",
  "capture.reviewedOn": "{date} にレビュー",
  "capture.notReviewed": "未レビュー",
  "capture.reviewedByPlaceholder": "レビュアー (例: manual)",
  "capture.reviewedByWarning":
    ".specs/ にコミットされエクスポートにも含まれます — 個人情報/メールは入力しないでください。",

  // Provenance/trust block shown on every reader surface.
  "prov.statusDraft": "ドラフト",
  "prov.statusApproved": "承認済み",
  "prov.statusDeprecated": "非推奨",
  "prov.linkedTests": "関連テスト ({count})",
  "prov.linkedTestsTitle":
    "このspecを宣言するテスト。specpin validate はパスの存在を確認しますが、実行はしません。",
  "prov.reviewed": "{when} にレビュー",
  "prov.reviewedBy": "{who} が {when} にレビュー",
  "prov.stale": "古い",
  "prov.staleTitle": "{days} 日以上レビューされていません",
  // 「このページを提供するプロジェクトがありません」の空状態。
  "emptyState.title": "このページにはまだ仕様がありません",
  "emptyState.subtitle": "このサイト用のプロジェクトを作成して、要素に仕様をピン留めしましょう。",
  "emptyState.panelSubtitle":
    "プロジェクトを作成して、このサイトの要素に生きた仕様をピン留めできます。記録した内容はすべてリポジトリ内に JSON として保存されます。",
  "emptyState.newProject": "+ 新規プロジェクト",
  "emptyState.startTitle": "このページの仕様を始める",
  "emptyState.step1Title": "プロジェクトを作成",
  "emptyState.step1Body": "このサイトの origin をルートとする .specs/ フォルダー。",
  "emptyState.step2Title": "最初の仕様を記録",
  "emptyState.step2Body": "任意の要素をクリックして、ルールや説明をピン留めします。",
  // 一時停止状態「Specpin はオフです」(プロジェクトはあるが仕様が非表示)。
  "offState.title": "Specpin はオフです",
  "offState.hiddenOne": "このページで {count} 件の仕様が非表示です",
  "offState.hiddenOther": "このページで {count} 件の仕様が非表示です",
  "offState.subtitle": "上のスイッチをオンに戻してください。",

  // カバレッジモード: 仕様のない操作要素にゴーストマーカーを表示 (Alt+Shift+U)
  // + popup / サイドパネルの件数行と各マーカーの操作。
  "coverage.capture": "仕様を記録",
  "coverage.ignore": "この要素を無視",
  "coverage.summary": "操作要素 {interactive} · 記録済み {documented} · 未記録 {gaps}",
  "coverage.hint": "Alt+Shift+U でページ上の未記録の要素を表示します。",
  "coverage.captureAllGaps": "未記録をすべて記録 ({count})",

  // 一括記録: 複数の要素を選択 → 共通フォーム → N 件の仕様。共通フィールドは
  // すべての仕様に適用され、各行のタイトルは自動生成後にその場で編集できます。
  "bulk.title": "一括記録",
  "bulk.selectedCount": "{count} 個の要素",
  "bulk.sharedHint":
    "これらのフィールドは下のすべての仕様に適用されます。タイトルは各行で編集できます。",
  "bulk.elementsTitle": "要素",
  "bulk.rowRemove": "要素を削除",
  "bulk.duplicateTitle": "他の行とタイトルが重複しています — 一意の名前にしてください",
  "bulk.save": "すべて保存",
  "bulk.rowOk": "保存しました",
  "bulk.rowFailed": "失敗",
  "bulk.partial":
    "{total} 件中 {failed} 件を保存できませんでした。印の付いた行を修正して再度保存してください。",
  "bulk.empty": "記録する要素がありません。",

  // 組み込みの仕様テンプレート: 記録フォーム + 一括フォームを補完 (空欄のみ)。
  // ルール本文は UI 言語に合わせてローカライズされます。
  "template.label": "テンプレートから開始",
  "template.none": "テンプレートなし",
  "template.formValidation.label": "フォームのバリデーション",
  "template.formValidation.rule1": "送信前に必須項目をすべて入力する必要があります。",
  "template.formValidation.rule2": "不正な入力にはその場でエラーメッセージを表示します。",
  "template.apiError.label": "API エラー処理",
  "template.apiError.rule1": "リクエスト失敗時は空白ではなくユーザー向けのエラーを表示します。",
  "template.apiError.rule2": "ページを再読み込みせずに操作を再試行できます。",
  "template.authFlow.label": "認証フロー",
  "template.authFlow.rule1": "未認証のユーザーはサインインへリダイレクトされます。",
  "template.authFlow.rule2": "サインイン成功後、ユーザーは目的のページに戻ります。",

  // クローン: 仕様の内容を新しく選んだ要素に複製 (ツールチップのピン + サイド
  // パネルのカード、書き込み可能な場合のみ表示)。
  "clone.duplicate": "要素に複製",
  "clone.duplicateShort": "複製",
};

export default ja;
