---
title: はじめ方
description: プロジェクトに接続して、ブラウザで最初のspecをレンダリングする。
---

このガイドでは、プロジェクトに接続してウェブページに最初のspecをレンダリングする手順を説明します。最も早い2つの方法：バンドルされたデモを試す、または自分のプロジェクトに接続する。

## オプションA：デモアプリを試す

デモアプリにはspecがあらかじめ入っているため、すぐにSpecpinの動作を確認できます。

### 1. Go sidecarをビルドする

Specpinリポジトリのルートから：

```bash
cd apps/cli
make build
```

`apps/cli/bin/specpin`が生成されます。

### 2. デモアプリを起動する

```bash
pnpm --filter @specpin/demo-react-app dev
```

デモは`http://localhost:3000`で動作します。小さなマルチスクリーンのAcme CRM（ログイン、ダッシュボード、顧客一覧と詳細、設定、新規ディール）です。任意の値でログインして認証済み画面に進んでください。

### 3. デモの`.specs/`ディレクトリを配信する

デモアプリのディレクトリから：

```bash
cd examples/demo-react-app
/path/to/apps/cli/bin/specpin serve
```

sidecarが以下を表示します：

```
Specpin sidecar running.
  URL:     http://127.0.0.1:51234
  Token:   2da0480c...
```

### 4. Specpinをオンにする

ツールバーのSpecpin拡張機能アイコンをクリックします。**このページのspecを表示**スイッチをONにしてください。

### 5. sidecarに接続する

拡張機能のpopupで**接続設定**の歯車アイコン（右上）をクリックし、**プロジェクトを追加**をクリックします。

手順3で表示されたURLとトークンを貼り付け、任意でラベルを付け（例：「Demo App」）、**テストしてプロジェクトを追加**をクリックします。接続がリストに表示され、ステータス、spec数、ドメインが確認できます。

### 6. specのレンダリングを確認する

`http://localhost:3000`に戻ります。マッチしたspecが各要素に表示されます。要素にホバーするとツールチップ（デフォルト表示モード）が表示されます。

ディスク上の`.spec.json`ファイルを編集すると、SSEを通じてページがライブ更新されます。

## オプションB：自分のプロジェクトに接続する

### 1. CLIをインストールする

```bash
npm install -g @specpin/cli    # または: pnpm add -g @specpin/cli
```

### 2. プロジェクトに`.specs/`ディレクトリを初期化する

プロジェクトのルートから：

```bash
specpin init --project "My App" --domains localhost:3000
```

`.specs/manifest.json`が作成されます。

### 3. specを配信する

```bash
specpin serve
```

sidecarがURLとトークンを表示します。

### 4. 拡張機能で接続する

オプションAの手順4〜6に従い、自分のsidecar URLとトークンを貼り付けます。

## 次にできること

- **新しいspecをキャプチャ**：popup（または`Alt+Shift+C`）で**+ specをキャプチャ**をクリックし、要素をクリックしてフォームを入力して保存します。specがすぐにその要素に表示されます。
- **表示モードを切り替える**：popupのドロップダウンを使うか`Alt+Shift+M`を押して、ツールチップ、サイドバー、モーダルを切り替えます。
- **specを検索**：popupまたはサイドパネルの検索ボックスでタイトル、ファイル、タグ、説明でフィルタリングします。
- **specを編集**：ツールチップバッジをクリックしてピン留めし、**specを編集**をクリックします。フォームが事前入力された状態で開きます。変更して保存します。
- **サイドパネルを開く**：popupで**サイドパネルとして開く**をクリック（Chrome）、またはFirefoxのネイティブサイドバートグル（**表示 -> サイドバー -> Specpin**）を使います。パネルには各specの完全な説明とビジネスルールがインラインで表示されます。

## キーボードショートカット

| ショートカット | 操作 |
|----------|--------|
| `Alt+Shift+S` | Specpinのオン/オフ |
| `Alt+Shift+M` | 表示モードの切り替え |
| `Alt+Shift+C` | キャプチャモードのオン/オフ（`Esc`でキャンセル） |
| `Alt+Shift+N` | 一致したspec間を巡回する |
| `Alt+Shift+G` | デフォルトのガイドツアーを開始 / 停止 |

## 次のステップ

- [複数プロジェクトの接続方法を学ぶ](/ja/usage/connecting-projects/)
- [specの表示とフィルタリングを探る](/ja/usage/viewing-specs/)
- [ブラウザ内でspecをキャプチャ・編集する](/ja/usage/capturing-and-editing/)
