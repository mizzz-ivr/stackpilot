# API Inspector 実行履歴仕様

## 目的

API Inspectorで同じ通信条件を調査するとき、直前の再実行結果を見失わず、元通信と結果通信の比較へ戻れるようにする。

加えて、過去に使用したQuery条件を既存のRequest Replayプレビューへ復元し、条件を手入力し直さずに再確認できるようにする。

Request Replay自体は成功したものの結果通信ログの自動捕捉に失敗した場合も、実行条件とHTTP結果を履歴へ残し、同条件の再確認を継続できるようにする。

調査中に重要なReplay条件はピン留めし、新しいReplayが増えても履歴上部で参照しやすくする。

## 対象

`api-log:replay`が`status: replayed`を返した成功実行を履歴として記録する。

履歴へ保持する情報は次のとおり。

- Workspace ID
- 元通信ログID
- 結果通信ログID（捕捉できた場合のみ）
- Method
- Replay target URL
- Query parameterのname / value
- HTTP status
- Duration
- 実行時刻
- ピン留め状態

Request / Response body、Request / Response headers、通信エラー詳細は履歴へ複製しない。

## 保持範囲

- Workspaceごとに最大20件
- 新しいReplayは必ず履歴へ保持する
- rendererのメモリだけに保持
- 専用のrenderer-only Zustand storeで管理
- ファイル、localStorage、electron-storeへ永続化しない
- アプリ再読み込み・再起動で履歴とピン状態を破棄
- Workspace切替では履歴・ピン状態を破棄せず、対象Workspaceの履歴だけを表示

20件上限を超える場合は、新しく追加したReplayを保持した上で既存履歴を次の優先順で残す。

1. 新しく追加したReplay
2. 既存のピン留め履歴（新しい順）
3. 既存の未ピン履歴（新しい順）

そのため通常は既存の未ピン履歴のうち最も古いものから上限外になる。

既存20件がすべてピン留め済みの場合も最新Replayを記録することを優先し、最も古いピン留め履歴が上限から外れ得る。ピン留めは無制限保持ではなく、20件のメモリ上限内で優先保持するための状態とする。

## 履歴へ記録するタイミング

履歴記録の起点は自動比較の成立ではなく、Request Replayの成功結果とする。

`RequestReplayDialog`が`status: replayed`を受け取った時点で、実行時に確定していたQueryとReplay target URL、およびmain processから返されたHTTP status / durationを1件記録する。

- `replayedLogId`あり: 結果ログIDを履歴へ保持し、既存の自動比較要求も行う
- `replayedLogId`なし: 結果ログIDなしで履歴へ保持し、Replay成功扱いを維持する
- `status: cancelled`: 履歴へ追加しない
- `status: failed`: 履歴へ追加しない
- IPC呼び出し自体が例外終了: 履歴へ追加しない

新規履歴のピン状態は未ピンで開始する。

この方式により、結果ログcaptureのbest-effort性を履歴保存へ波及させない。

履歴からQuery条件を復元して再実行し、そのReplayが成功した場合も新しい履歴として通常どおり追加する。

## ピン留め

各履歴はピン留め / 解除できる。

- ピン留め履歴を未ピン履歴より上部へ表示する
- ピン留め同士は新しい順を維持する
- 未ピン履歴同士も新しい順を維持する
- ピン解除時は未ピン履歴内の元の時系列位置へ戻る
- Workspace切替では状態を維持する
- 「クリア」で対象Workspaceのピン状態を履歴と一緒に削除する
- アプリ再起動時は履歴と一緒に破棄する

操作ボタンは既存APIログ一覧のピン操作と同じ`PinIcon`とamber toneを再利用する。

アクセシビリティでは次を満たす。

- 未ピン: `再実行履歴をピン留め`
- ピン済み: `再実行履歴のピン留めを解除`
- `aria-pressed`で現在状態を公開する
- 色だけに依存せずボタン状態を支援技術へ伝える

## Query / Replay target URL

履歴へ保存するQueryは、実行直前に既存Query editorでvalidation済みのname / value配列をコピーして保持する。

- 同名parameterは出現順を維持
- 空valueを保持
- Query件数・name長・value長・encoded長は既存Request Replay validationを通過済み

Replay target URLは、元通信URLと実行Queryから既存`createRequestReplayTargetUrl`で生成した値を保持する。

履歴のために結果通信URLを新しく取得せず、完全URLを新規IPC payloadとしてmain processへ送信しない。

## Request Replayプレビューへの復元

元通信ログが現在rendererに保持され、既存のRequest Replay対象条件を満たす場合だけ「この条件で再実行」を有効にする。

結果ログを捕捉できなかった履歴でも、元通信ログが残っている限りこの操作は利用できる。

操作時は履歴から直接通信を送信せず、既存のRequest Replayプレビューを開いて次だけを復元する。

- Query parameterのname
- Query parameterのvalue
- 同名parameterの出現順
- 空value

次は履歴から復元しない。

- origin
- path
- Request headers
- Request body
- Authorization
- Cookie
- custom header

origin / pathは元通信ログを基準に既存のmain process側処理で再構築する。履歴から完全URLをmain processへ送信しない。

プレビューを開いただけでは通信を送信しない。ユーザーが内容を確認して既存の「再実行」を押した場合だけ、従来のRequest Replay処理へ進む。

既存の安全境界をそのまま維持する。

- GET / HEADのみ
- Request bodyを持つ通信は対象外
- Query件数・文字数・encoded長の既存validationを再利用
- PROD Workspaceではmain processのElectronネイティブ確認を必須化
- 同一ログの並列Replayをmain processで拒否
- 元Authorization / Cookie / custom header / bodyをコピーしない

履歴のQueryが将来validation条件の変更等で現在の条件を満たさない場合はプレビュー内でエラー表示し、再実行を無効化する。

## 比較への復元

履歴に結果通信ログIDがあり、元通信ログIDと結果通信ログIDの両方が現在rendererのAPIログ内に存在する場合だけ「比較へ復元」を有効にする。

復元時は次を行う。

1. 現在の比較A/Bを解除
2. 履歴の元通信を比較Aへ設定
3. 履歴の結果通信を比較Bへ設定
4. 既存の「比較を開く」操作から比較画面を表示

比較Dialog、主要差分サマリー、安全化済み比較JSON保存は既存機能をそのまま再利用する。

## 結果ログ未捕捉・ログ保持外

結果ログを自動捕捉できず`replayedLogId`がない場合は、履歴へ「結果ログ未捕捉」と表示する。

この場合:

- HTTP status / duration / Replay target URL / Queryは表示できる
- 「この条件で再実行」は元ログが残る限り利用可能
- 「比較へ復元」は無効
- Replay自体は成功扱いを維持

rendererのAPIログは最大500件である。履歴のためだけにログ保持上限を変更しない。

元通信ログが保持範囲から外れた場合は「この条件で再実行」を無効化し、「元ログ保持外」と表示する。

結果ログIDはあるが元通信または結果通信が保持範囲から外れ、比較A/Bを復元できない場合は「比較へ復元」を無効化し、「比較ログ保持外」と表示する。

履歴メタデータ自体は残す。main process側のAPIログ保持上限や収集方式は変更しない。

## クリア

「クリア」は現在選択中のWorkspaceの履歴とピン状態だけを削除する。他Workspaceの履歴には影響しない。

履歴はメモリ上の補助情報であり、APIログ本体や保存済み比較成果物は削除しない。

## セキュリティ

- 履歴生成・Query復元・ピン留めのために新しいIPCを追加しない
- `api-log:replay`の既存request / response契約を変更しない
- 結果ログcaptureのために追跡用header / query / Cookieを追加しない
- ピン状態を永続化・外部送信しない
- 履歴から直接Replayを実行しない
- raw bodyを取得しない
- headerを履歴へ複製しない
- 認証情報を追加取得しない
- Replay実行時は既存のmain process再検証を必ず通す
- PRODのネイティブ確認を迂回しない
- 外部サービスへ履歴を送信しない
- 保存機能を追加しない

## 対象外

- Replay結果capture自体の成功率改善
- 履歴・ピン状態の永続化
- 履歴のエクスポート
- 履歴から確認なしで直接再実行
- POST / PUT / PATCH / DELETEのReplay
- header / bodyの復元・編集
- 複数履歴の一括比較
- 履歴の検索・タグ
- Mobile Inspectorへの履歴同期

## テスト観点

### Unit Test

- Workspaceごとに最大20件へ制限する
- 新しいReplayを必ず保持する
- ピン留め履歴を上部へ表示する
- ピン / 未ピン各グループの新しい順を維持する
- 21件目追加時は既存の未ピン最古を優先削除する
- 既存20件が全件ピン済みでも最新Replayを保持する
- ピン留め / 解除を対象履歴だけへ反映する
- 同一IDを重複させない
- 他Workspaceの履歴を保持する
- Workspace単位でクリアする
- 同名Queryを出現順で保持する
- 元ログと結果ログの両方がある場合だけ比較可能にする
- `resultLogId`なしでは比較不可にする

### Electron E2E

#### capture成功

- 再実行後に履歴が追加される
- Replay target URL、status、Query件数を表示する
- 履歴をピン留めし`aria-pressed=true`になる
- Request Replayプレビューを開閉してもピン状態を維持する
- ピン解除し`aria-pressed=false`へ戻る
- 履歴からRequest Replayプレビューを開く
- 過去のQuery名・値・空valueをプレビューへ復元する
- 比較対象を全解除する
- 履歴から元通信と結果通信を比較A/Bへ復元する
- 既存の比較画面を再度開ける

#### captureなし成功

- Request Replayは成功し、HTTP status / durationを表示する
- 自動比較は開始しない
- 成功した実行条件を履歴へ追加する
- 「結果ログ未捕捉」と表示する
- 「比較へ復元」を無効化する
- 「この条件で再実行」は利用可能
- 履歴QueryをRequest Replayプレビューへ復元できる
