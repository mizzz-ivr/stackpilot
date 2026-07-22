# Stackpilot Inspector Mobile

iPhone / iPad向けのAPI Inspector MVPです。Expo Router + React Nativeで構成しています。

## 起動

リポジトリルートで依存関係をインストールします。

```bash
pnpm install
pnpm mobile
```

Expo GoでQRコードを読み込んで確認してください。

## 表示モード

### デモモード

`EXPO_PUBLIC_STACKPILOT_API_URL`が未設定の場合は、アプリ内のサンプル通信を表示します。

### リモートモード

以下を設定すると、Inspector APIからスナップショットを取得します。

```bash
EXPO_PUBLIC_STACKPILOT_API_URL=http://192.168.1.10:4100 pnpm mobile
```

取得先:

```text
GET {EXPO_PUBLIC_STACKPILOT_API_URL}/v1/mobile/inspector/snapshot
```

現時点ではDesktop側のHTTP APIは未実装です。接続失敗時はエラー状態を表示し、デモデータへ自動フォールバックしません。

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
- デスクトップ同等のDevTools
- リクエスト再送
- App Store / EAS Build設定
- 本番向け認証・トークン保存
