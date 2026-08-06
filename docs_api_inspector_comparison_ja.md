# Desktop API Inspector 通信比較仕様

## 目的

正常時と異常時、変更前と変更後など2件のAPI通信を横並びで確認し、status、処理時間、headers、bodyの違いを短時間で特定できるようにする。

## 比較対象の選択

1. API通信一覧から比較したい通信を選択する。
2. 画面右下の「API通信比較」で「選択中を比較へ追加」を押す。
3. 1件目は比較A、2件目は比較Bへ追加される。
4. 2件揃うと「比較を開く」が有効になる。

比較対象は最大2件とする。2件選択済みの場合、3件目は追加されない。比較Aまたは比較Bを解除してから別の通信を追加する。

## 比較項目

### 概要

- Method
- URL
- Resource type
- Status
- Duration

### Headers

- Request headers
- Response headers

Header名は大文字小文字を区別せずに正規化する。比較結果は次の4種類とする。

- 同一
- 差分あり
- 比較Aのみ
- 比較Bのみ

### Body

- Request body
- Response body

現在のInspectorが保持している安全化済みpreviewだけを使用する。JSONは表示時と同じ整形済みテキストへ正規化して比較する。次の情報も差分判定へ含める。

- 取得有無
- body kind
- Content-Type
- byte length
- 省略状態
- 取得不可理由
- マスキング済みfield path

## 状態管理

- Zustandには比較対象のログIDだけを保持する。
- ログ本体、header、bodyは複製しない。
- 比較A/Bの指定順を維持する。
- Workspace切替、アプリ再読み込み時は比較対象を破棄する。
- 設定ファイルやlocalStorageへ永続化しない。
- ログ上限500件へ到達した場合、ピン留め通信と比較中の通信を優先保持する。
- ログが存在しなくなった場合、対象IDを自動的に除外する。

## セキュリティ

- raw request / response bodyを再取得しない。
- main processや外部サービスへ比較内容を送信しない。
- 比較結果を自動保存しない。
- 既存のheader、Request body、Response bodyの安全化・マスキング結果をそのまま利用する。
- raw値を比較用stateへ複製しない。

## アクセシビリティ

- 比較操作領域へ明示的なラベルを付ける。
- 比較追加・解除状態を`aria-pressed`で通知する。
- 比較件数を`aria-live`で通知する。
- 比較モーダルへ`role="dialog"`と`aria-modal="true"`を設定する。
- Escapeで閉じられる。
- Tab / Shift+Tabでモーダル内フォーカスを循環する。
- モーダルを閉じた際は直前のフォーカスへ戻す。

## 対象外

- 3件以上の比較
- 行単位・単語単位の高度なdiff表示
- 比較結果のJSON / HAR /画像保存
- Mobile Inspectorへの追加
- raw bodyやマスキング前データの比較

## テスト観点

### Unit Test

- 存在するIDだけを最大2件へ補正する。
- 重複IDを除外する。
- 比較A/Bの順序を維持する。
- 3件目を追加しない。
- 選択済みIDを解除できる。
- Header名の大文字小文字を区別しない。
- Header追加・削除・値変更を判定する。
- JSONの空白差を整形後に同一判定する。
- body内容、取得状態、伏字項目の差を判定する。

### Electron E2E

- 200通信を比較Aへ追加する。
- 503通信を比較Bへ追加する。
- 2件揃うまで比較ボタンが無効である。
- Method、Status、Header差分を表示する。
- 比較Bを解除するとモーダルが閉じる。
- 全解除で0件へ戻る。
- 既存の検索、ピン留め、保存前プレビューが動作する。
