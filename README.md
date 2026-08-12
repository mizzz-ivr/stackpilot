# stackpilot

開発者向けワークスペース型ブラウザです。

- Desktop: Electron + React + Vite
- Mobile Inspector: Expo Router + React Native（iPhone / iPad）

## セットアップ

```bash
pnpm install
```

### Desktop

```bash
pnpm dev
```

### iPhone / iPad Inspector

```bash
pnpm mobile
```

Expo Goで表示されたQRコードを読み込んで確認します。`EXPO_PUBLIC_STACKPILOT_API_URL`が未設定の場合はデモモードで起動します。

詳細は `apps/mobile/README.md` を参照してください。

### Electron E2E

保存前プレビュー、検索・ピン留め、API通信比較、Request Replayの重要操作はPlaywrightでElectronを起動して検証します。テストはbuild済みのrenderer・preload・main processを使用します。

```bash
pnpm build
pnpm test:e2e
```

Linuxの画面なし環境ではXvfbを使用します。

```bash
pnpm build
xvfb-run -a pnpm test:e2e
```

E2E実行時は専用の一時`userData`ディレクトリを作成し、固定Workspaceと固定APIログを初期化します。`STACKPILOT_E2E=1`はPlaywright fixtureからだけ設定され、通常起動のWorkspaceや設定には影響しません。native save dialogはOS依存を避けるためmain processで一時保存先へ置き換えます。Request ReplayはCIから外部ネットワークへ送信しないよう固定executorを注入し、renderer・preload・main processの操作経路と結果表示を検証します。実BrowserViewでの送信は実機確認対象です。

失敗時は`test-results/e2e`へスクリーンショットとPlaywright traceを出力します。成功時は証跡ファイルを残しません。

### IPC channel契約

sandbox preloadではローカルCommonJSモジュールをruntimeで読み込めないため、IPC channelのobject literalはmain processとpreloadで個別に保持します。同期漏れを防ぐため、`shared/domain/ipcChannels.ts`の文字列literal型へ双方を`satisfies`させ、CIではTypeScript ASTを使って実際のキーと値も比較します。

```bash
pnpm check:ipc-channels
```

共有契約は`import type`でのみ参照されるため、preloadのbuild成果物へローカルmoduleのruntime `require`は追加されません。channelを追加・変更するときは、共有型、main process、preloadの3箇所を同じPRで更新してください。

### IPC channel利用カバレッジ

`shared/domain/ipcChannels.ts`では、各channelを`invoke`または`event`へ分類します。CIは`electron/main`と`electron/preload`配下をTypeScript ASTで走査し、channel定義だけが追加されて実処理が欠落する状態を検出します。

```bash
pnpm check:ipc-channel-usage
```

`invoke` channelでは次の両方が必要です。

- main process: `ipcMain.handle(CHANNELS.<key>, ...)`
- sandbox preload: `ipcRenderer.invoke(CHANNELS.<key>, ...)`

`event` channelでは次の3つが必要です。

- main process: `webContents.send(CHANNELS.<key>, ...)`
- sandbox preload: `ipcRenderer.on(CHANNELS.<key>, ...)`
- sandbox preload: 対応する`ipcRenderer.removeListener(CHANNELS.<key>, ...)`

利用カバレッジチェックは、直接文字列指定、未定義channel、通信種別と逆方向の利用、同一channelのmain handler重複、購読解除漏れ、未対応のfire-and-forget IPC APIを失敗扱いにします。

channel追加時は、共有の文字列literal型・利用種別・main実装・preload実装を同じPRで更新し、`pnpm check:ipc-channels`と`pnpm check:ipc-channel-usage`の両方を実行してください。

### 重要IPC payload契約

`shared/domain/ipcPayloads.ts`では、影響の大きいIPCから段階的にrequest・response・event payload型を共有しています。現在の対象は次の12 channelです。

- `api-log:export-preview`
- `api-log:export-save`
- `api-log:export-discard`
- `api-log:comparison-export`
- `api-log:replay`
- `api-log:received`
- `risk:confirmation-requested`
- `risk:confirmation-respond`
- `mobile-pairing:get-status`
- `mobile-pairing:start`
- `mobile-pairing:stop`
- `mobile-pairing:status-changed`

```bash
pnpm check:ipc-payloads
```

対象channelはchannel文字列をキーに、invoke引数tuple・戻り値・event payloadを定義します。main processのhandler、sandbox preloadのinvoke / subscribe、rendererの`window.stackpilot`公開型は同じ共有契約から導出します。

sandbox preloadは共有契約を`import type`でのみ参照します。runtimeのローカルmodule読み込みは追加しません。build済みpreloadの起動はElectron E2Eで確認します。

共有payload型はcompile-timeの整合性を保証するものであり、信頼境界のruntime validationを置き換えません。APIログ保存requestはmain processの`ApiLogExportService`、比較レポート保存requestは`ApiLogComparisonExportService`、Request Replay requestは`RequestReplayService`で`unknown`として受け取り、各validatorと対象ログ再取得で検証します。APIログ受信eventとMobile pairing statusはmain process内部で生成されるため、共有型追加だけを理由に新しいruntime validatorは追加しません。

対象IPCの型を変更するときは、次を同じPRで確認してください。

- `shared/domain/ipcPayloads.ts`のrequest / result / event payload
- main processの型付きhandlerまたはevent送信
- preloadのinvokeまたはsubscribe
- rendererの`window.stackpilot`公開型
- `tests/types/criticalIpcPayloadContracts.ts`
- `pnpm check:ipc-payloads`

全IPCを一括移行せず、既存挙動を維持しながら影響の大きい経路から段階的に追加します。

## 安全なRequest Replay

Desktop API Inspectorでは、選択した既存通信を安全な範囲に限定して再実行できます。対象は`GET` / `HEAD`だけです。

再実行できる通信は次の条件をすべて満たす必要があります。

- Methodが`GET`または`HEAD`
- Request bodyを持たない
- URLがHTTP / HTTPS
- URLに`user:password@host`形式のcredentialsを含まない
- 対象ログが現在のWorkspaceに存在する
- 同じWorkspaceのBrowserViewが現在アクティブである

詳細パネルの`Request Replayを確認`から実行前プレビューを開き、Method、Workspace、元URL、安全ルールを確認してから再実行します。POST / PUT / PATCH / DELETE等は操作を無効化し、対象外理由を表示します。

### Query editor

Replayプレビューでは、元URLのoriginとpathnameを固定したままquery parameterだけをname / value単位で編集できます。

- 既存queryのname / value編集
- queryの追加・削除
- 同名parameterの複数指定
- `flag=`のような空value
- 元queryへのリセット
- 元URL / Replay URLの同時確認
- 追加 / 変更 / 削除件数の確認

queryは最大50件、nameは必須で最大128文字、valueは最大2,048文字、URLエンコード後のquery全体は最大8,192文字です。制御文字は使用できません。fragmentはReplay時に除去します。

rendererからmain processへ渡す値はWorkspace ID、source log ID、query entryのname/value配列だけです。完全URL、Method、origin、pathname、headers、bodyはrendererから指定できません。main processが元ログを再取得してReplay可否とqueryを再検証し、元ログURLからorigin/pathを再構築します。IPC payloadへ余計な`url`を混ぜても使用しません。

元通信の次の情報はコピーしません。

- Authorization / Cookie
- API keyやその他のcustom header
- Request body

実行は現在アクティブな同一WorkspaceのBrowserView isolated worldで行い、`credentials: include`、`cache: no-store`、`redirect: follow`を使用します。そのため元Cookie headerはコピーしませんが、現在のブラウザセッションCookieが対象サイトの通常のfetchポリシーに従って送信される可能性があります。

PROD Workspaceでは、rendererの実行前プレビューに加えてmain processがElectronネイティブ確認ダイアログを表示し、明示的に再実行を選択した場合だけ送信します。同じログの多重実行はmain processでも拒否します。

成功時はHTTP statusとdurationを表示します。実BrowserViewのReplay通信は既存の`webRequest` / response body capture経路へ流れるため、通常のAPIログとして確認できます。ネットワーク例外のraw文字列はrendererへ返しません。

Request body再送、元header再利用、origin/pathの任意編集、POST等の変更系method、Mobile InspectorからのReplay、Replay結果との自動比較は対象外です。詳細は`docs_request_replay_ja.md`を参照してください。

## API通信比較と安全化済み比較レポート

Desktop API Inspectorでは、一覧から最大2件の通信を比較A/Bへ追加し、次を横並びで確認できます。

- Method、URL、resource type、status、duration
- Request / Response headers
- Request / Response body
- bodyの取得状態、Content-Type、byte length、伏字項目

Header名は大文字小文字を区別せず比較します。JSON bodyは表示時と同じ整形済みテキストへ正規化するため、空白とインデントだけの違いは差分になりません。

「差分のみ」を有効にすると、同一の概要行・header・bodyセクションを非表示にします。画面上には表示件数、全項目数、差分件数を表示します。

比較モーダルの`JSON保存`では、`stackpilot-safe-api-log-comparison` version 1を保存できます。rendererからmain processへ渡す値は、Workspace ID、比較A/BのログID、差分のみ設定だけです。ログ本文、artifact本文、保存先パスは渡しません。

main processは対象ログを再取得し、次を適用して成果物を生成します。

- URL userinfoを除去
- URL fragmentを`#redacted`へ置換
- token、password、signature等の機密query値を`<redacted>`へ置換
- Authorization、Cookie、API key等の機密header値を`<redacted>`へ置換
- Location等のURL系headerを再安全化
- Request / Response bodyは既存の安全化済みpreviewだけを使用
- raw bodyと通信エラー文字列を出力しない
- 通信エラーは`request-failed`固定値へ置換

保存先はElectronの保存ダイアログで選択します。保存成功時はSHA-256、差分件数、出力項目数、保存先を画面へ表示します。差分のみがONの場合、同一項目はJSON成果物にも含まれません。

自動機密判定はfield名・header名・query名に基づくため、通常名の項目に含まれる個人情報や業務情報を意味解析して検出するものではありません。外部共有前に成果物を確認してください。詳細は`docs_api_inspector_comparison_ja.md`を参照してください。

## 安全化済みAPIログエクスポート

DesktopのAPI Inspectorでは、現在のWorkspaceと`all` / `xhr` / `fetch`フィルターに一致するログを以下の形式で保存できます。

- Stackpilot Safe JSON v1
- HAR 1.2互換

エクスポートは最大500件です。500件を超える場合は新しいログから500件を保存し、省略件数を画面と成果物へ記録します。

`JSON確認`または`HAR確認`を押すと、保存ダイアログの前に以下を確認できます。

- 安全化済み成果物の先頭12,000文字
- 最大10件の安全化済み通信サンプル
- URL userinfo・fragment・機密クエリの処理件数
- Request / Response機密ヘッダーの伏字件数
- URL系ヘッダーの再安全化件数
- Request / Response bodyの伏字フィールド数と取得不可件数
- 通信エラー文字列の除外件数
- 成果物サイズとSHA-256

プレビュー生成時の成果物はmain processのメモリへ1件だけ保持されます。保存時はpreview IDだけを渡し、確認したものと同じ成果物を保存します。プレビューは2分後、保存成功時、モーダル終了時、新しいプレビュー生成時に破棄されます。保存ダイアログをキャンセルした場合のみ、有効期限内で同じ内容を再保存できます。

### 一時追加マスキング

保存前プレビューでは、自動判定されない値・項目名を次のカテゴリへ一時的に追加できます。

- URL path segment値
- URL query名
- Request / Response header名
- JSON / `application/x-www-form-urlencoded`のフィールド名

path segmentは通信サンプルに表示されたsegmentをクリックするか、入力欄へカンマ・改行区切りで指定します。percent-encodingをdecodeした値と、大文字小文字を区別して完全一致します。同じ値のsegmentが複数URL・Location系header・HAR redirectURLに存在する場合はすべて`<redacted-path>`へ置換します。

path segmentは最大20件、各値は最大256文字です。空値、`.`、`..`、`/`または`\`を含む値、制御文字、正規化後の重複、`<redacted-path>`は受け付けません。hostname、query、fragmentはpath segment選択だけでは変更しません。

query・header・bodyフィールド名はカンマまたは改行で区切ります。大文字小文字、`-`、`_`、camelCaseの差異を正規化して照合します。各カテゴリは最大20件、各項目名は最大64文字です。空値、制御文字、正規化後の重複は受け付けません。

追加ルールを入力・選択した後は`追加ルールで再プレビュー`を押し、成果物・SHA-256・マスキング件数が更新されたことを確認してから保存します。入力内容が現在のプレビューへ未反映の間は保存できません。

追加ルールは現在のプレビューだけに適用され、以下には保存されません。

- Workspace設定
- 端末設定
- ローカルファイル
- 次回のエクスポート

自動マスキング済みの値を解除することはできません。正規表現、部分一致、path全体の自由編集、値ベースのbody置換、JSON / form以外のbody形式は追加ルールの対象外です。

保存前にmain processで再サニタイズし、以下を適用します。

- URLのuserinfo（`user:password@host`）を除去
- URL fragmentを`#redacted`へ置換
- 選択されたURL path segmentを`<redacted-path>`へ置換
- password、token、secret、API key、session、authorization、signature等の機密クエリ値を`<redacted>`へ置換
- Authorization、Cookie、Set-Cookie、API key、CSRF token等のヘッダー値を`<redacted>`へ置換
- HARのcookies配列は空にし、Cookieを展開しない
- Request / Response bodyは既存の安全化済みpreviewだけを使用
- 取得不可bodyや通信エラー文字列を推測・復元して出力しない

rendererからmain processへ渡すのは、プレビュー生成時のWorkspace ID・形式・フィルター・ユーザーが選択または入力したpath segment値・追加対象の項目名配列と、保存時のpreview IDだけです。ログ本文、raw body、成果物本文、保存先パスをrendererから指定することはできません。保存先はElectronの保存ダイアログでユーザーが選択します。

自動機密判定はキー名・ヘッダー名に基づくため、意味のないキー名、通常名のクエリやbody項目に含まれる個人情報等を完全には判定できません。path segmentはユーザー選択による完全一致のため、静的segmentを選択すると広範囲に伏字化されます。外部共有前にプレビュー・マスキング件数・成果物を確認してください。Mobileからのファイル保存・HARインポート・rawログ出力は対象外です。

## スクリプト

- `pnpm dev`: renderer + Electron起動
- `pnpm build`: Desktop renderer / Electronビルド
- `pnpm check:ipc-channels`: main process / preloadのIPC channel契約チェック
- `pnpm check:ipc-channel-usage`: 定義済みIPC channelのmain / preload利用カバレッジチェック
- `pnpm check:ipc-payloads`: 重要IPCのrequest / response / event payload共有契約チェック
- `pnpm test`: unit test（Vitest）
- `pnpm test:e2e`: build済みElectronを使用した保存・検索・比較・Request Replay E2E
- `pnpm mobile`: Expo Inspector起動
- `pnpm mobile:ios`: iOS向けExpo起動
- `pnpm mobile:android`: Android向けExpo起動
- `pnpm mobile:typecheck`: Mobile TypeScriptチェック
- `pnpm mobile:build`: Mobile Web exportによるビルド確認

## 構成

- `src/`: Desktop renderer
- `electron/`: Electron main / preload
- `apps/mobile/`: iPhone / iPad向けInspector
- `shared/`: Desktop / Mobile共有の契約・ドメイン
- `tests/unit/`: 共通ドメイン・Desktop向け単体テスト
- `tests/types/`: compile-time型契約テスト
- `tests/e2e/`: Electron E2Eテストとfixture

## ドキュメント

- `docs.md`: MVPアーキテクチャ設計メモ
- `docs_uiux_spec_ja.md`: UI/UX仕様（開発者向けワークスペースブラウザ）
- `docs_mvp_execution_plan_ja.md`: MVP次段階の実行計画（Issue/状態定義/PRテンプレート）
- `docs_multiplatform_strategy_ci_plan_ja.md`: マルチプラットフォーム方針とCI復旧計画（iPhone/iPad対応含む）
- `docs_api_inspector_comparison_ja.md`: Desktop API通信比較・差分表示・安全化済みJSON保存仕様
- `docs_request_replay_ja.md`: Desktop API Inspectorの安全なRequest Replay仕様
