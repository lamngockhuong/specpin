---
title: CLIのインストールと実行
description: specpin CLI sidecarをビルド・実行して、ブラウザextensionにspecを配信する。
---

`specpin` CLIは、`.specs/`ディレクトリを安全なトークン認証付きlocalhost HTTP API経由で配信するGoのsidecarです。extensionはこれに接続してspecを読み込み、ライブ変更を監視します。

## インストール

現在、CLIはソースからビルドします。Go 1.26が必要です。

```bash
cd apps/cli
make build
```

`bin/specpin`が生成されます。バイナリをPATHに追加するか、直接呼び出すことができます。

## プロジェクトの初期化

アプリケーションリポジトリ（Specpinモノリポではなく）で、`.specs/`ディレクトリをスキャフォールドします：

```bash
specpin init --project "My App" --domains localhost:3000
```

プロジェクト名とUIが動作するドメインを含む`.specs/manifest.json`が作成されます。`domains`フィールドはこのプロジェクトのspecをどのサイトに表示するかを制御します。空の`domains`配列はspecをどのサイトにも表示できることを意味します（注意して使用してください）。

後で`manifest.json`を手動で編集できます。詳細は[specフォーマット](/ja/sidecar/spec-format/)を参照してください。

## specの配信

`.specs/`を含むディレクトリからsidecarを実行します：

```bash
specpin serve
```

以下のような出力が表示されます：

```
Specpin sidecar running.
  URL:     http://127.0.0.1:51234
  Token:   2da0480c1f8e9b3a...
```

URLとトークンをコピーします。extensionの接続設定に貼り付けます。次のステップは[プロジェクトの接続](/ja/usage/connecting-projects/)を参照してください。

`--port`を渡さない限りポートは自動選択されます：

```bash
specpin serve --port 5173
```

sidecarはセキュリティのために`127.0.0.1`のみにバインドします（`0.0.0.0`には決してバインドしません）。リクエストにはヘッダーに`Authorization: Bearer <token>`が必要です。CORSはextensionのorigin（`chrome-extension://`、`moz-extension://`、`safari-web-extension://`）のみを受け付け、ウェブoriginは拒否します。書き込みは`.specs/`に限定され（パストラバーサル防止）、アトミックで、クリーンなGit diffのためにpretty-printされます。

bearerトークンは`serve`を実行するたびに再生成されます。extensionが接続を失った場合は`serve`を再実行し、extensionの接続設定でトークンを更新してください。

## ライブリロード

sidecarはServer-Sent Events（SSE）経由で`.specs/`の変更を監視します。ディスク上の`.spec.json`ファイルを編集して保存すると、extensionが更新を受信してすぐにページを再レンダリングします。ブラウザのリフレッシュは不要です。

## specのオフラインバリデーション

specを配信せずにチェックするには：

```bash
specpin validate --dir .specs
```

終了コード：
- `0` すべて有効
- `1` 無効なspecが見つかった（specを修正）
- `2` 実行できなかった（ディレクトリまたはmanifestが見つからない）

デフォルトでは、`validate`は`manifest.specFiles`とディスク上の`*.spec.json`ファイルが一致しない場合に警告します。`--strict-manifest`を渡すと、その乖離を警告ではなくエラーにします。

:::tip
`specpin validate`をCIで使用してspecが無効なままマージされるのを防ぎます。例については[再利用可能なGitHub Action](https://github.com/lamngockhuong/specpin/tree/main/.github/actions/spec-lint)を参照してください。
:::

## `.specs/`フォルダー

specはプロジェクトリポジトリのルートにある`.specs/`に存在します：

```
.specs/
├── manifest.json          # index + プロジェクト設定
├── views.json             # チームのデフォルト表示設定（任意）
└── login.spec.json        # specのグループ
└── dashboard.spec.json
```

- `manifest.json`（必須）はspecファイルのインデックスで、`domains`、`defaultLocale`、`defaultDisplayMode`などのプロジェクト設定を保持します。
- 各`*.spec.json`ファイルは**SpecFile**：名前付きspecのグループ（例：`login.spec.json`はログイン画面のすべてのspecを保持します）。
- `views.json`（任意）はチームレベルの表示ルールを定義します（デフォルトでチームの全員に非表示になるspecを指定）。

すべてのファイルはJSON、Gitでバージョン管理、PRでレビュー可能です。

## Gitネイティブなワークフロー

specはリポジトリにコミットされたJSONファイルなので、コードと同じレビュープロセスに従います：

1. specを編集またはキャプチャします。
2. sidecarが`.specs/<file>.spec.json`（pretty-print）に変更を書き込みます。
3. `git diff`で正確に何が変わったかを確認できます。
4. コミット、プッシュ、PRを開きます。
5. チームメンバーがコード変更と並行してspec変更をレビューします。

specはマシンの外に出ることはありません。sidecarはlocalhostのみにバインドし、extensionはspecを任意のリモートサーバーに送信しません。

## 複数プロジェクト

異なるプロジェクトの複数のsidecarを異なるポートで実行できます：

```bash
# ターミナル1（プロジェクトA）
cd /path/to/project-a
specpin serve --port 51001

# ターミナル2（プロジェクトB）
cd /path/to/project-b
specpin serve --port 51002
```

extensionのOptionsページで各接続を追加します。extensionは各プロジェクトの`domains`フィールドに基づいてspecを正しいページにルーティングします。1つのextensionで多数のプロジェクトを同時に配信できます。
