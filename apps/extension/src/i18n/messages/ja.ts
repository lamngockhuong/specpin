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

  // Match-confidence badge + "why matched".
  "match.fuzzy": "セレクタ一致",
  "match.whyPrefix": "一致方法:",
  "match.byTestId": "data-spec-id",
  "match.byAria": "aria-label",
  "match.byId": "id",
  "match.byCss": "CSS セレクタ",

  // Page match-health summary + orphaned list.
  "health.summary": "{total} 件 · 正確 {exact} · あいまい {fuzzy} · 孤立 {orphaned}",
  "health.orphanedTitle": "孤立 ({count})",
  "health.orphanedHint":
    "これらの spec はこのページを対象にしていますが、要素が見つかりませんでした。",
  "health.orphanedNotFound": "このページに見つかりません",
  "health.fuzzy": "あいまい",

  // data-spec-id helper.
  "helper.weakAnchorTitle": "壊れやすいアンカー",
  "helper.weakAnchorHint":
    "この要素には安定したアンカーがありません。次の属性をソースに追加すると、一致が正確で安定します:",
  "helper.copySnippet": "コピー",
  "helper.copied": "コピーしました！",
  "helper.scanButton": "壊れやすい spec をスキャン",
  "helper.scanEmpty": "このページに壊れやすい spec はありません。",
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
  "options.tokenKeepPlaceholder": "現在のtokenを保持するには空のままにします",
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

  // Support & Feedback card.
  "options.supportFeedback": "サポートとフィードバック",
  "options.supportLead":
    "バグを見つけた、または質問がありますか？GitHubでプロジェクトに連絡してください。",
  "options.reportIssue": "問題を報告",
  "options.askQuestion": "質問する",

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
};

export default ja;
