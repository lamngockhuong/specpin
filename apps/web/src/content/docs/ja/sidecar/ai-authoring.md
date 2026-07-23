---
title: AIエージェントでspecを作成する
description: コーディングエージェント（Claude Code、Cursor、Codex）に@specpin/cliスキルでスキーマ準拠のspecを書かせ、validateして配信する。
---

Specpin自体はLLMを一切同梱しません。`specpin generate`はスタブであり、CLIがモデルを呼ぶことはありません。代わりに、**あなたのコーディングエージェント**（Claude Code、Cursor、Codexなど）が、`@specpin/cli`に同梱されたポータブルなスキルを通じてspecを作成します。エージェントはUIのソースを読み、スキーマ準拠の`.specs/*.spec.json`ファイルを書き、それらをmanifestに登録し、`specpin validate`を実行します。Goのsidecarは配信とvalidateだけを担います。

これは「CLIにエージェントが組み込まれている」という一般的なモデルの逆です。ここでは既存のエージェントが作者であり、CLIはそのオフラインのvalidator兼サーバーです。

## スキル

スキルは公開済みのnpmパッケージに含まれているため、何もインストールせずにエージェントが読み込めます：

- `https://unpkg.com/@specpin/cli@latest/skill/SKILL.md`
- `https://unpkg.com/@specpin/cli@latest/skill/references/<file>.md`

`SKILL.md`は単独で完結しています。必要に応じて読み込む3つのリファレンスがさらに掘り下げます：

- `schema-authoring.md` — v1 specの構造と、完全で有効な例。
- `fingerprint-strategy.md` — specを要素に紐付けるための、test-idを優先する判断ツリー。
- `cli-commands.md` — すべてのコマンドとそのexit code。

[canonicalなソースはGitHubにあります](https://github.com/lamngockhuong/specpin/tree/main/apps/cli/skill)。

## エージェントにスキルを指し示す

- **Claude Code（およびその他のkit形式のスキル）：** スキルをインストールするか、`SKILL.md`を取得してエージェントに渡します。UI要素のbusiness specを作成する、または`specpin` CLIを実行するという要求で起動します。
- **その他の任意のエージェント：** unpkgの`SKILL.md`のURL（またはその内容）をエージェントのコンテキストに貼り付け、画面のspecを作成するよう依頼します。

ここでAPIキー、認証、モデルの設定は不要です。sidecarはlocalhost専用で、`serve`実行時に自身のbearer tokenを出力します。

## 作成ループ

1. **スキャフォールド**（一度だけ）：`specpin init --project "<名前>" --domains <origin>`。[CLIのインストールと実行](/ja/sidecar/cli/)を参照。
2. **作成：** エージェントは対象の要素を選び、デフォルトでは既存の信号から要素をfingerprintします — 既存の`data-testid` / `data-spec-id`、マシン生成でない`id`、`aria-label`、または一意なセレクタ — アプリのソースを編集せずに行います。localeキー付きの`title` / `description`、任意の`businessRules`、`fingerprint`、`meta.source: "ai-generated"`を含む`<領域>.spec.json`を書きます。正確なanchorのために`data-spec-id`を追加するのは任意のopt-inで、プロジェクトが望む場合のみです。
   - エージェントが追加できる任意のprovenanceフィールド（すべて後方互換）：`links`（チケット / ドキュメント / PRのURL、`http`/`https`のみ）、`verifiedBy`（リポジトリ相対のテストパス — **宣言的**：`specpin validate`はファイルが*存在する*ことだけを確認し、実行もパスの保証もしないため、実在するファイルのみを列挙）、`status`（`draft` / `approved` / `deprecated`；中立なら省略）。
   - エージェントは`meta.reviewedAt` / `meta.reviewedBy`を**作成してはいけません**。これらは拡張機能のMark-reviewed操作で人間がスタンプするもので、`reviewedBy`はGitやエクスポートにコミットされる非PIIのtokenです（メールアドレスや個人の識別情報ではありません）。
3. **登録：** 新しいファイルを`manifest.json`の`specFiles[]`に追加します。
4. **validate：** `specpin validate`（exit 0が必須。exit 1の場合は`FAIL`行を修正）。リポジトリに存在しない`verifiedBy`パスがあるとvalidateは失敗します — これはテスト実行ではなく、リンク切れのチェックです。
5. **プレビュー：** `specpin serve`を実行すると、拡張機能がページ上にspecをライブでレンダリングします。

手動で作成したい場合は、ブラウザ内のフローについて[specのキャプチャと編集](/ja/usage/capturing-and-editing/)を参照してください。

## 実例

同梱のデモには、このスキルに従ってAIが作成したspecが含まれています：[`examples/demo-react-app/.specs/nav.spec.json`](https://github.com/lamngockhuong/specpin/blob/main/examples/demo-react-app/.specs/nav.spec.json)は、nav上の「Log out」ボタンに`data-spec-id="nav-logout"`のanchor経由でspecを紐付け、`specpin validate`をパスします（exit 0）。

デモアプリは慣習として各要素に`data-spec-id`を採用しているため、この例は**opt-in**の正確なanchorの経路を示します：属性を追加し、それを`fingerprint.testId`に反映し、残りの必須フィールドを埋め、登録し、validateします。ソースに触れたくないプロジェクトは、代わりに既存のマークアップからfingerprintを合成します（スキルのfingerprint戦略を参照）。

## ガードレール

- 出力は`meta.source: "ai-generated"`として印付けされ、ship前に人間がレビューすることを前提としています。
- エージェントはすべてのbusiness ruleを実際のコードまたは明示された要件に基づかせる必要があります — 決して捏造してはいけません。
- どちらのvalidatorも、多言語フィールドへのフラットな文字列と未知のキー（`additionalProperties: false`）を拒否するため、無効なspecは`specpin validate`で即座に失敗します。触れるフィールドについては[specフォーマット](/ja/sidecar/spec-format/)を参照してください。
