---
title: CLIのインストールと実行
description: specpin CLI sidecarをビルド・実行して、ブラウザ拡張機能にspecを配信する。
---

`specpin` CLIは、`.specs/`ディレクトリを安全なトークン認証付きlocalhost HTTP API経由で配信するGoのsidecarです。拡張機能はこれに接続してspecを読み込み、ライブ変更を監視します。

## インストール

CLIはnpmからインストールします。OSとCPUに合ったビルド済みバイナリを自動でダウンロードします：

```bash
npm install -g @specpin/cli    # または: pnpm add -g @specpin/cli
specpin --version

# またはインストールせずに実行:
npx @specpin/cli serve
```

バイナリを直接入手したい場合は、[最新のCLIリリース](https://github.com/lamngockhuong/specpin/releases?q=cli)から`specpin-<os>-<arch>`をダウンロードするか、ソースからビルド（Go 1.26が必要）：

```bash
cd apps/cli
make build      # -> bin/specpin
```

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

URLとトークンをコピーします。拡張機能の接続設定に貼り付けます。次のステップは[プロジェクトの接続](/ja/usage/connecting-projects/)を参照してください。

`--port`を渡さない限りポートは自動選択されます：

```bash
specpin serve --port 5173
```

デフォルトでは、sidecarは`127.0.0.1`のみにバインドします。リクエストにはヘッダーに`Authorization: Bearer <token>`が必要です。CORSは拡張機能のorigin（`chrome-extension://`、`moz-extension://`、`safari-web-extension://`）のみを受け付け、ウェブoriginは拒否します。書き込みは`.specs/`に限定され（パストラバーサル防止）、直列化され、クリーンなGit diffのためにpretty-printされます。

bearerトークンは`serve`を実行するたびに再生成されます。`--token <secret>`を渡す（または環境変数`SPECPIN_TOKEN`を設定する）と安定したトークンを固定でき、再起動してもすべてのクライアントが切断されなくなります：

```bash
specpin serve --port 5173 --token "$(openssl rand -hex 24)"
```

ランダムトークンで再起動した後に拡張機能の接続が切れた場合は、`serve`を再実行し、拡張機能の接続設定でトークンを更新してください。

## リモートマシンで配信する

デフォルトでは、Specpinは単一ユーザーのlocalhostツールです。1つの`.specs/`をチームで共有するには、共有ホストでsidecarを実行し、拡張機能を**HTTPS**経由で接続します。Goバイナリはプレーンなhttpのみを話します。**TLSは前段のリバースプロキシ**が終端します。リモートはHTTPSが*必須*です。拡張機能のリクエストはsecure contextで実行されるため、プレーンな`http://`のリモートはmixed contentとしてブロックされます。

推奨：sidecarをloopbackに保ち、プロキシ（Caddy、nginx、Cloudflare Tunnel）を**同じホスト**で実行し、ポートとトークンを固定します：

```bash
specpin serve --port 51234 --token "$(openssl rand -hex 24)"
```

```
# Caddy
specs.example.com {
  reverse_proxy 127.0.0.1:51234
}
```

`--host <addr>`は、非loopbackアドレスにバインドします（「別ホストにプロキシを置く」上級ケース向け）。これはプロキシを経路に**自動的に入れるわけではなく**、生の**プレーンテキストかつトークンのみ**のポートを直接公開します。そのポートはfirewallで保護し、必ず`--port`を固定してください。loopback以外にバインドすると、serveコマンドは明確な警告を表示します。

### ドメインがない場合：IPで配信する

IPのみでドメインのない社内サーバーはCaddyの*自動*HTTPSを使えませんが、拡張機能は`https://<ip>`をそのまま受け付けます。証明書のSANには素のIPを指定できるため、ドメインは不要です。2つの方法があり、どちらもすべてのブラウザで動作します。

- **内部CAによるHTTPS。** Caddyのサイトアドレスに素のIPを指定し`tls internal`を付けるか（`192.168.1.50 { tls internal; reverse_proxy 127.0.0.1:51234 }`）、nginx向けに`mkcert 192.168.1.50` / opensslでIP-SAN証明書を発行します。**ルートCA**をチームのブラウザに一度配布してから、`https://192.168.1.50`へ接続します。プライベートLANのIPでもパブリックIPでも使えます。
- **localhostへのSSHトンネル。** `ssh -N -L 9123:127.0.0.1:51234 user@192.168.1.50`でsidecarをloopbackに保ったまま、`http://localhost:9123`へ接続します。`localhost`は常に免除されるため証明書は不要です。

素の`http://<ip>`は使えません。ブラウザがプレーンテキストのリモートをブロックするためです（プライベートLANのIPはChrome 142+のLocal Network Access経由でのみ動作しますが、拡張機能のservice workerからは許可プロンプトを出せず、Firefoxには同等の仕組みがありません）。詳しいレシピはrun guideの「No domain? Serve over IP」セクションを参照してください。

:::caution
bearerトークンは、ブラウザ以外のネットワーククライアントに対する唯一の認可境界です（CORSはブラウザのみを制約します）。パスワードのように扱い、帯域外（out-of-band）で配布してください。非loopbackの生ポートはプレーンテキストです。HTTPSプロキシを前段に置かずにインターネットへ公開しないでください。
:::

動作するCaddy + nginxの例（SSEバッファリング、CORSプリフライト）と完全な脅威モデルについては、実行ガイドの「Serve on a remote machine」セクションを参照してください。

## ライブリロード

sidecarはServer-Sent Events（SSE）経由で`.specs/`の変更を監視します。ディスク上の`.spec.json`ファイルを編集して保存すると、拡張機能が更新を受信してすぐにページを再レンダリングします。ブラウザのリフレッシュは不要です。

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

### `verifiedBy`パスをチェックする

`validate`は、spec上のすべての`verifiedBy`パスがリポジトリに**存在する**こともチェックします。これはリンク切れガードです。テストを実行することはなく、パスすることを示唆することもありません。テスト名を挙げるspecは、そのテストへのリンクを*宣言する*だけです。

パスはリポジトリルートに対して解決されます。デフォルトは`--dir`の親です（`<repo>/.specs`にある`.specs/`には追加のフラグは不要）。`.specs/`が別の場所にある場合は、validateにルートを指定します：

```bash
specpin validate --dir path/to/.specs --repo-root path/to/repo
```

パスはリポジトリ内に留まる必要があります：絶対パス、`../`によるトラバーサル、ルートから外に出るシンボリックリンクは拒否されます。存在しない`verifiedBy`パスは`1`で終了します。解決に使える読み取り可能なワーキングツリーがない場合、チェックはノート付きでスキップされます（実行を失敗させません）。

:::tip
`specpin validate`をCIで使用してspecが無効なままマージされるのを防ぎます。例については[再利用可能なGitHub Action](https://github.com/lamngockhuong/specpin/tree/main/.github/actions/spec-lint)を参照してください。
:::

## specの健全性レポート

`specpin report`は`.specs/`ディレクトリをオフラインで監査し、**freshness**、**spec stats**、**必須specチェック**の3つを出力します。デフォルトは警告のみなので、明示的に有効化するまではビルドを壊さずにCIでガバナンスシグナルを可視化できます。

```bash
specpin report --dir .specs
specpin report --dir .specs --json   # CIがパースする構造化出力
```

**Freshness**はレビューが古くなったspecを検出します。specは`meta.reviewedAt`が`settings.stalenessThresholdDays`（デフォルト90）より古いとき*stale*です。`reviewedAt`がないspecは*never-reviewed*で、別途報告され、staleとしてカウントされることはありません。Freshnessは*編集*の新しさではなく*レビュー*の新しさを測るため、意図的に`updatedAt`へのフォールバックはありません。

**Spec stats**はspecをstatusごと、fileごとに集計します。UI要素ではなく*spec*を数えます：レポートはブラウザなしでオフライン実行されるため、カバレッジ%は約束しません。要素カバレッジは拡張機能でのみ測定できます。

**必須specチェック**は`.specs/required.json`を読み、そこに列挙された各idのうち一致するspecがないものを検出します。存在のみをチェックし、要素マッチングは行いません。ファイルがなければチェックはスキップされます。

```json
// .specs/required.json
{
  "version": "1.0",
  "required": ["login-submit-btn", "dashboard-stat-revenue"]
}
```

終了コード：
- `0` レポート生成（警告のみ。デフォルト）
- `1` `--fail-on`条件がトリガーされた
- `2` 実行できなかった（ディレクトリまたはmanifestが見つからない）、または未知の`--fail-on`条件が渡された

### `--fail-on`でCIをゲートする

デフォルトでは何もビルドを失敗させません。`--fail-on`（カンマ区切りの条件リスト）で有効化します：

```bash
specpin report --dir .specs --fail-on missing-required
specpin report --dir .specs --fail-on stale,missing-required
```

| 条件 | 失敗する条件 |
|------|--------------|
| `stale` | specの`reviewedAt`がしきい値より古い |
| `draft-committed` | コミット済みのspecが`status: "draft"`を持つ |
| `missing-required` | `required.json`のidに一致するspecがない |
| `missing-verifiedby` | specが`verifiedBy`パスを一つも宣言していない |

`missing-verifiedby`はspecが`verifiedBy`を*宣言している*かどうかのみをチェックします。宣言されたパスの存在を確認する`validate`とは異なります。未知の条件は黙って無視されるのではなく`2`で終了し、`never-reviewed`のspecは報告されますがゲートすることはありません。

:::tip
[再利用可能なGitHub Action](https://github.com/lamngockhuong/specpin/tree/main/.github/actions/spec-lint)は`report-fail-on`入力を受け取り、このゲートをCIで実行します。空にするとゲートはスキップされます。
:::

## specのフォーマット

サイドカー、`specpin init`、拡張機能はいずれも`.specs/`のJSONを単一の正規形で書き込みます：2スペースインデント、完全展開（オブジェクト/配列の各要素を1行ずつ）、末尾に改行。`specpin format`はspecをその形に書き直すため、拡張機能で行った編集でもGit差分が最小限で読みやすくなります。

```bash
specpin format --dir .specs          # その場で書き直す
specpin format --check --dir .specs  # 差分を報告し、書き込まない（CI / pre-commit用）
```

これは純粋な空白のみの変換です：キーの順序を変えたり値を変更したりすることはなく、2回実行しても no-op です。

終了コード:
- `0` すべてのファイルが既に正規形（または正常に再フォーマット済み）
- `1` `--check`でフォーマットが必要なファイルを検出、またはファイルが読み取れない / 有効なJSONでない
- `2` 実行できない（ディレクトリが存在しない）

### `.specs/`はツール所有のアーティファクトとして扱う

`.specs/`は`package-lock.json`や生成コードと同様に、specpinが生成し所有するものです。リポジトリ全体のフォーマッター（Prettier、Biome、dprint）を使う場合は、specpinと衝突しないよう**`.specs/`を除外**してください。そうしないと、フォーマッターがspecpinの展開した配列を折りたたみ、spec編集のたびにファイル全体が変更されてしまいます。

```text
# .prettierignore
.specs/
```

```jsonc
// biome.json - .specs/を無視するか ...
{ "files": { "includes": ["**", "!**/.specs/**"] } }
// ... または specpin のフォーマットに合わせて両者を一致させる:
{ "overrides": [{ "includes": ["**/.specs/**/*.json"], "json": { "formatter": { "expand": "always" } } }] }
```

その後`specpin format`で正規化し、CIまたはpre-commitフックでゲートします:

```bash
# .git/hooks/pre-commit (または lint-staged / husky)
specpin format --check || {
  echo "specのフォーマットが必要です - 実行: specpin format" >&2
  exit 1
}
```

:::tip
`specpin format --check`を`specpin validate`と組み合わせてCIで使うと、specが有効かつ一貫してフォーマットされた状態を保てます。
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

デフォルトでは、specがマシンの外に出ることはありません。sidecarはlocalhostにバインドし、クラウドサービスやテレメトリは一切ありません。リモートsidecarを利用する場合でも、specは**あなた自身**が運用・管理するそのsidecarにのみ送信され、Specpinが運用するサービスに送られることは決してありません。

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

拡張機能のOptionsページで各接続を追加します。拡張機能は各プロジェクトの`domains`フィールドに基づいてspecを正しいページにルーティングします。1つの拡張機能で多数のプロジェクトを同時に配信できます。
