# Desktop API Inspector 通信比較仕様

## 目的

正常時と異常時、変更前と変更後など2件のAPI通信を横並びで確認し、status、処理時間、headers、bodyの違いを短時間で特定する。差分だけへ表示を絞り、安全化済み比較結果をJSONで共有できるようにする。

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

## 主要差分サマリー

比較モーダルの上部に、比較Bが比較Aからどう変わったかを短時間で確認するためのサマリーを常時表示する。「差分のみ」のON/OFFには連動せず、詳細項目を絞り込んだ場合もサマリーは残す。

表示項目:

- Status
- Duration差
- Query差分
- Request headers差分件数
- Response headers差分件数
- Request / Response body差分有無

### 総合判定

総合バッジは次の3種類とする。

- `差分なし`: 比較対象に差分がない
- `差分あり`: 差分はあるが、自動で品質の良否を断定しない
- `要確認`: 比較Aが2xxで、比較Bが非2xxまたは通信エラーへ変化した

`要確認`は確認優先度を示すものであり、障害・劣化を自動断定するものではない。

次は`差分あり`として扱い、改善・劣化とは自動判定しない。

- 200 → 204等の2xx内status変更
- 404 → 500等の非2xx間status変更
- 非2xx → 2xx
- Durationの増減
- Header / Body / Queryだけの差分

### Status

比較A / Bのstatusを`200 → 204`のように表示する。

- 同一status: `変更なし`
- 2xx → 非2xx/通信エラー: `成功系 → 非成功系`
- 非2xx/通信エラー → 2xx: `非成功系 → 成功系`
- その他のstatus変更: `statusコード変更`

### Duration

両方の`durationMs`が取得できている場合、`比較B - 比較A`をmsと割合で表示する。

例:

- `80ms → 120ms`: `+40ms (+50%)`
- `100ms → 80ms`: `-20ms (-20%)`

比較Aが0msの場合は割合を表示しない。どちらかが未計測または有限値でない場合は`比較不可`とする。Duration差だけから性能改善・劣化とは断定しない。

### Query差分

URLを`URL` APIで解析し、query parameterをnameごとにグループ化する。同名parameterは出現順を維持して値を比較する。

表示する件数:

- 追加
- 変更
- 削除

例: `追加 1 / 変更 1 / 削除 0`

URLを解釈できない場合はquery部分だけ`比較不可`とし、比較画面全体は継続する。

### Header / Body

Request / Response headersは、既存のheader比較結果から`difference !== same`の件数を集約する。

Bodyは既存の安全化済み比較結果を使い、Request / Responseそれぞれを`同一`または`差分あり`で表示する。サマリー生成のためにraw bodyを追加取得しない。

## 差分のみ表示

比較モーダルの「差分のみ」を有効にすると、`difference`が`same`の項目を表示対象から除外する。

- 概要は同一行を非表示にする。
- Headerは同一headerを非表示にする。
- Request / Response bodyが同一の場合はセクション全体を非表示にする。
- 差分が0件の場合は「比較対象に差分はありません」と表示する。
- 表示件数、全項目数、差分件数を表示する。
- 主要差分サマリーは非表示にしない。

件数は次の単位で数える。

- 概要の各行: 1項目
- Header名ごとの比較行: 1項目
- Request body: 1項目
- Response body: 1項目

「差分のみ」がOFFの場合、表示件数は全項目数と一致する。ONの場合、表示件数は差分件数と一致する。

## 安全化済み比較JSON保存

比較モーダルの「JSON保存」から、現在の比較A/Bを`stackpilot-safe-api-log-comparison` version 1として保存する。

### rendererからmain processへ渡す値

- Workspace ID
- 比較AのログID
- 比較BのログID
- 差分のみ設定

ログ本文、header、body、artifact本文、保存先パスはrendererから渡さない。main processが対象WorkspaceのAPIログを再取得して成果物を生成する。

### 成果物

成果物には次を含める。

- schema / version / exportedAt
- Workspace情報
- `differencesOnly`
- security metadata
- 比較A/Bの安全化済みmetadata
- total / different / visible件数
- 概要、headers、bodyの比較結果
- SHA-256は保存結果としてrendererへ返す

差分のみがONの場合、同一項目と同一bodyは成果物から除外する。

主要差分サマリーは画面上の派生表示であり、version 1の比較JSON成果物には追加しない。既存保存フォーマットの互換性を維持する。

### 保存処理

1. main processでrequest shapeを検証する。
2. Workspaceと比較対象ログ2件を再取得する。
3. 安全化済みartifactを生成する。
4. Electronの保存ダイアログを開く。
5. ダイアログ後も対象ログが存在することを再確認する。
6. JSONを書き込み、SHA-256と件数を返す。

保存をキャンセルした場合はファイルを書き込まない。対象ログ消失、Workspace不存在、不正request、生成失敗、書き込み失敗は画面へエラーとして表示する。

## 状態管理

- Zustandには比較対象のログIDだけを保持する。
- ログ本体、header、bodyは複製しない。
- 比較A/Bの指定順を維持する。
- 差分のみ設定と保存feedbackはモーダルを管理するrenderer stateだけに保持する。
- 主要差分サマリーは比較対象ログから都度導出し、永続化しない。
- Workspace切替、アプリ再読み込み時は比較対象を破棄する。
- 設定ファイルやlocalStorageへ永続化しない。
- ログ上限500件へ到達した場合、ピン留め通信と比較中の通信を優先保持する。
- ログが存在しなくなった場合、対象IDを自動的に除外する。
- 保存成功後も比較対象を維持し、条件を切り替えて再保存できる。

## セキュリティ

画面比較では、rendererが現在保持している安全化済みpreviewだけを使用する。

主要差分サマリーも同じ安全化済み比較データから派生させる。サマリー表示のためにraw request / response body、認証情報、追加ネットワーク通信を取得しない。

保存時はmain processで再度次を適用する。

- URL userinfoを除去する。
- URL fragmentを`#redacted`へ置換する。
- token、password、signature等の機密query値を`<redacted>`へ置換する。
- Authorization、Cookie、API key等の機密header値を`<redacted>`へ置換する。
- Location等のURL系headerをURL安全化処理へ通す。
- raw request / response bodyを再取得しない。
- 既存の安全化済みbody previewだけを複製する。
- 通信エラー文字列を出力せず、`request-failed`固定値へ置換する。
- 比較内容を外部サービスへ送信しない。
- 保存先はElectronの保存ダイアログでユーザーが選択する。

自動機密判定はfield名・header名・query名に基づく。通常名の項目に含まれる個人情報や業務情報を意味解析して検出するものではないため、外部共有前に成果物を確認する。

## アクセシビリティ

- 比較操作領域へ明示的なラベルを付ける。
- 比較追加・解除状態を`aria-pressed`で通知する。
- 比較件数と表示件数を`aria-live`で通知する。
- 主要差分サマリーへ`aria-label="主要差分サマリー"`を付ける。
- 差分のみ設定へ明示的なcheckbox labelを付ける。
- JSON保存へ明示的なアクセシブル名と`aria-busy`を付ける。
- 比較モーダルへ`role="dialog"`と`aria-modal="true"`を設定する。
- 保存中以外はEscapeで閉じられる。
- Tab / Shift+Tabでモーダル内フォーカスを循環する。
- モーダルを閉じた際は直前のフォーカスへ戻す。
- 保存中は条件変更、解除、閉じる操作を無効化する。

## 対象外

- 3件以上の比較
- 行単位・単語単位の高度なdiff表示
- Duration差から性能劣化/改善を自動判定すること
- 非2xx間のstatus変化から障害重大度を自動判定すること
- 主要差分サマリーを比較JSON version 1へ追加すること
- HTML / PDF / HAR形式の比較レポート
- 比較レポートの自動アップロード
- Mobile Inspectorへの追加
- raw bodyやマスキング前データの比較・保存

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
- 差分のみで同一行・同一bodyを除外する。
- total / different / visible件数を計算する。
- 2xx → 非2xx/通信エラーを`要確認`と判定する。
- 非2xx → 2xxを自動で改善とは判定しない。
- Duration差をms/%で計算する。
- Duration未計測時は`比較不可`にする。
- query追加・変更・削除件数を計算する。
- 同名queryを出現順で比較する。
- URL解析不能時はqueryだけ`比較不可`にする。
- Request / Response header差分件数を集約する。
- Request / Response body差分有無を集約する。
- 比較保存requestの正常・異常を検証する。
- URL・headerを再サニタイズする。
- 通信エラー詳細を成果物へ含めない。
- 別Workspace・同一IDの比較を拒否する。

### Electron E2E

- 200通信を比較Aへ追加する。
- 503通信を比較Bへ追加する。
- 2件揃うまで比較ボタンが無効である。
- Method、Status、Header差分を表示する。
- 主要差分サマリーを表示する。
- Replay後のquery追加・変更件数をサマリーへ表示する。
- Replay前後のstatusをサマリーへ表示する。
- 差分のみで共通headerが非表示になる。
- JSONを保存できる。
- schema、options、counts、securityを確認する。
- 秘密値が成果物に含まれない。
- 比較Bを解除するとモーダルが閉じる。
- 全解除で0件へ戻る。
- 既存の検索、ピン留め、保存前プレビューが動作する。