🇬🇧 [English](README.md) • 🇻🇳 [Tiếng Việt](README.vi.md) • 🇯🇵 **日本語**

<p align="center">
  <img src="apps/extension/designs/specpin-icon.png" alt="Specpin" width="112" height="112" />
</p>

<h1 align="center">Specpin</h1>

<p align="center">
  実行中のウェブUIの要素に、生きたビジネス仕様をピン留め。<br>
  Gitネイティブ、ローカルファースト、フレームワーク非依存。<strong>コード生成なし。</strong>
</p>

<p align="center">
  <a href="https://github.com/lamngockhuong/specpin/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/lamngockhuong/specpin/ci.yml?style=flat-square&label=CI&color=2DD4BF&logo=githubactions&logoColor=white" alt="CI">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/github/license/lamngockhuong/specpin?style=flat-square&color=2DD4BF" alt="Apache-2.0 License">
  </a>
  <a href="https://github.com/lamngockhuong/specpin/stargazers">
    <img src="https://img.shields.io/github/stars/lamngockhuong/specpin?style=flat-square&color=f59e0b" alt="GitHub Stars">
  </a>
  <img src="https://img.shields.io/badge/Node-%E2%89%A520-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node >= 20">
  <img src="https://img.shields.io/badge/Go-1.26-00ADD8?style=flat-square&logo=go&logoColor=white" alt="Go 1.26">
  <img src="https://img.shields.io/badge/MV3-Chrome%20%2B%20Firefox-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome + Firefox">
</p>

<p align="center">
  <a href="https://specpin.ohnice.app">ウェブサイト</a> •
  <a href="#クイックスタート">クイックスタート</a> •
  <a href="#機能">機能</a> •
  <a href="#仕組み">仕組み</a> •
  <a href="#ドキュメント">ドキュメント</a> •
  <a href="README.md">English</a>
</p>

<p align="center">
  <img src="apps/extension/designs/overview.png" alt="ライト・ダークテーマのSpecpin拡張機能UI" width="760" />
</p>

---

## Specpinとは？

Specpinは**ビジネス仕様**（ルール、説明、受け入れ基準）を、*実行中*のウェブUIの要素に直接付与し、ホバーや閲覧中にブラウザ内でレンダリングします。

Specpinは**仕様駆動のコードジェネレーター**ではありません（GitHub Spec Kit / OpenSpecとは無関係）：アプリケーションコードを生成しません。これは、既存のインターフェースに対して、Gitでバージョン管理された生きたドキュメントをピン留めするナレッジレイヤーです。インターフェースはすでにすべての要素の位置を知っています。Specpinはそこに記憶を与えます。

- **Gitネイティブ。** specはリポジトリの`.specs/`ディレクトリにJSONとして保存されます。バージョン管理され、PRでレビューでき、差分を確認できます。
- **ローカルファースト。** 小さなGoのsidecarがトークン認証されたlocalhostのみでspecを提供します。データは一切外部に出ません。
- **堅牢なリンク。** 要素はマルチシグナルのfingerprint（test-id、aria、selector、xpath、テキスト、位置）でマッチングされるため、specはリファクタリング後も生き続けます。
- **フレームワーク非依存。** 純粋なDOMマッチングにより、あらゆるサイトやフレームワークで動作します。

## 仕組み

```
.specs/ (リポジトリ内)  -->  specpin serve (GoのSidecar、localhost HTTP + SSE)  -->  ブラウザ拡張機能（マッチング + レンダリング）
```

1. `specpin init`でリポジトリに`.specs/manifest.json`を生成します。
2. `specpin serve`でトークン認証されたlocalhost HTTP APIを通じて`.specs/`を公開し、ライブリロード（SSE）を提供します。
3. ブラウザ拡張機能がsidecarに接続し、各specのfingerprintをライブDOMと照合して、要素の上にレンダリングします。

## CLIのインストール

sidecarは単一の自己完結型バイナリとして提供されます。最も簡単な方法はnpm経由で、OSとCPUに合ったビルド済みバイナリを自動でダウンロードします：

```bash
npm install -g @specpin/cli     # または: pnpm add -g @specpin/cli
specpin --version

# またはインストールなしで実行:
npx @specpin/cli serve
```

バイナリを直接入手したい場合は、[最新のCLIリリース](https://github.com/lamngockhuong/specpin/releases?q=cli)から`specpin-<os>-<arch>`をダウンロードするか、ソースからビルド：`cd apps/cli && make build`。

## クイックスタート

```bash
# 1. CLIをインストール
npm install -g @specpin/cli

# 2. プロジェクトのリポジトリで: specの雛形を生成して提供
specpin init                   # .specs/manifest.json を作成
specpin serve                  # localhost URL + bearer tokenを表示

# 3. 拡張機能をロード（unpacked）して接続
#    Chrome:  pnpm --filter @specpin/extension build         -> .output/chrome-mv3
#    Firefox: pnpm --filter @specpin/extension build:firefox -> .output/firefox-mv2
```

表示されたURL + tokenを拡張機能の接続設定にペーストし、アプリを開くとspecが各要素にレンダリングされます。全体のフロー（init -> serve -> ロード -> 接続 -> レンダリング -> capture）については**[`docs/run-guide.md`](./docs/run-guide.md)**を参照してください。または同梱の**[デモアプリ](./examples/demo-react-app)**で試せます：

```bash
pnpm --filter @specpin/demo-react-app dev   # http://localhost:3000、.specs/ のシードデータ付き
```

### AIで spec を作成

コーディングエージェントにspecを書かせましょう。`@specpin/cli`に同梱されているskill（`https://unpkg.com/@specpin/cli@latest/skill/SKILL.md`で参照可能）が、Claude Code、Cursorなどのエージェントにスキーマ有効な`.specs/`の作成方法と`specpin validate`の実行方法を教えます。**[`docs/ai-authoring.md`](./docs/ai-authoring.md)**を参照してください。

## 機能

- **ライブ要素にspecをピン留め** - 堅牢なfingerprintマッチング（test-id、aria、selector、xpath、テキスト、位置）
- **3つの表示モード** - tooltip、sidebar、ドラッグ可能なモーダルレンダラー
- **手動キャプチャ** - 要素をクリックしてその場でspecを作成、ページを離れる必要なし
- **書き込み可能なローカルプロジェクト** - sidecarなしでspecの編集、キャプチャ、作成、グループzipエクスポートが可能
- **マルチプロジェクト接続** - 1つの拡張機能で複数のプロジェクトを同時に管理、originによってページごとにルーティング
- **プロジェクト単位の有効/無効** - グローバルのオン/オフとは独立して個別の接続を切り替え可能
- **サイドパネルサーフェス** - ChromeのサイドパネルやFirefoxのsidebarでSpecpinを開き、インラインでspecを表示
- **spec検索** - タイトル、ファイル、タグ、説明によるクライアントサイドのリアルタイムフィルター
- **ソースバッジ** - specがsidecarからなのかローカルバッチからなのかが一目でわかる
- **多言語specコンテンツ** - ロケールキーの文字列、ブラウザ内の言語切り替え、タブ形式のロケール別エディター
- **Markdownフォーマットのspec** - 説明とビジネスルールが安全なMarkdownサブセット（太字、斜体、リンク、リスト）をサポート。ツールバーで作成し、全サーフェスでレンダリング
- **ユーザー選択可能なテーマ** - システム / ライト / ダーク、デュアルテーマのデザイントークン
- **UIクロームi18n** - 英語 + ベトナム語インターフェース、specコンテンツ言語から独立
- **サポート & フィードバック** - オプションページからGitHub IssuesとDiscussionsへのワンクリックリンク
- **AIでspecを作成** - `@specpin/cli`に同梱されたportable skillがコーディングエージェント（Claude Code、Cursorなど）にスキーマ有効なspecの作成とCLI操作を教えます。CLI自体にLLMは含まれません
- **オフライン検証** - `specpin validate` + CI spec-lintで`.specs/`の整合性を保持
- **デフォルトでセキュア** - sidecarは`127.0.0.1`のみにバインド、bearer-token認証、拡張機能originのみCORSを許可、パストラバーサル防止の書き込みガード

## モノリポ構成

```text
specpin/
├── apps/
│   ├── extension/            # WXT MV3クロスブラウザ拡張機能 (Chrome + Firefox)
│   └── cli/                  # GoのSidecarバイナリ: init + serve
├── packages/
│   ├── spec-schema/          # JSON Schema v1 (SSOT) + 生成済みTS型 + バリデーター
│   ├── fingerprint-core/     # フレームワーク非依存のcapture + match（DOMのみ）
│   └── api-client/           # sidecar HTTPコントラクト用の型付きTSクライアント
├── examples/
│   └── demo-react-app/       # サンプルアプリ + Specpinを試すためのシード済み.specs/
└── docs/                     # アーキテクチャ、実行ガイド、スキーマリファレンス
```

## ツールチェーン

- Node >= 20、pnpm 10、Turborepo
- Go 1.26（sidecar CLI）
- Vitest（全TSパッケージ）、Biome（lint + format）

## ワークスペーススクリプト

```bash
pnpm install          # ワークスペースの依存関係をインストール
pnpm build            # パッケージ全体でturbo run build
pnpm test             # turbo run test (パッケージ別vitest)
pnpm lint             # biome check . (lint + format + importの整理)
pnpm typecheck        # パッケージ別tsc --noEmit
pnpm schema-validate  # fixtureコーパスのクロスバリデーション
```

単一パッケージまたは単一テスト：

```bash
pnpm --filter @specpin/fingerprint-core test
pnpm --filter @specpin/fingerprint-core exec vitest run -t "match"
```

GoのSidecar（`apps/cli`内から）：

```bash
make build          # sync-schemaの後にgo build -> bin/specpin
make check-schema   # CIゲート: 埋め込みスキーマのズレを検出
go test ./...
```

## ドキュメント

> Tiếng Việt: ドキュメントのベトナム語訳は[`docs/vi/`](./docs/vi/)にあります。英語がソースオブトゥルースです。

- [`docs/project-overview-pdr.md`](./docs/project-overview-pdr.md) - プロダクト概要、問題提起、目標、PDR
- [`docs/system-architecture.md`](./docs/system-architecture.md) - コンポーネント、パッケージ、fingerprintingセキュリティモデル
- [`docs/codebase-summary.md`](./docs/codebase-summary.md) - パッケージ別サマリー、主要ファイル、責務
- [`docs/run-guide.md`](./docs/run-guide.md) - エンドツーエンドのフル手順（init -> serve -> ロード -> 接続 -> レンダリング -> capture）
- [`docs/ai-authoring.md`](./docs/ai-authoring.md) - 同梱の`@specpin/cli` skillを使ったコーディングエージェントによるspec作成
- [`docs/schema-reference.md`](./docs/schema-reference.md) - v1 specフォーマット
- [`docs/code-standards.md`](./docs/code-standards.md) - TS/Go規約、ツール設定、スキーマ管理
- [`docs/design-system.md`](./docs/design-system.md) - 拡張機能UIモックアップ + 共有カラー/フォントトークンのワークフロー
- [`docs/deployment-guide.md`](./docs/deployment-guide.md) - ウェブサイトPagesデプロイ + 拡張機能/CLIリリースパイプライン
- [`docs/project-roadmap.md`](./docs/project-roadmap.md) - Phase 1 MVP完了 + 1.1予定機能

## リリース

ビルド済みの成果物は[GitHub Releases](../../releases)でコンポーネントごとにバージョン管理されて配布されます：拡張機能（`extension-vX.Y.Z`: chrome + firefox ZIP）とCLI（`cli-vX.Y.Z`: linux/macOS/windowsバイナリ）、各`checksums.txt`付き。リリースはconventional commitsから`release-please`によって自動化されています。詳細なパイプライン、手動の`workflow_dispatch`、tag-pushフォールバックについては[`docs/deployment-guide.md`](./docs/deployment-guide.md)を参照してください。

## コントリビューション

[`.github/CONTRIBUTING.md`](./.github/CONTRIBUTING.md)を参照してください。PRを開く前に、フルゲートを実行してください：

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm schema-validate
cd apps/cli && make check-schema && go test ./...
```

## ステータス

Phase 1 MVPと1.1のスライスを出荷済み：GoのsidecarがI`.specs/`を提供し、WXT拡張機能はfingerprintをマッチングして手動captureとともにspec（tooltip + sidebar + modal）をレンダリングします。specは多言語対応でブラウザ内言語切り替えとタブ形式のロケール別エディターを備え、説明とビジネスルールはツールバーで作成する安全なMarkdownサブセットをサポートし、拡張機能はoriginでルーティングして複数のプロジェクトに同時に接続します。追加済み: オフライン`specpin validate` + CI spec-lint、書き込み可能なローカルプロジェクト（編集、capture、作成、グループzipエクスポート）、クライアントサイドspec検索、ソースバッジ、プロジェクト単位の有効/無効、サイドパネルサーフェス、ユーザー選択可能なテーマ（システム / ライト / ダーク）、UIクロームi18n（EN + VI）。まだ保留中: FileSystem Accessソース、ハイブリッドfingerprint採点、overlay + inline-badgeレンダラー、Safariパッケージング、`specpin generate`（AI）。

## スポンサー

Specpinが役立つと感じたら、開発のサポートをご検討ください：

[![GitHub Sponsors](https://img.shields.io/badge/GitHub_Sponsors-Support-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/lamngockhuong)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy_Me_A_Coffee-Support-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/lamngockhuong)
[![MoMo](https://img.shields.io/badge/MoMo-Support-ae2070)](https://me.momo.vn/khuong)

## その他のプロジェクト

- [TabRest](https://github.com/lamngockhuong/tabrest) - 非アクティブなタブを自動でアンロードしてメモリを解放するChrome拡張機能
- [GitHub Flex](https://github.com/lamngockhuong/github-flex) - 生産性向上機能でGitHubのインターフェースを拡張するクロスブラウザ拡張機能
- [Termote](https://github.com/lamngockhuong/termote) - モバイル/デスクトップのPWAからCLIツール（Claude Code、GitHub Copilot、任意のターミナル）をリモート操作

## ライセンス

[Apache-2.0](./LICENSE).
