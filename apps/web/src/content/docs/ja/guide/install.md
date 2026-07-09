---
title: 拡張機能のインストール
description: SpecpinをChrome Web StoreまたはFirefox Add-onsからインストール、またはソースからビルドする方法。
---

SpecpinはChrome Web StoreとFirefox Add-onsで公開されています。開発用にソースからビルドすることもできます。

## Chrome Web Storeからインストール

[Chrome Web Store](https://chromewebstore.google.com/detail/specpin/kkfmoieoahdjneagognaoedggkiiolkn)から直接Specpinをインストールできます。拡張機能がツールバーに表示されます。素早くアクセスできるようピン留めし、[最初の接続を始めましょう](/ja/guide/getting-started/)。

## Firefox Add-onsからインストール

[Firefox Add-ons](https://addons.mozilla.org/ja/firefox/addon/specpin/)から直接Specpinをインストールできます。拡張機能がツールバーに表示されます。素早くアクセスできるようピン留めし、[最初の接続を始めましょう](/ja/guide/getting-started/)。

## ソースからビルド（開発）

拡張機能を開発する場合は、ソースからビルドしてパッケージ化されていない拡張機能として読み込みます。

### 前提条件

- Node >= 22
- pnpm 11

### 拡張機能のビルド

Specpinリポジトリのルートから：

```bash
pnpm install
pnpm build
```

次に、お使いのブラウザ向けに拡張機能をビルドします：

```bash
# Chrome (Manifest V3)
pnpm --filter @specpin/extension build

# Firefox (Manifest V2)
pnpm --filter @specpin/extension build:firefox
```

Chromeの出力先は`apps/extension/.output/chrome-mv3`です。  
Firefoxの出力先は`apps/extension/.output/firefox-mv2`です。

### Chromeに読み込む

1. `chrome://extensions`を開く
2. **デベロッパーモード**を有効にする（右上のトグル）
3. **パッケージ化されていない拡張機能を読み込む**をクリック
4. `apps/extension/.output/chrome-mv3`ディレクトリを選択

拡張機能がツールバーに表示されます。素早くアクセスできるようにピン留めしておきましょう。

### Firefoxに読み込む

1. `about:debugging`を開く
2. **このFirefox**をクリック
3. **一時的なアドオンを読み込む...**をクリック
4. `apps/extension/.output/firefox-mv2`内の任意のファイルを選択（例：`manifest.json`）

拡張機能は一時的に読み込まれ、Firefoxを再起動すると消えます。必要に応じて`about:debugging`から再読み込みしてください。

:::note
日常的に使う場合は[Firefox Add-ons](https://addons.mozilla.org/ja/firefox/addon/specpin/)からインストールしてください。上記の一時的なアドオンは再起動で消えるため、開発用途のみです。
:::

## 次のステップ

拡張機能がインストールされたら、[最初の接続を始めましょう](/ja/guide/getting-started/)。
