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

保存前にmain processで再サニタイズし、以下を適用します。

- URLのuserinfo（`user:password@host`）を除去
- URL fragmentを`#redacted`へ置換
- password、token、secret、API key、session、authorization、signature等の機密クエリ値を`<redacted>`へ置換
- Authorization、Cookie、Set-Cookie、API key、CSRF token等のヘッダー値を`<redacted>`へ置換
- HARのcookies配列は空にし、Cookieを展開しない
- Request / Response bodyは既存の安全化済みpreviewだけを使用
- 取得不可bodyや通信エラー文字列を推測・復元して出力しない

rendererからmain processへ渡すのは、プレビュー生成時のWorkspace ID・形式・フィルターと、保存時のpreview IDだけです。ログ本文や保存先パスをrendererから指定することはできません。保存先はElectronの保存ダイアログでユーザーが選択します。

機密判定はキー名・ヘッダー名に基づくため、意味のないキー名、URL pathへ直接埋め込まれたtoken、通常名のクエリやbody項目に含まれる個人情報等を完全には判定できません。外部共有前にプレビューと成果物を確認してください。Mobileからのファイル保存・HARインポート・rawログ出力は対象外です。

## スクリプト

- `pnpm dev`: renderer + Electron起動
- `pnpm build`: Desktop renderer / Electronビルド
- `pnpm test`: unit test（Vitest）
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
- `tests/`: 共通ドメイン・Desktop向け単体テスト

## ドキュメント

- `docs.md`: MVPアーキテクチャ設計メモ
- `docs_uiux_spec_ja.md`: UI/UX仕様（開発者向けワークスペースブラウザ）
- `docs_mvp_execution_plan_ja.md`: MVP次段階の実行計画（Issue/状態定義/PRテンプレート）
- `docs_multiplatform_strategy_ci_plan_ja.md`: マルチプラットフォーム方針とCI復旧計画（iPhone/iPad対応含む）
