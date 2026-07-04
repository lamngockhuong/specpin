---
title: specフォーマット
description: specの作成・レビューに必要なspec JSONの簡潔なタスク指向ガイド。
---

このページでは、specを作成またはレビューする際に操作するフィールドを説明します。コントリビューターレベルの完全なスキーマリファレンスは[GitHubの完全なスキーマリファレンス](https://github.com/lamngockhuong/specpin/blob/main/docs/schema-reference.md)を参照してください。

## specファイル

`.specs/`内の各`*.spec.json`ファイルは**SpecFile**：名前付きspecのグループです。

```json
{
  "$schema": "https://specpin.ohnice.app/schema/v1.json",
  "group": "Login",
  "specs": [
    {
      "id": "login-email",
      "title": { "en": "Email field", "vi": "Trường email" },
      "description": {
        "en": "User enters their email address here.",
        "vi": "Người dùng nhập địa chỉ email của họ vào đây."
      },
      "businessRules": [
        { "en": "Required; cannot be empty", "vi": "Bắt buộc; không được để trống" },
        { "en": "Must be a valid email format", "vi": "Phải đúng định dạng email" }
      ],
      "tags": ["login", "critical"],
      "preferredDisplayMode": "tooltip",
      "status": "approved",
      "links": [
        { "label": "JIRA-1234", "url": "https://issues.example.com/browse/JIRA-1234" }
      ],
      "verifiedBy": ["tests/login/email.spec.ts"],
      "fingerprint": {
        "testId": "login-email",
        "ariaLabel": null,
        "id": null,
        "cssSelector": "[data-spec-id='login-email']",
        "xpath": "//input[@data-spec-id='login-email']",
        "domPath": ["form", "label", "input"],
        "tagName": "input",
        "textContent": null,
        "attributes": { "type": "email" },
        "nearbyLabels": ["Email"],
        "positionHint": { "index": 0, "siblingCount": 1 },
        "frameworkHint": "react"
      },
      "meta": {
        "createdBy": "you@example.com",
        "createdAt": "2026-06-28T10:00:00Z",
        "updatedAt": "2026-06-28T10:00:00Z",
        "source": "manual",
        "reviewedAt": "2026-06-30T09:00:00Z",
        "reviewedBy": "alex"
      }
    }
  ]
}
```

## 編集するフィールド

### `id`（必須）

プロジェクト内でこのspecの一意の識別子。kebab-caseを使用します（例：`"login-email"`、`"deal-submit"`）。一度設定したら変更しないでください（拡張機能はこれを編集の追跡や個人の表示オーバーライドに使用します）。

### `title`（必須、ローカライズ済み）

specの見出し。これは**ロケールキーオブジェクト**であり、フラット文字列ではありません：

```json
{ "en": "Email field", "vi": "Trường email" }
```

少なくとも1つのロケールが必要です。キーはBCP-47ロケールコード（`en`、`vi`、`en-US`など）です。`"title": "Email field"`のようなフラット文字列は無効で、バリデーターに拒否されます。

### `description`（必須、ローカライズ済み）

specの本文テキスト。`title`と同じローカライズされたオブジェクト形式。各値は空であってはなりません。

Markdownのサブセットをサポートします（太字、斜体、リンク、リスト）。以下の[Markdownフォーマット](#markdownフォーマット)を参照してください。

### `businessRules`（任意、ローカライズされた配列）

ローカライズされたルール文字列の配列。各ルールは別々のロケールキーオブジェクトです：

```json
[
  { "en": "Required; cannot be empty", "vi": "Bắt buộc; không được để trống" },
  { "en": "Must be a valid email format", "vi": "Phải đúng định dạng email" }
]
```

各ルールはレンダリングされたspecで1つのリスト項目として表示されます。Markdownのサブセットをサポートします（太字、斜体、リンクのみ。ルール内のブロック構造は不可）。

### `tags`（任意）

文字列の配列（ローカライズなし）。タグは拡張機能でのフィルタリングとグループ化に使用されます：

```json
["login", "critical"]
```

### `preferredDisplayMode`（任意）

このspecがデフォルトでどのようにレンダリングされるか。`"tooltip"`、`"sidebar"`、`"modal"`のいずれか。省略した場合はプロジェクトの`settings.defaultDisplayMode`が使われ（それも省略した場合は`"tooltip"`が最終フォールバック）。

:::note
`"overlay"`と`"inline-badge"`は予約された（前方互換）モードです。設定した場合、レンダリング時に`"tooltip"`にフォールバックします。
:::

### `status`（任意）

specのライフサイクル状態。`"draft"`、`"approved"`、`"deprecated"`のいずれか。省略した場合、specはニュートラルです（デフォルト値はありません）。このフィールドはライフサイクルバッジと、レンダリングされたspecの「古い」表示を制御します。たとえば`deprecated`のspecはレビュアーが気付けるようフラグ付けされます。

```json
{ "status": "approved" }
```

### `links`（任意）

関連するチケット、ドキュメント、PRへの作成者が宣言した参照。`{ "label", "url" }`オブジェクトの配列（最大10個）。`url`は`http`または`https`である必要があります：

```json
[
  { "label": "JIRA-1234", "url": "https://issues.example.com/browse/JIRA-1234" },
  { "label": "Design doc", "url": "https://example.com/design" }
]
```

これらはレンダリングされたspec上にクリック可能なリンクとして表示されます（新しいタブで開きます）。手動で添付するコンテキストであり、Specpinはそれらを取得したり検証したりしません。

### `verifiedBy`（任意）

このspecを**宣言する**テストへのリポジトリ相対パス。文字列の配列（最大20個）。これはテスト結果ではなく、*宣言的なリンク*です：

```json
["tests/login/email.spec.ts", "e2e/auth.spec.ts"]
```

`specpin validate`は各パスがリポジトリに**存在する**ことをチェックします（リンク切れガード）。テストを実行することはなく、パスすることを示唆することもありません。UIはこれらを**リンクされた**テストとして表示します。「検証済み」や「パス」ではありません。リンクを正直に保つのは、他のspecフィールドと同様、あなたのレビュープロセス次第です。

## Markdownフォーマット

`description`と各`businessRules`項目は小さくて安全なMarkdownのサブセットをサポートします：

- **太字** `**テキスト**`、*斜体* `*テキスト*` または `_テキスト_`
- リンク `[ラベル](url)`（`http`、`https`、`mailto`のみリンクとしてレンダリング。他のスキームはプレーンテキストに降格）
- `description`のみ：箇条書きリスト（`- ` または `* `）、番号付きリスト（`1. `）、空行で区切られた段落、改行

各`businessRules`項目はインラインのみです（ルール内にブロックリストは不可。ルールは1つのリスト項目としてレンダリングされる1行です）。

レンダラーはすべてのユーザーテキストをエスケープし、許可リストのタグセット（`strong`、`em`、`a`、`ul`、`ol`、`li`、`p`、`br`）のみを出力するため、生のHTMLは無害のままです。

例：

```json
{
  "description": {
    "en": "User enters their **primary email**. This field:\n\n- Must be unique\n- Cannot be changed after signup\n\nSee [Privacy Policy](https://example.com/privacy) for details."
  }
}
```

太字、箇条書きリスト、クリック可能なリンクを含むフォーマットされたテキストとしてレンダリングされます。

## specが要素にリンクされる仕組み

`fingerprint`フィールドはページ上の要素を識別する複数のシグナルを保持します：

- `testId`、`ariaLabel`、`id`（完全なアンカー、存在する場合は最高信頼度）
- `cssSelector`、`xpath`、`domPath`（フォールバックセレクター）
- `textContent`、`nearbyLabels`（テキストベースのヒント）
- `positionHint`（兄弟インデックス + カウント）
- `frameworkHint`（例：`"react"`）

拡張機能はまず完全なアンカー（信頼度1.0）を試み、次にユニークなCSSセレクター（信頼度0.7）を試みます。どちらもマッチしない場合、specは`needsReview`とフラグ付けされます。

:::tip
マッチングを完全に確実にするには、コード内の要素に`data-spec-id`属性を追加します：

```html
<input data-spec-id="login-email" type="email" />
```

フィンガープリントの`testId`がこれをキャプチャし、マッチングは単純な属性ルックアップになります（脆弱性なし）。
:::

フィンガープリントを手動で編集する必要はほとんどありません。拡張機能のキャプチャフローが自動的に入力します。編集した場合は`specpin validate`を実行して引き続き有効であることを確認してください。

## `meta`ブロック

`meta`は来歴とタイムスタンプを保持します：

- `createdBy`（文字列、例：メールまたはユーザー名）
- `createdAt`、`updatedAt`（ISO 8601日時）
- `source`（`"manual"` または `"ai-generated"`）
- `reviewedAt`（ISO 8601日時）と`reviewedBy`（文字列）：拡張機能の**レビュー済みにする**アクションによって設定され、手動で作成するものではありません。`reviewedBy`は**PIIを含まないトークン**（名前やハンドルで、**メールではない**）でなければなりません。Gitにコミットされ、エクスポートにも含まれるためです。`reviewedAt`は「古い」インジケーターにも使われます（[設定](/ja/usage/settings/)の`stalenessThresholdDays`を参照）。

拡張機能はspecをキャプチャ、編集、またはレビュー済みにする際にこれらを設定します。手動で変更することはほとんどありません。

## 変更のバリデーション

specを編集した後、バリデーションを実行します：

```bash
specpin validate --dir .specs
```

これにより、すべての`.spec.json`がスキーマに対してチェックされ、`manifest.specFiles`がディスク上のファイルと同期していない場合に警告されます。

`specpin validate`は、各`verifiedBy`パスがリポジトリに存在することもチェックします。これはリンク切れガードであり、テストの実行ではありません（何も実行しません）。`.specs/`が`<repo>/.specs`にない場合は`--repo-root <path>`を渡し、パスが正しいルートに対して解決されるようにします。詳細は[CLIガイド](/ja/sidecar/cli/#specのオフラインバリデーション)を参照してください。

CIのspecリントについては[CLIガイド](/ja/sidecar/cli/#specのオフラインバリデーション)を参照してください。

## 完全なスキーマリファレンス

このページでは、specの作成とレビューに必要なフィールドを説明しています。完全なスキーマ（すべてのフィールド、内部バリデーションルール、TypeScript/Goバリデーターの詳細、`ViewsConfig`やフィンガープリントマッチングアルゴリズムなどの高度なトピック）については以下を参照してください：

**[GitHubのdocs/schema-reference.md](https://github.com/lamngockhuong/specpin/blob/main/docs/schema-reference.md)**
