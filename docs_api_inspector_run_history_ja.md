# API Inspector 実行履歴仕様

## 目的

API Inspectorで同じ通信条件を調査するとき、直前の再実行結果を見失わず、元通信と結果通信の比較へ戻れるようにする。

加えて、過去に使用したQuery条件を既存のRequest Replayプレビューへ復元し、条件を手入力し直さずに再確認できるようにする。

## 対象

自動比較まで成立した再実行結果を履歴として記録する。

履歴へ保持する情報は次のとおり。

- Workspace ID
- 元通信ログID
- 結果通信ログID
- Method
- 結果URL
- Query parameterのname / value
- HTTP status
- Duration
- 実行時刻

Request / Response body、Request / Response headers、通信エラー詳細は履歴へ複製しない。

## 保持範囲

- Workspaceごとに最大20件
- 新しい履歴を先頭へ追加
- 21件目以降は古い履歴から削除
- rendererのメモリだけに保持
- ファイル、localStorage、electron-storeへ永続化しない
- アプリ再読み込み・再起動で履歴を破棄
- Workspace切替では履歴を破棄せず、対象Workspaceの履歴だけを表示

## 履歴へ記録するタイミング

既存の自動比較が成立し、比較A/Bへ元通信と結果通信が揃ったタイミングで1件記録する。

この方式により、結果通信を捕捉できなかった再実行は履歴へ記録しない。結果ログが存在しない履歴を作らず、「履歴から比較へ戻る」という機能目的を優先する。

通常の手動比較や、履歴から比較対象を復元した操作では新しい履歴を作らない。

履歴からQuery条件を復元して再実行し、その結果通信の自動比較まで成立した場合は、新しい再実行として通常どおり履歴へ追加する。

## Query

履歴のQueryは結果ログのURLをURL APIで解析して取得する。

- 同名parameterは出現順を維持
- 空valueを保持
- URLを解析できない場合は空配列として扱う

履歴表示ではQueryの件数と結果URLを確認できる。値を別途永続化しない。

## Request Replayプレビューへの復元

元通信ログが現在rendererに保持され、既存のRequest Replay対象条件を満たす場合だけ「この条件で再実行」を有効にする。

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

履歴のQueryが現在のvalidation条件を満たさない場合はプレビュー内でエラー表示し、再実行を無効化する。

## 比較への復元

履歴の元通信ログIDと結果通信ログIDが、現在rendererが保持するAPIログ内に両方存在する場合だけ「比較へ復元」を有効にする。

復元時は次を行う。

1. 現在の比較A/Bを解除
2. 履歴の元通信を比較Aへ設定
3. 履歴の結果通信を比較Bへ設定
4. 既存の「比較を開く」操作から比較画面を表示

比較Dialog、主要差分サマリー、安全化済み比較JSON保存は既存機能をそのまま再利用する。

## ログ保持外

rendererのAPIログは最大500件である。履歴のためだけにログ保持上限を変更しない。

元通信ログが保持範囲から外れた場合は「この条件で再実行」を無効化し、「元ログ保持外」と表示する。

元通信または結果通信が保持範囲から外れ、比較A/Bを復元できない場合は「比較へ復元」を無効化し、「比較ログ保持外」と表示する。

履歴メタデータ自体は残す。main process側のAPIログ保持上限や収集方式は変更しない。

## クリア

「クリア」は現在選択中のWorkspaceの履歴だけを削除する。他Workspaceの履歴には影響しない。

履歴はメモリ上の補助情報であり、APIログ本体や保存済み比較成果物は削除しない。

## セキュリティ

- 履歴生成・Query復元のために新しいIPCを追加しない
- 履歴から直接Replayを実行しない
- raw bodyを取得しない
- headerを履歴へ複製しない
- 認証情報を追加取得しない
- 既存の安全化済みNetworkLogだけを参照する
- Replay実行時は既存のmain process再検証を必ず通す
- PRODのネイティブ確認を迂回しない
- 外部サービスへ履歴を送信しない
- 保存機能を追加しない

## 対象外

- 履歴の永続化
- 履歴のエクスポート
- 履歴から確認なしで直接再実行
- POST / PUT / PATCH / DELETEのReplay
- header / bodyの復元・編集
- 複数履歴の一括比較
- 履歴の検索・タグ・ピン留め
- Mobile Inspectorへの履歴同期
- 結果ログを捕捉できなかった実行の履歴化

## テスト観点

### Unit Test

- Workspaceごとに最大20件へ制限する
- 新しい履歴を先頭へ追加する
- 同一IDを重複させない
- 他Workspaceの履歴を保持する
- Workspace単位でクリアする
- 同名Queryを出現順で解析する
- 不正URLを安全に処理する
- 元ログと結果ログの両方がある場合だけ比較可能にする

### Electron E2E

- 再実行後に履歴が追加される
- 結果URL、status、Query件数を表示する
- 履歴からRequest Replayプレビューを開く
- 過去のQuery名・値・空valueをプレビューへ復元する
- Replay URLが元通信のorigin / pathと履歴Queryの組み合わせになる
- プレビューを開いただけでは通信を送信しない
- 比較対象を全解除する
- 履歴から元通信と結果通信を比較A/Bへ復元する
- 既存の比較画面を再度開ける
