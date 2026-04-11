# stackpilot MVP 設計メモ

## 1. 要件整理
- Workspace単位で`session partition`を分離し、Cookie/Storage/Authを隔離。
- BrowserViewで各タブを描画し、URLナビゲーションとDevToolsを提供。
- APIログパネルでXHR/Fetch中心に一覧・検索・絞り込み。

## 2. 不明点と仮定
- タブ履歴の完全復元はMVPではURLのみ。
- APIレスポンス本文は`webRequest`だけでは取得制約があるため、MVPはヘッダ中心＋将来CDP拡張前提。

## 3. 推奨アーキテクチャ
- Main: Window/BrowserView/session/IPCハンドラ/永続化。
- Preload: allowlist IPC APIのみ公開。
- Renderer: React + ZustandでUI状態管理。

## 4. ディレクトリ構成
- `electron/main`: ドメイン/サービス/永続化/IPC/セキュリティ。
- `electron/preload`: renderer向け境界API。
- `src`: UIと状態管理。
- `shared`: main-preload-renderer共有型。

## 5. ドメインモデル
- `Workspace`, `TabState`, `ApiLogEntry`, `AppSnapshot`を採用。

## 6. 主要ユースケース
- Workspace CRUD。
- Workspace切替時にactive tabをpartition付きBrowserViewで表示。
- URL遷移時にタブ状態を永続化。

## 7. セキュリティ設計
- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`。
- preloadは`window.stackpilot`のみ公開。
- IPC channel allowlist固定化。

## 8. 実装順序
1) 共有型と永続化
2) Workspaceサービス
3) BrowserView管理
4) IPCとpreload
5) Renderer UI
6) テスト

## 9. PR分割案
- PR1: scaffold/設定
- PR2: main process & persistence
- PR3: renderer shell & workspace UI
- PR4: api log panel & tests

## 10-12. 初期コードひな形/設定/主要コード
- 本リポジトリ実装を参照。

## 13. テスト戦略
- Unit: partition生成・永続化復旧。
- Integration(将来): workspace切替とpartition一致。
- E2E(将来): Electron起動後の復元動作。

## 14. 既知の制約
- レスポンス本文完全取得は未対応。
- HTTPメソッド送信前警告は基盤関数のみでUI連携未完。

## 15. 今回はやらないこと
- SQLite移行。
- 自動更新実装。
- HARエクスポート。
