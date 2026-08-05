# Desktop API Inspector 検索・複合フィルター・ピン留め仕様

## 目的

通信量が多い画面でも、調査対象のAPI通信を素早く絞り込み、重要な通信を見失わずに確認できるようにする。

## 検索対象

キーワード検索は大文字小文字を区別せず、次を対象とする。

- method
- 完全URL
- pathとquery
- status code
- resource type
- Request headerの名前・値
- Response headerの名前・値

Request / Response bodyは対象外とする。最大500件のログに対して入力ごとに検索するため、本文全体を走査せず操作遅延と不要な機密値探索を避ける。

## 絞り込み条件

### Resource type

- すべて
- XHR
- fetch

### Method

- 全method
- GET
- POST
- PUT
- PATCH
- DELETE
- その他

「その他」は上記5method以外を対象とする。

### Status

- 全status
- 2xx
- 3xx
- 4xx
- 5xx
- 通信失敗

status codeを取得できなかった通信を「通信失敗」として扱う。

## ピン留め

- 現在表示されている通信を個別にピン留めできる
- ピン留めされた通信は通常一覧の上部へ移動する
- 同一IDの通信内容が非同期更新された場合もピン状態を維持する
- 「ピンのみ」でピン留め通信だけを表示する
- ピン情報は現在のWorkspaceセッションだけに保持する
- Workspace切替・再読み込み時にピン情報を破棄する
- ピン情報は設定ファイルへ永続化しない

ログが500件を超えた場合は、ピン留め通信を先に保持し、残りの枠を新しい未ピン通信へ割り当てる。

## 選択状態

検索やフィルター変更後も、選択中の通信が結果に残る場合は詳細表示を維持する。結果から外れた場合だけ選択状態を解除する。

## JSON / HAR保存との関係

検索・method・status・ピンはrendererの一覧表示専用とする。

JSON / HAR保存は従来どおり、現在選択されているresource type（all / xhr / fetch）に一致する最大500件を対象とする。検索結果だけを保存したと誤認しないよう、保存ボタン付近へ対象範囲を明記する。

## アクセシビリティ

- 検索欄にアクセシブルな名前を付ける
- method / status selectにlabelを付ける
- resource type、ピンのみ、個別ピンに`aria-pressed`を付ける
- 表示件数を`aria-live`で通知する
- 行選択ボタンとピンボタンを分離し、buttonの入れ子を避ける

## テスト観点

### 正常系

- URL、method、status、resource type、header名・値で検索できる
- methodとstatusを同時に適用できる
- ピン留め通信が上部へ移動する
- ピンのみ表示が動作する
- フィルター解除で初期状態へ戻る

### 異常・境界系

- status未取得を通信失敗として抽出できる
- OTHER methodへOPTIONS等が含まれる
- 検索結果0件の案内が表示される
- ピン0件ではピンのみボタンを操作できない
- 同一IDログ更新後もピン状態が残る
- 500件上限到達時にピン留めログを優先保持する

### 既存機能への影響

- APIログ詳細表示
- JSON / HAR保存前プレビュー
- 追加マスキング
- Electron sandbox preload
- Mobile Inspector
