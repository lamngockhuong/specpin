---
title: グラフビュー
description: ステータスフローと画面遷移の図を作成し、フルページのグラフビューで閲覧する。
---

`.specs/`内の2つの任意ファイルは、専用のフルページ**グラフビュー**で図として描画されます：**ステータスフロー**グラフ（オブジェクトのステータスがどのように状態間を移動するか）と**画面遷移**グラフ（どの画面がどの画面に、どのアクションで遷移するか）です。どちらもspecと同じく`.specs/`内で手作業により作成します。

:::note
グラフビューは`.specs/flows.json`と`.specs/screens.json`で作成したデータに基づく**読み取り専用の図**です。今のところ拡張機能内エディタはありません。JSONファイルを直接編集してください（`.specs/`作成の一般的なモデルは[Spec format](/ja/sidecar/spec-format/)を、`flows.json`/`screens.json`の正確なフィールド仕様は[GitHubのschema-reference.md](https://github.com/lamngockhuong/specpin/blob/main/docs/schema-reference.md#flowsconfig-specsflowsjson)を参照してください）。
:::

## ステータスフローグラフを作成する

`.specs/flows.json`を作成し、オブジェクトのライフサイクルを記述します（例：「Deal」が営業パイプラインをどう移動するか）：

```json
{
  "version": "1.0",
  "flows": [
    {
      "id": "deal-status",
      "object": { "en": "Deal" },
      "states": [
        { "id": "draft", "label": { "en": "Draft" }, "kind": "initial" },
        { "id": "negotiation", "label": { "en": "Negotiation" } },
        { "id": "won", "label": { "en": "Won" }, "kind": "terminal", "specId": "deal-stage" },
        { "id": "lost", "label": { "en": "Lost" }, "kind": "terminal", "specId": "deal-stage" }
      ],
      "transitions": [
        {
          "id": "start-negotiation",
          "from": "draft",
          "to": "negotiation",
          "trigger": { "en": "Start negotiation" },
          "specId": "deal-submit"
        }
      ]
    }
  ]
}
```

1つのファイルに複数の独立したフロー（オブジェクトの種類ごとに1つ）を持たせられます。各stateの`kind`（`initial` / `normal` / `terminal`）は描画のされ方を左右します。stateやtransitionの任意の`specId`はピン留め済みのspecへ逆リンクするので、グラフ内でクリックすると実際の要素にジャンプできます（下記の[Click-to-highlight](#click-to-highlight)を参照）。

## 画面遷移グラフを作成する

`.specs/screens.json`を作成し、アプリのナビゲーションを記述します：

```json
{
  "version": "1.0",
  "screens": [
    { "id": "login", "name": { "en": "Login" }, "urlGlob": "/login" },
    { "id": "dashboard", "name": { "en": "Dashboard" }, "urlGlob": "/" }
  ],
  "transitions": [
    {
      "id": "login-to-dashboard",
      "from": "login",
      "to": "dashboard",
      "trigger": { "en": "Sign in" },
      "specId": "login-submit-btn"
    }
  ]
}
```

各画面の`urlGlob`は、specのページスコープと同じglob構文（`*`は1つのパスセグメントに、`**`は複数セグメントにマッチ）を使って、実際のUI上でその画面を識別します。

## グラフビューを開く

popupまたはサイドパネルの**Open graph view**をクリックします。新しいブラウザタブで開きます。接続中のプロジェクトにステータスフローと画面遷移の両方のグラフが設定されている場合、キャンバス上部にデータセット選択が表示され切り替えられます。1つのページを複数のプロジェクトが配信している場合は、プロジェクト選択も表示されます。

## グラフを閲覧する

- **Graph / Table 切り替え**: 視覚的な図と、同じノード・エッジのプレーンなソート可能テーブルを切り替えます。
- **カテゴリフィルタ**: タブごとにノードをグループ化し件数を表示します（ステータスフローグラフはオブジェクトの種類でグループ化、画面グラフは各画面`urlGlob`の最初のパスセグメントでグループ化）。タブを選ぶとそのカテゴリ以外は非表示になります。
- **検索**: 入力するとマッチするノードのラベルがリアルタイムでハイライトされます。検索はハイライトするだけで何も非表示にしません（先にカテゴリフィルタで絞り込んでから組み合わせると便利です）。
- **フォーカス**: ノードをクリックすると、そのノードと直接つながるノード・エッジ以外が暗くなります。もう一度クリックするか、空白部分をクリックするとフォーカスを解除します。
- **パン・ズーム**: キャンバスをドラッグしてパン、スクロールでズームします。

これらは自由に組み合わせられるので、1つのカテゴリに絞り、その中で検索し、特定のノードにフォーカスする、といったことを同時に行えます。数百ノードのグラフで役立ちます。

## Click-to-highlight

`specId`を持つノードまたはエッジをクリックすると、グラフビューを開いた元のタブへジャンプします。そのspecが現在そのタブでマッチしていれば、要素がスクロールして表示され点滅します。これはディープリンクやキーボードのサイクルショートカットと同じハイライト処理です。

そのタブでspecがマッチしていない場合（違うページにいる、または要素が存在しない場合）、何も起きない代わりに、そのspecが属する画面・ページ名を示すヒントが表示されます。`specId`を持たないノード・エッジ（「Won」のような純粋なステータスや、単一の起動要素を持たないナビゲーションなど）は通常どおり描画されますが、ジャンプ先はありません。

:::tip
実際のUI要素がstateやtransitionを表している場合（ステータスバッジ、送信ボタンなど）は`specId`を設定し、グラフと実際のページを結び付けておきましょう。専用の要素を持たない純粋に概念的なノード（要素のないterminalステータスなど）は`specId`を未設定のままで問題ありません。
:::
