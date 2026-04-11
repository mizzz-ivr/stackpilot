# MVP次段階 実行計画（開発者向けデスクトップブラウザ）

## 1. 現時点の開発方針の要約
- 本プロダクトは「一般ブラウザ」ではなく、開発・検証の誤操作を減らすワークスペース型ブラウザとして設計する。
- MVPの優先順位は、機能数よりも**安全性（環境取り違え防止）**、**操作性（DevToolsへの最短導線）**、**保守性（状態と責務の分離）**。
- UIはダークテーマ中心の静かな見た目にし、縦タブ/サイドバー前提で情報密度は高く保ちつつ、常時表示は最小限に抑える。
- 実装は「仕様のIssue分解 → 状態定義固定 → Zustand基盤 → 最重要機能の縦切り」の順で進める。

## 2. MVPスコープの再整理
### MVPで必ず提供する価値
1. Workspaceごとのセッション分離（Cookie/Storage/Auth分離）
2. DevToolsを1アクションで開ける導線
3. API確認の最小一覧（`method / path / status / time`）
4. prod環境の誤操作抑止（常時バッジ + 危険操作時2段階確認）

### MVPの成立条件
- Workspace切替時に状態汚染が起きない。
- 開発者が迷わずDevToolsを開ける。
- API障害（エラー/遅延）を一覧で早期検知できる。
- prod判定時の視認性と確認ステップが統一されている。

## 3. Issue一覧

### Issue 1: AppShellの3ペイン骨組みを実装
- **目的**: 画面の基盤レイアウトを固定し、後続機能の実装面を安定化する。
- **スコープ**:
  - Left: Workspace/Tabナビ領域
  - Center: WebView表示領域（ダミー可）
  - Right/Bottom: API Panel領域（ダミー可）
- **対象外**: 実データ連携、詳細スタイリング、レスポンシブ最適化
- **受け入れ条件（DoD）**:
  1. 3ペインが常時描画される。
  2. 各ペインに責務ラベル（仮）が表示される。
  3. レイアウト比率を定数で管理できる。
  4. 既存画面遷移を壊さない。
- **想定ブランチ名**: `feature/app-shell-layout`

### Issue 2: Workspace状態モデルを固定し切替フローを実装
- **目的**: セッション分離の中核となるWorkspace状態遷移を先に確定する。
- **スコープ**:
  - `none / active / switching` の状態定義
  - 切替開始/完了アクション
  - switching中UI（ローディングまたは入力抑止）
- **対象外**: 永続化詳細最適化、履歴復元の高度化
- **受け入れ条件（DoD）**:
  1. Workspace状態型が定義される。
  2. switching中に二重切替が抑止される。
  3. 切替完了でactiveが一意に決まる。
  4. 切替失敗時のフォールバック（active維持）がある。
  5. 主要遷移にテストがある。
- **想定ブランチ名**: `feature/workspace-session-switch`

### Issue 3: Tabs最小状態と縦タブ表示を実装
- **目的**: 開発作業の主導線となるタブ状態を最小で成立させる。
- **スコープ**:
  - `active / pinned / loading` 状態
  - 縦タブリスト描画
  - active切替とloading表示
- **対象外**: タブグループ、ドラッグ並び替え、検索
- **受け入れ条件（DoD）**:
  1. タブ状態型が定義される。
  2. activeタブが視覚的に判別できる。
  3. pinnedが通常タブと区別表示される。
  4. loading中インジケータが出る。
- **想定ブランチ名**: `feature/vertical-tabs-minimum`

### Issue 4: API Panel最小一覧を実装
- **目的**: API障害を早く見つける最小観測面を提供する。
- **スコープ**:
  - API状態 `idle / receiving / error`
  - 一覧項目 `method / path / status / time`
  - 最新順表示
- **対象外**: ボディ表示、再送、HAR出力
- **受け入れ条件（DoD）**:
  1. API状態型が定義される。
  2. receiving時に新規ログが流れる。
  3. error時に視認可能な強調がある。
  4. 一覧の空状態メッセージがある。
  5. 表示項目が固定4項目で揺れない。
- **想定ブランチ名**: `feature/api-panel-list`

### Issue 5: prod安全UX（常時バッジ + 2段階ダイアログ）
- **目的**: 本番環境の誤操作をUIで予防する。
- **スコープ**:
  - Env状態 `local / dev / stg / prod / custom`
  - prod時の常時バッジ
  - 危険操作時の2段階確認ダイアログ
- **対象外**: 権限管理、監査ログ基盤
- **受け入れ条件（DoD）**:
  1. env型が定義される。
  2. prod時に常時バッジが表示される。
  3. 危険操作で確認ダイアログが2段階で出る。
  4. 非prodで過剰警告が出ない。
  5. ダイアログキャンセル時に操作は実行されない。
- **想定ブランチ名**: `feature/prod-warning-ui`

### Issue 6: Settings最小導線を実装
- **目的**: Workspace/Env/API表示の基本設定を変更可能にする。
- **スコープ**:
  - Settings画面の導線
  - 表示設定（例: API Panel表示ON/OFF）
  - 設定保存の骨組み
- **対象外**: 高度設定、インポート/エクスポート
- **受け入れ条件（DoD）**:
  1. Settings遷移が可能。
  2. 最低1つの設定値が保存・復元できる。
  3. 設定変更が再起動後も維持される。
  4. デフォルト値が明示される。
- **想定ブランチ名**: `feature/settings-minimum`

### Issue 7: Onboarding最小導入（初回のみ）
- **目的**: 初見ユーザーがWorkspaceとEnv安全運用を理解できる状態にする。
- **スコープ**:
  - 初回起動フロー
  - Workspace概念の説明
  - prod警告仕様の説明
- **対象外**: ツアー高度化、多言語化
- **受け入れ条件（DoD）**:
  1. 初回のみ表示される。
  2. スキップと完了が選べる。
  3. 完了後に再表示されない（設定で再表示は将来）。
  4. 説明文が3画面以内で完結する。
- **想定ブランチ名**: `feature/onboarding-minimum`

## 4. 状態定義

### 型定義案（TypeScript）
```ts
export type WorkspaceStatus = 'none' | 'active' | 'switching';
export type TabStatus = 'active' | 'pinned' | 'loading';
export type EnvType = 'local' | 'dev' | 'stg' | 'prod' | 'custom';
export type ApiStatus = 'idle' | 'receiving' | 'error';

export type WorkspaceState = {
  status: WorkspaceStatus;
  activeWorkspaceId: string | null;
  pendingWorkspaceId: string | null;
};

export type TabItem = {
  id: string;
  workspaceId: string;
  title: string;
  url: string;
  status: TabStatus;
};

export type EnvState = {
  current: EnvType;
  customLabel?: string;
};

export type ApiLogItem = {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  occurredAt: string;
};

export type ApiState = {
  status: ApiStatus;
  logs: ApiLogItem[];
  lastError?: string;
};
```

### 状態遷移の注意点
- Workspace: `switching`中に再度`switchWorkspace`を受けたらrejectし、二重切替を防ぐ。
- Tab: `loading`は副次状態に見えるが、MVPは単純化のため排他状態で扱う。
- Env: `custom`は`customLabel`未設定を許容しない（表示崩れ防止）。
- API: `error`はグローバル障害状態ではなく、最新イベントに基づく短期状態として扱う。

## 5. Zustand slice 設計

### workspaceSlice
- **責務**: Workspace一覧・active/switching管理・切替制御
- **state**:
  - `workspaces: Workspace[]`
  - `workspaceState: WorkspaceState`
- **actions**:
  - `createWorkspace(name)`
  - `switchWorkspace(id)`
  - `finishSwitchWorkspace(id)`
  - `removeWorkspace(id)`
- **selector方針**:
  - `selectActiveWorkspace`
  - `selectIsWorkspaceSwitching`

### tabSlice
- **責務**: タブ集合管理、active/pinned/loading更新
- **state**:
  - `tabsByWorkspace: Record<string, TabItem[]>`
  - `activeTabIdByWorkspace: Record<string, string | null>`
- **actions**:
  - `openTab(workspaceId, payload)`
  - `setActiveTab(workspaceId, tabId)`
  - `setTabStatus(workspaceId, tabId, status)`
  - `pinTab(workspaceId, tabId, pinned)`
  - `closeTab(workspaceId, tabId)`
- **selector方針**:
  - `selectTabsInActiveWorkspace`
  - `selectActiveTab`

### uiSlice
- **責務**: AppShell表示制御・モーダル・compact modeフラグ
- **state**:
  - `isCompactMode: boolean`
  - `isApiPanelOpen: boolean`
  - `dangerDialogStep: 0 | 1 | 2`
- **actions**:
  - `toggleCompactMode()`
  - `setApiPanelOpen(isOpen)`
  - `openDangerDialog()`
  - `nextDangerDialogStep()`
  - `closeDangerDialog()`
- **selector方針**:
  - `selectPaneLayout`
  - `selectIsDangerDialogOpen`

### apiSlice
- **責務**: APIログ受信と表示状態制御
- **state**:
  - `apiState: ApiState`
- **actions**:
  - `startReceiving()`
  - `appendApiLog(item)`
  - `setApiError(message)`
  - `clearApiLogs()`
- **selector方針**:
  - `selectLatestApiLogs(limit)`
  - `selectApiHealth`（error率や最新statusCodeから算出）

## 6. AppShellの設計

### 3ペイン構成
1. **Left Pane（Navigation）**
   - Workspace一覧
   - 縦タブ
   - 環境バッジ（常時見える）
2. **Center Pane（Browser Surface）**
   - WebViewコンテナ
   - DevTools起動ボタン
   - 空状態表示
3. **Right/Bottom Pane（API Panel）**
   - API一覧（method/path/status/time）
   - フィルタは将来拡張

### 各ペインの責務分離
- 「操作（Left）」と「実行（Center）」と「観測（API Panel）」を明確に分離し、誤操作時の認知負荷を下げる。

### compact modeに対応しやすい構造
- レイアウト定義を`layoutPreset`としてオブジェクト化。
- `default / compact`でペイン幅と表示要素を切替。
- CSSではなくstate駆動で表示/非表示を管理して、将来の設定保存に備える。

## 7. 直近1週間の実装計画

### Day1
- **ゴール**: Issue分解、状態定義固定、AppShell骨組み
- **完了条件**:
  - 7Issueを起票
  - 型定義ファイル作成
  - 3ペインUIが表示

### Day2
- **ゴール**: Workspace切替フロー（switching含む）
- **完了条件**:
  - switching中の二重操作防止
  - active workspace切替成功

### Day3
- **ゴール**: 環境バッジ（local/dev/stg/prod/custom）
- **完了条件**:
  - env切替反映
  - prod常時バッジ表示

### Day4
- **ゴール**: DevTools導線 + API一覧最小
- **完了条件**:
  - DevTools 1クリック起動
  - API一覧4項目表示

### Day5
- **ゴール**: prod警告2段階 + 空状態 + 見た目微調整
- **完了条件**:
  - 危険操作ダイアログ2段階
  - 空状態文言整備
  - ダークテーマの視認性調整

## 8. 最初に切るべきPR分割案
1. **PR1**: 状態定義とAppShell骨組み（ダミーデータ）
2. **PR2**: Workspace切替 + セッション分離連携
3. **PR3**: DevTools導線 + API一覧
4. **PR4**: prod安全UX + Settings最小
5. **PR5**: Onboarding最小 + 微調整

## 9. 最初のPRの想定タイトル
- **「AppShell 3ペイン骨組みと状態モデル初期定義を追加」**

## 10. 最初のPR本文
### 1. 目的
MVP開発を進めるため、画面構造と状態管理の土台を先行実装し、後続機能の実装速度と安全性を高める。

### 2. 背景
現状は機能要素が点在しており、Workspace/Tab/APIの状態遷移を一貫管理する枠組みが不足している。

### 3. 変更内容
- AppShellの3ペイン（Navigation / Browser Surface / API Panel）を追加
- MVPで固定する最小状態型（Workspace/Tab/Env/API）を追加
- Zustand sliceの骨組み（workspace/tab/ui/api）を追加
- ダミーデータで最低限の描画確認を可能化

### 4. 変更理由
先に状態とレイアウトを固定することで、Workspace切替・DevTools・API表示を縦切りで安全に実装できるため。

### 5. 影響範囲
- Rendererのトップレベルレイアウト
- フロントエンド状態管理層
- 既存IPCやMainロジックへの直接影響は最小（連携は次PR）

### 6. 確認方法
1. `pnpm install`
2. `pnpm dev`
3. 3ペインが表示されることを確認
4. ダミーWorkspace/Tab/APIが表示されることを確認

### 7. テスト内容
- 型チェック（TypeScript）
- 既存ユニットテストのリグレッション確認
- レイアウト表示の手動確認

### 8. レビューで見てほしい点
- 状態モデルの妥当性（MVPとして過不足ないか）
- slice責務分離の粒度
- 後続PRでの拡張しやすさ

### 9. 懸念点・未対応事項
- セッション分離のMain連携は次PRで実施
- APIログの実データ連携は次PRで実施
- compact modeはフラグのみ（本実装は後続）

## 11. 最初のコミットメッセージ案（5個）
1. AppShellの3ペインレイアウト骨組みを追加
2. MVP最小状態型（Workspace/Tab/Env/API）を定義
3. Zustandのworkspace/tab/ui/api slice雛形を追加
4. APIパネルのダミー一覧表示を実装
5. 開発計画ドキュメントをMVP次段階向けに更新

## 12. 最初に作るファイル一覧
- `src/types/state.ts`
- `src/store/slices/workspaceSlice.ts`
- `src/store/slices/tabSlice.ts`
- `src/store/slices/uiSlice.ts`
- `src/store/slices/apiSlice.ts`
- `src/store/createAppStore.ts`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/panes/LeftPane.tsx`
- `src/components/layout/panes/CenterPane.tsx`
- `src/components/layout/panes/ApiPane.tsx`
- `src/constants/layout.ts`

## 13. 各ファイルの責務
- `src/types/state.ts`: MVPで固定する状態型の単一ソース
- `workspaceSlice.ts`: Workspace切替と一覧管理
- `tabSlice.ts`: タブ状態（active/pinned/loading）管理
- `uiSlice.ts`: compact mode/ダイアログ等UI制御
- `apiSlice.ts`: API受信状態とログ配列管理
- `createAppStore.ts`: slice結合とStore生成
- `AppShell.tsx`: 3ペインの構造のみを担当
- `LeftPane.tsx`: Workspace/Tabナビ
- `CenterPane.tsx`: Browser Surface + DevTools導線
- `ApiPane.tsx`: API一覧
- `layout.ts`: ペイン比率やpreset定数

## 14. 実装時の注意点

### セキュリティ
- preload経由API以外でRendererからMain機能へ直接アクセスしない。
- prod警告の表示ロジックはUIだけに閉じず、危険操作トリガー側でも二重確認する。

### 状態管理
- 「表示用state」と「ドメインstate」を混ぜない。
- selector経由で参照し、コンポーネント側で直接store全体を読まない。
- switching/loadingの一時状態はタイムアウト時の後始末を定義する。

### レビューしやすさ
- 1PR 1目的を厳守し、無関係リファクタリングを混ぜない。
- 型定義変更とUI変更を同コミットに詰め込まない。
- 受け入れ条件に対応する確認手順をPRに明記する。

### 既存への影響最小化
- 既存コンポーネント置換ではなく、まずはAppShellを導入し段階移行する。
- 既存Storeがある場合は互換層または段階的移管を行う。

## 15. 今回やらないこと
- タブのドラッグ&ドロップ並び替え
- APIレスポンスボディ完全表示
- 権限管理/監査ログの本実装
- 高度なテーマカスタマイズ
- 自動更新、通知、テレメトリ
- パフォーマンス最適化の深掘り（計測基盤整備は後続）
