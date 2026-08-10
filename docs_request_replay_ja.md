# Desktop API Inspector Request Replay仕様

## 目的

API Inspectorで確認した通信を、ブラウザ画面上の操作を再現しなくても再確認できるようにする。

ログから元リクエストを完全複製すると認証情報の再利用や本番環境への意図しない副作用につながるため、安全なGET / HEADに限定する。加えてAPI調査でpage、limit、filter等を変えられるよう、originとpathを固定したままqueryだけを編集できるようにする。

## 対象

再実行できる通信は次の条件をすべて満たすものだけとする。

- Methodが`GET`または`HEAD`
- Request bodyのbyte lengthが0
- URLがHTTPまたはHTTPS
- URLに`user:password@host`形式のcredentialsを含まない
- 対象ログが指定Workspaceに存在する
- 対象Workspaceが現在のBrowserViewでアクティブである

条件を満たさない通信は詳細パネルでReplay操作を無効化し、理由を表示する。

## Query editor

ReplayプレビューではURL全体を自由入力させず、query parameterをname / value単位で編集する。

可能な操作:

- 既存parameterのname / value編集
- parameter追加
- parameter削除
- 同名parameterの複数指定
- 空value（`flag=`）
- 元queryへのリセット

変更不可:

- scheme
- hostname
- port
- pathname
- fragment

fragmentはReplay時に除去する。

### Query制約

- 最大50件
- nameは必須、最大128文字
- valueは最大2,048文字
- URLエンコード後のquery全体は最大8,192文字
- name / valueの制御文字は禁止

rendererとmain processの両方で同じdomain validatorを使用する。UIの入力制御だけを信頼境界にはしない。

### 実行前差分

プレビューには次を表示する。

- 元URL
- Replay URL
- query追加件数
- query変更件数
- query削除件数

同名parameterは独立した行として保持し、順序を維持する。

## 実行フロー

1. API Inspector一覧から通信を選択する。
2. 詳細パネルの「Request Replayを確認」を押す。
3. 実行前プレビューでWorkspace、Method、元URL、安全ルールを確認する。
4. 必要に応じてqueryを追加・編集・削除する。
5. Replay URLと追加 / 変更 / 削除件数を確認する。
6. rendererは`workspaceId`、`logId`、`queryEntries`だけをmain processへ送る。
7. main processがWorkspaceと元ログを再取得する。
8. main processがReplay可否とquery制約を再検証する。
9. main processが元ログURLからorigin / pathnameを再取得し、queryだけを`queryEntries`から再構築する。
10. PRODの場合はElectronのネイティブ確認ダイアログを表示する。
11. 現在アクティブな同一WorkspaceのBrowserView isolated worldで`fetch`を実行する。
12. HTTP statusとdurationをrendererへ返す。
13. BrowserViewの通信は既存の`webRequest` / response body capture経路でAPIログとして扱われる。

## IPCと信頼境界

rendererからmain processへ渡せるReplay情報は次だけとする。

- Workspace ID
- source log ID
- query entryのname / value配列

rendererから次を受け取らない。

- 完全URL
- Method
- origin
- pathname
- header
- body
- 任意script

IPC payloadに余計な`url`等を混ぜてもmain processは参照しない。Replay URLは常に元ログURLから再構築する。

## 再送する情報

元ログから再利用するもの:

- Method
- origin
- pathname
- query（未編集の場合）

query編集時は元queryを編集後entriesへ置き換える。

次はコピーしない。

- Authorization header
- Cookie header
- Set-Cookie
- API key系header
- custom header
- Request body

BrowserViewの現在セッションで`credentials: include`を使用するため、ブラウザのCookie jarに保存されているCookieは通常のfetchポリシーに従って送信される可能性がある。この挙動は実行前プレビューへ明示する。

## fetch設定

- `credentials: include`
- `cache: no-store`
- `redirect: follow`
- isolated world ID: `1001`

最終URLとMethodはmain processが決定し、`JSON.stringify`した値をisolated worldへ渡す。

## PROD保護

PROD Workspaceではrendererのプレビューだけでは実行できない。

main processがElectronネイティブ確認ダイアログを表示し、ユーザーが「再実行」を選択した場合だけexecutorを呼ぶ。

確認ダイアログでは次を明示する。

- 元ログの認証headerやbodyはコピーしない
- origin / pathはmain processが元通信から固定して再構築する
- queryだけが編集対象である
- 現在セッションCookieが送信される可能性がある
- 意図した通信である場合だけ実行する

キャンセル時は通信を送信しない。

## 多重実行防止

rendererは実行中にボタン、閉じる操作、query変更を抑止する。

加えてmain processは`workspaceId:logId`単位でin-flight状態を保持し、同じログへの並列Replayを`replay-in-progress`として拒否する。renderer側だけの制御へ依存しない。

## エラー

main processでは次を区別する。

- `invalid-request`: IPC request shape不正
- `invalid-query`: query件数、長さ、制御文字等が不正
- `workspace-not-found`: Workspace不存在
- `log-not-found`: 対象ログ不存在
- `workspace-mismatch`: 別WorkspaceのログID
- `not-replayable`: Method / body / URL条件が対象外
- `workspace-not-active`: 対象WorkspaceのBrowserViewが非アクティブ
- `replay-in-progress`: 同一ログを実行中
- `dialog-unavailable`: PROD確認ダイアログを表示できない
- `execution-failed`: fetch失敗

ネットワーク例外のraw文字列はrendererへ返さず、一般化したメッセージを返す。

## 対象外

- POST / PUT / PATCH / DELETE
- Request bodyの再送・編集
- 元Authorization / Cookie / custom headerのコピー
- Header編集
- origin / pathname編集
- 任意URL入力
- cURL import
- HARからのReplay
- Mobile InspectorからのReplay
- Replay結果との自動比較画面
- 定期実行、バックグラウンドReplay

## テスト観点

### Unit Test

- GET / HEADを許可する
- POST等を拒否する
- body付きGETを拒否する
- HTTP / HTTPS以外を拒否する
- 不正URLを拒否する
- URL credentialsを拒否する
- 重複queryと空valueをparseできる
- query編集後もorigin / pathを維持する
- fragmentを除去する
- percent encodingをURL APIで安全に再構築する
- query件数、name/value長、全体長、制御文字、空nameを拒否する
- IPC request shapeを検証する
- rendererが余計な完全URLを送ってもmain processが無視する
- 不正queryをmain processで拒否する
- 別Workspaceのログを拒否する
- PROD確認キャンセル時にexecutorを呼ばない
- 同一ログの並列Replayを拒否する

### Electron E2E

- GETログでReplayプレビューを開ける
- 元queryをname/valueとして表示する
- query valueを編集できる
- query parameterを追加できる
- 空nameの間は実行できない
- Replay URLへquery編集が反映される
- 追加 / 変更 / 削除差分を確認できる
- Replay成功時にstatus / durationを確認できる
- POSTログではReplay操作が無効である
- 既存APIログ比較、保存、検索、ピン留めが継続して動作する

### 実機確認

Windows / macOSのElectronで次を確認する。

- 同一Workspaceの実API GETが編集queryで再実行される
- origin / pathnameが編集できず元通信と一致する
- 重複queryと空valueが意図どおり送信される
- Unicode / space等がURLエンコードされて送信される
- 再実行通信がAPI Inspectorへ新しいログとして追加される
- 現在セッションCookieが対象サイトのpolicyに従って送信される
- 元ログのAuthorization / custom headerがコピーされない
- CORS失敗時に一般化されたエラーを表示する
- 別Workspace表示中は再実行を拒否する
- PRODでネイティブ確認のキャンセル時に通信が発生しない
- PRODで確認後のみ通信が発生する
