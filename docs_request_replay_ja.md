# Desktop API Inspector Request Replay仕様

## 目的

API Inspectorで確認した通信を、ブラウザ画面上の操作を再現しなくても再確認できるようにする。

ただし、ログから元リクエストを完全複製すると認証情報の再利用や本番環境への意図しない副作用につながるため、MVPでは安全な範囲に限定する。

## 対象

再実行できる通信は次の条件をすべて満たすものだけとする。

- Methodが`GET`または`HEAD`
- Request bodyのbyte lengthが0
- URLがHTTPまたはHTTPS
- URLに`user:password@host`形式のcredentialsを含まない
- 対象ログが指定Workspaceに存在する
- 対象Workspaceが現在のBrowserViewでアクティブである

条件を満たさない通信は詳細パネルでReplay操作を無効化し、理由を表示する。

## 実行フロー

1. API Inspector一覧から通信を選択する。
2. 詳細パネルの「Request Replayを確認」を押す。
3. 実行前プレビューでWorkspace、Method、URL、安全ルールを確認する。
4. rendererは`workspaceId`と`logId`だけをmain processへ送る。
5. main processがWorkspaceとログを再取得する。
6. main processがReplay可否を再検証する。
7. PRODの場合はElectronのネイティブ確認ダイアログを表示する。
8. 現在アクティブな同一WorkspaceのBrowserView isolated worldで`fetch`を実行する。
9. HTTP statusとdurationをrendererへ返す。
10. BrowserViewの通信は既存の`webRequest` / response body capture経路でAPIログとして扱われる。

## 再送する情報

MVPでは元ログから次だけを再利用する。

- Method
- URL

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

URLとMethodはmain processがログから取得し、`JSON.stringify`した値をisolated worldへ渡す。rendererから任意URLやscriptを渡すことはできない。

## PROD保護

PROD Workspaceではrendererのプレビューだけでは実行できない。

main processがElectronネイティブ確認ダイアログを表示し、ユーザーが「再実行」を選択した場合だけexecutorを呼ぶ。

確認ダイアログでは次を明示する。

- 元ログの認証headerやbodyはコピーしない
- 現在セッションCookieが送信される可能性がある
- 意図した通信である場合だけ実行する

キャンセル時は通信を送信しない。

## 多重実行防止

rendererは実行中にボタン、閉じる操作、条件変更を抑止する。

加えてmain processは`workspaceId:logId`単位でin-flight状態を保持し、同じログへの並列Replayを`replay-in-progress`として拒否する。renderer側だけの制御へ依存しない。

## エラー

main processでは次を区別する。

- `invalid-request`: IPC request shape不正
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
- Request bodyの再送
- 元Authorization / Cookie / custom headerのコピー
- Header編集
- URL編集
- cURL import
- HARからのReplay
- Mobile InspectorからのReplay
- 定期実行、バックグラウンドReplay

## テスト観点

### Unit Test

- GET / HEADを許可する
- POST等を拒否する
- body付きGETを拒否する
- HTTP / HTTPS以外を拒否する
- 不正URLを拒否する
- URL credentialsを拒否する
- IPC request shapeを検証する
- main processが元ログのMethod / URLをexecutorへ渡す
- 別Workspaceのログを拒否する
- PROD確認キャンセル時にexecutorを呼ばない
- 同一ログの並列Replayを拒否する

### Electron E2E

- GETログでReplayプレビューを開ける
- 安全ルールを確認できる
- Replay成功時にstatus / durationを確認できる
- POSTログではReplay操作が無効である
- 既存APIログ比較、保存、検索、ピン留めが継続して動作する

### 実機確認

Windows / macOSのElectronで次を確認する。

- 同一Workspaceの実API GETが再実行される
- 再実行通信がAPI Inspectorへ新しいログとして追加される
- 現在セッションCookieが対象サイトのpolicyに従って送信される
- 元ログのAuthorization / custom headerがコピーされない
- CORS失敗時に一般化されたエラーを表示する
- 別Workspace表示中は再実行を拒否する
- PRODでネイティブ確認のキャンセル時に通信が発生しない
- PRODで確認後のみ通信が発生する
