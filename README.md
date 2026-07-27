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
- `tests/e2e/`: Electron E2Eテストとfixture

## ドキュメント

- `docs.md`: MVPアーキテクチャ設計メモ
- `docs_uiux_spec_ja.md`: UI/UX仕様（開発者向けワークスペースブラウザ）
- `docs_mvp_execution_plan_ja.md`: MVP次段階の実行計画（Issue/状態定義/PRテンプレート）
- `docs_multiplatform_strategy_ci_plan_ja.md`: マルチプラットフォーム方針とCI復旧計画（iPhone/iPad対応含む）