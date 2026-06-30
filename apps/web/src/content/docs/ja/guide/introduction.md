---
title: はじめに
description: Specpinとは何か、動作中のウェブUIに生きたビジネスspecを貼り付ける仕組み。
---

Specpinはビジネス仕様（ルール、説明、受け入れ基準）を動作中のウェブUIの要素に直接貼り付け、ホバーまたは閲覧中にブラウザ内でレンダリングします。

## どんな問題を解決するか

コードから乖離したドキュメントはノイズになります。Specpinはspecをインターフェース自体に固定することで生き続けさせます。specはリファクタリングを経ても存続し、コードとともにGitでバージョン管理され、必要な場所に正確に現れます。

## Specpinとは

- **ブラウザextension**：レジリエントなフィンガープリント（test-id、aria、selector、xpath、テキスト、位置）でspecをDOM要素にマッチさせます。
- **Go sidecar**（`specpin serve`）：トークン認証付きのlocalhostで`.specs/`ディレクトリを公開し、SSEによるライブリロードを提供します。
- **Gitネイティブな知識レイヤー**：リポジトリ内にJSONとして存在し、PRでレビューでき、差分確認も可能です。
- **フレームワーク非依存**：マッチングは純粋なDOM上で行われます。

## Specpinでないもの

Specpinはspec駆動のコードジェネレーターでは**ありません**。GitHub Spec Kit / OpenSpecとは無関係です。アプリケーションコードを生成しません。すでに持っているインターフェースに生きたドキュメントを固定する知識レイヤーです。

## 必要なもの

Specpinを使うには、少なくとも1つのプロジェクトが必要です：

- **sidecarプロジェクト**：`.specs/`ディレクトリを持つリポジトリで、`specpin serve`で配信します（Gitネイティブ、レビュー可能、チーム共有）。
- **ローカルプロジェクト**：`browser.storage.local`に保存されたspec。extension内で直接作成します（個人用、ポータブル、`.specs.zip`としてエクスポート可能）。

## 次のステップ

- [extensionをインストール](/ja/guide/install/)
- [最初の接続を始める](/ja/guide/getting-started/)
