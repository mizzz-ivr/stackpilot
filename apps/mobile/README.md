# Stackpilot Inspector Mobile

iPhone / iPad向けのAPI Inspector MVPです。Expo Router + React Nativeで構成しています。

## 起動

リポジトリルートで依存関係をインストールします。

```bash
pnpm install --frozen-lockfile
pnpm mobile
```

Expo Goで開発用QRコードを読み込んで起動してください。

## Desktopとのペアリング

1. iPhone / iPadとDesktopを同じLANへ接続する
2. Desktop版Stackpilotの`Mobile接続`を開く
3. `接続を開始`を押す
4. Mobileアプリの`QRで接続`を開く
5. Desktopに表示されたペアリングQRコードを読み取る

ペアリング後は、DesktopでactiveになっているWorkspaceのAPIログを自動取得します。Workspaceを切り替えた場合も、次回の自動取得時に新しいWorkspaceへ追従します。

## 自動更新

- 接続成功時は2秒間隔で更新を確認します
- 更新カーソルが同じ場合、Desktop APIは本文なしの`304 Not Modified`を返します
- 通信失敗時は2秒、4秒、8秒、15秒の順で再試行間隔を伸ばします
- 接続が回復すると2秒間隔へ戻ります
- アプリがバックグラウンドの間は自動取得を停止します
- フォアグラウンドへ戻ると即時に最新状態を取得します
- ペアリング期限切れ時は自動更新を停止し、再ペアリングを案内します
- `今すぐ更新`とPull to Refreshは引き続き利用できます

## ログの検索・絞り込み

- URL、パス、Method、Statusをテキスト検索できます
- 空白で区切った検索語はAND条件として扱います
- MethodはGET、POST、PUT、PATCH、DELETE、その他で絞り込めます
- Statusは2xx、3xx、4xx、5xx、ERRで絞り込めます
- `失敗のみ`では4xx、5xx、status未取得の通信を表示します
- 検索、Method、Status、失敗のみはAND条件で組み合わせます
- 表示件数と全件数を一覧上部へ表示します
- Workspaceを切り替えると検索条件はリセットされます

## ログの固定

- 一覧の`固定`から重要な通信を一覧上部へ移動できます
- 同一Workspaceで自動更新されても、同じログIDの固定状態は維持されます
- `解除`で通常の並びへ戻せます
- Workspaceを切り替えると固定状態はリセットされます
- 固定状態は端末へ永続保存しません

## Request bodyの安全な取得

Desktop版では、以下の条件を満たすRequest bodyだけをメモリ上で取得します。

- `application/json`
- `application/*+json`
- `application/x-www-form-urlencoded`
- Electronのmemory upload bytes
- 最大16KiB
- UTF-8として読み取れる内容

以下は内容を取得せず、取得不可理由だけを表示します。

- `multipart/form-data`
- file / blob upload
- binary body
- `text/plain`
- 16KiBを超えるbody
- JSONとして解析できないbody

raw bodyはRequest headers確定後に安全化し、元データを破棄します。ディスク保存やログ出力は行いません。

JSONとform-urlencodedでは、password、secret、token、API key、Cookie、session、CSRF等の項目を`<redacted>`へ置換します。JSONはネストしたオブジェクトや配列も再帰的に処理します。

## Response bodyの安全な取得

Desktop版では、各BrowserViewへ接続したChrome DevTools ProtocolのNetworkイベントから、以下のResponse bodyだけを取得します。

- `application/json`
- `application/*+json`
- XHR / fetch通信
- 最大64KiB
- UTF-8として読み取れる内容

以下は内容を取得せず、取得不可理由だけを表示します。

- JSON以外のContent-Type
- 64KiBを超えるbody
- JSONとして解析できないbody
- UTF-8として読み取れないbody
- Chromiumがbodyを保持しておらず取得できない場合
- Response body取得用Debuggerへ接続できない場合

Response JSONでは、Request bodyと同じ機密キー判定を使用し、password、secret、token、API key、Cookie、session、CSRF等の項目を`<redacted>`へ置換します。ネストしたオブジェクトや配列も再帰的に処理します。

raw Response bodyは解析とマスキングの間だけメモリ上で保持し、安全化後に破棄します。Mobile API、JSONコピー、共有サマリーへは安全化済みデータだけを渡します。

### DevToolsとの併用

ElectronのDebugger接続はDevTools起動時に解除されるため、DevToolsを開いている間に完了した通信はResponse bodyを取得できません。通信メタデータ、Request headers、Request body、Response headersは引き続き記録します。

DevToolsを閉じるとResponse body取得処理へ自動再接続します。DevTools操作を妨げることはありません。

## 通信情報のコピー・共有

通信詳細の`調査アクション`から以下を利用できます。

- URLをクリップボードへコピー
- 安全化済みResponse bodyが取得できた場合、整形済みJSONをコピー
- Method、URL、Request headers、安全化済みRequest bodyからcURLを生成してコピー
- Method、Status、Duration、URL、安全化済みcURLとbody取得状況を標準共有シートで共有

cURL生成時は以下の機密ヘッダーを`<redacted>`へ置換します。

- `Authorization`
- `Proxy-Authorization`
- `Cookie`
- `Set-Cookie`
- `X-API-Key`
- `API-Key`
- `X-Auth-Token`
- `X-CSRF-Token`
- `X-XSRF-Token`

`Host`、`Content-Length`、`Connection`は再実行時の不整合を避けるためcURLから除外します。安全化に成功したRequest bodyだけを`--data-raw`へ追加し、16KiB超過・対象外形式・解析失敗時はbodyを追加しません。

Response JSONコピーは安全化済みデータだけを対象にします。ただし、キー名から機密項目と判定できない値が含まれる可能性はあるため、コピー後の共有先を確認してください。

## セキュリティ

- DesktopのローカルAPIは既定で停止しています
- ユーザー操作時のみ同一LAN向けに起動します
- APIアクセスには短命Bearer tokenが必要です
- QRコードとtokenは10分後、Desktopで停止した時、またはDesktopアプリ終了時に無効になります
- 接続情報はiOS Keychain / Android Keystoreを利用するSecureStoreへ保存します
- QR画像やペアリング文字列を第三者へ共有しないでください
- Request / Response bodyのraw値は永続化・console出力しません
- 解析やマスキングに失敗したbodyをraw文字列として表示しません
- サイズ上限を超えたbodyは先頭部分も表示しません

## 表示モード

### デモモード

ペアリング情報と`EXPO_PUBLIC_STACKPILOT_API_URL`がどちらも未設定の場合は、アプリ内のサンプル通信を表示します。

### QRペアリングモード

DesktopのQRコードから接続先と短命tokenを取得し、以下へアクセスします。

```text
GET {Desktop LAN URL}/v1/mobile/inspector/snapshot?cursor={last cursor}
Authorization: Bearer {short-lived token}
```

### 固定URLモード

開発時のみ、環境変数でInspector APIを直接指定できます。

```bash
EXPO_PUBLIC_STACKPILOT_API_URL=http://192.168.1.10:4100 pnpm mobile
```

固定URLモードはBearer tokenを付与しないため、通常はQRペアリングを利用してください。

## レスポンシブ仕様

- iPhone相当: APIログ一覧から通信詳細画面へ遷移
- iPad相当（幅768px以上）: APIログ一覧と通信詳細を2ペイン表示

## 確認コマンド

```bash
pnpm mobile:typecheck
pnpm mobile:build
```

## 現時点の対象外

- フルブラウザ機能
- リクエスト再送
- multipart / file / blob / binary Request body取得
- 16KiBを超えるRequest bodyの内容表示
- JSON以外のResponse body取得
- 64KiBを超えるResponse bodyの内容表示
- DevTools起動中のResponse body取得
- 機密ヘッダーやbody項目を伏字なしでコピーする機能
- HAR / JSONファイル出力
- 正規表現検索
- Header・Response Body全文検索
- 固定ログの永続化
- WebSocket / Server-Sent Events
- バックグラウンド常時通信
- インターネット越しの接続
- クラウド中継
- App Store / EAS Build設定
