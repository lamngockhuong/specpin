---
title: extensionのインストール
description: Specpinブラウザextensionをソースからビルドして読み込む方法。
---

Specpin extensionはまだブラウザのウェブストアに公開されていません。ソースからビルドし、unpacked extensionとして読み込む必要があります。

## 前提条件

- Node >= 20
- pnpm 10

## extensionのビルド

Specpinリポジトリのルートから：

```bash
pnpm install
pnpm build
```

次に、お使いのブラウザ向けにextensionをビルドします：

```bash
# Chrome (Manifest V3)
pnpm --filter @specpin/extension build

# Firefox (Manifest V2)
pnpm --filter @specpin/extension build:firefox
```

Chromeの出力先は`apps/extension/.output/chrome-mv3`です。  
Firefoxの出力先は`apps/extension/.output/firefox-mv2`です。

## Chromeに読み込む

1. `chrome://extensions`を開く
2. **デベロッパーモード**を有効にする（右上のトグル）
3. **パッケージ化されていない拡張機能を読み込む**をクリック
4. `apps/extension/.output/chrome-mv3`ディレクトリを選択

extensionがツールバーに表示されます。素早くアクセスできるようにピン留めしておきましょう。

## Firefoxに読み込む

1. `about:debugging`を開く
2. **このFirefox**をクリック
3. **一時的なアドオンを読み込む...**をクリック
4. `apps/extension/.output/firefox-mv2`内の任意のファイルを選択（例：`manifest.json`）

extensionは一時的に読み込まれ、Firefoxを再起動すると消えます。必要に応じて`about:debugging`から再読み込みしてください。

:::note
Specpinが公開された際にストアリンク（Chrome Web Store、Firefox Add-ons）をここに追加します。
:::

## 次のステップ

extensionがインストールされたら、[最初の接続を始めましょう](/ja/guide/getting-started/)。
