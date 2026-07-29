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

保存前プレビューの重要操作はPlaywrightでElectronを起動して検証します。テストはbuild済みのrenderer・preload・main processを使用します。

```bash
pnpm build
pnpm test:e2e
```

Linuxの画面なし環境ではXvfbを使用します。

```bash
pnpm build
xvfb-run -a pnpm test:e2e
```

E2E実行時は専用の一時`userData`ディレクトリを作成し、固定Workspaceと固定APIログを初期化します。`STACKPILOT_E2E=1`はPlaywright fixtureからだけ設定され、通常起動のWorkspaceや設定には影響しません。native save dialogはOS依存を避けるためmain processで一時保存先へ置き換えます。

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

`shared/domain/ipcPayloads.ts`では、影響の大きいIPCから段階的にrequest・response・event payload型を共有しています。現在の対象は次の5 channelです。

- `api-log:export-preview`
- `api-log:export-save`
- `api-log:export-discard`
- `risk:confirmation-requested`
- `risk:confirmation-respond`

```bash
pnpm check:ipc-payloads
```

対象channelはchannel文字列をキーに、invoke引数tuple・戻り値・event payloadを定義します。main processのhandler、sandbox preloadのinvoke / subscribe、rendererの`window.stackpilot`公開型は同じ共有契約から導出します。

sandbox preloadは共有契約を`import type`でのみ参照します。runtimeのローカルmodule読み込みは追加しません。build済みpreloadの起動はElectron E2Eで確認します。

共有payload型はcompile-timeの整合性を保証するものであり、信頼境界のruntime validationを置き換えません。APIログ保存requestは引き続きmain processの`ApiLogExportService`で`unknown`として受け取り、既存validatorで検証します。

対象IPCの型を変更するときは、次を同じPRで確認してください。

- `shared/domain/ipcPayloads.ts`のrequest / result / event payload
- main processの型付きhandler
- preloadのinvokeまたはsubscribe
- rendererの`window.stackpilot`公開型
- `tests/types/criticalIpcPayloadContracts.ts`
- `pnpm check:ipc-payloads`

全IPCを一括移行せず、既存挙動を維持しながら影響の大きい経路から段階的に追加します。

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
- `pnpm check:ipc-payloads`: APIログ保存・リスク確認IPCのpayload共有契約チェック
- `pnpm test`: unit test（Vitest）
- `pnpm test:e2e`: build済みElectronを使用した保存前プレビューE2E
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
