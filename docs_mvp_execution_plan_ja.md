# MVP次段階 実行計画（開発者向けデスクトップブラウザ）

## 1. 現時点の開発方針の要約
- 一般向けブラウザではなく、**開発・検証・API確認・環境切替を安全に行うワークスペース型ブラウザ**として進める。
- MVPでは見た目の派手さより、**誤操作防止 / 操作ステップ最小化 / 壊れにくい実装**を優先する。
- 実装順は、**Issue分解 → 状態固定 → 土台実装 → 最重要3機能の縦切り → prod安全UX → 軽いユーザーテスト**。
- UIは静かなダークテーマで、縦タブ・サイドバー中心、必要時のみ強調する compact 方針。

## 2. MVPスコープの再整理
### MVPで必須
1. Workspace単位のセッション分離
2. DevTools即起動導線（1アクション）
3. API一覧（method/path/status/time）
4. prod誤操作抑止（常時バッジ + 危険操作2段階確認）

### MVPの完成判定
- 環境取り違えをUIで確実に気づける。
- DevToolsまでの操作が短い。
- API異常を一覧で早く検知できる。
- 日常利用で負担が少ない（視認性/情報整理/動作安定）。

## 3. Issue一覧（1機能1Issue）

### Issue 1: AppShell 3ペイン基盤を実装
- タイトル: AppShellの3ペイン骨組みを追加
- 目的: 画面構造を固定し後続開発の足場を作る
- スコープ: Left/Center/Right(Bottom)の3ペイン、ダミー表示、比率定数化
- 対象外: 実データ連携、細かいデザイン調整
- 受け入れ条件（DoD）:
  1. 3ペインが常時表示される
  2. 各ペインの責務ラベルが見える
  3. 比率が定数で管理される
  4. レイアウト崩れなく起動する
- 想定ブランチ名: `feature/app-shell-layout`

### Issue 2: Workspace状態定義と切替制御
- タイトル: Workspace状態モデルと切替フローを実装
- 目的: セッション分離の中核となる遷移を安定化
- スコープ: `none/active/switching` 定義、切替開始/完了/失敗
- 対象外: 複雑な永続化、復元最適化
- 受け入れ条件（DoD）:
  1. 状態型が定義される
  2. switching中の再切替を抑止
  3. 完了時にactiveが一意
  4. 失敗時フォールバックがある
  5. 主要遷移に単体テストがある
- 想定ブランチ名: `feature/workspace-session-switch`

### Issue 3: Tabs最小状態と縦タブ
- タイトル: タブ状態と縦タブ表示を実装
- 目的: 作業導線の中核となるタブ操作を最小成立
- スコープ: `active/pinned/loading`、縦タブ表示、active切替
- 対象外: DnD、タブ検索、グループ化
- 受け入れ条件（DoD）:
  1. タブ状態型が定義される
  2. activeタブが判別できる
  3. pinned表示が区別される
  4. loading表示が出る
- 想定ブランチ名: `feature/vertical-tabs-minimum`

### Issue 4: API Panel最小一覧
- タイトル: API一覧パネルの最小表示を実装
- 目的: API障害検知の初速を上げる
- スコープ: `idle/receiving/error`、4項目一覧、空状態
- 対象外: 詳細ボディ、再送、エクスポート
- 受け入れ条件（DoD）:
  1. API状態型が定義される
  2. receiving中にログ追加される
  3. error時に強調表示される
  4. 空状態文言がある
  5. method/path/status/timeを固定表示
- 想定ブランチ名: `feature/api-panel-list`

### Issue 5: prod安全UX
- タイトル: prod環境バッジと2段階確認ダイアログを実装
- 目的: 本番誤操作の予防
- スコープ: Env型、prod常時バッジ、危険操作2段階確認
- 対象外: RBAC、監査ログ本実装
- 受け入れ条件（DoD）:
  1. Env型が定義される
  2. prod時に常時バッジ表示
  3. 危険操作時に2段階確認が出る
  4. 非prodで過剰警告しない
  5. キャンセル時は操作中断される
- 想定ブランチ名: `feature/prod-warning-ui`

### Issue 6: Settings最小
- タイトル: Settings導線と最小設定保存を実装
- 目的: 基本設定の変更可能化
- スコープ: 設定画面導線、最低1設定の保存/復元
- 対象外: 高度設定、import/export
- 受け入れ条件（DoD）:
  1. Settingsへ遷移できる
  2. 1つ以上の設定値が保存される
  3. 再起動後に復元される
  4. デフォルト値が明示される
- 想定ブランチ名: `feature/settings-minimum`

### Issue 7: Onboarding最小
- タイトル: 初回オンボーディングを実装
- 目的: Workspaceとprod安全運用を短時間で理解させる
- スコープ: 初回のみ表示、スキップ/完了、最大3画面
- 対象外: 多言語、詳細チュートリアル
- 受け入れ条件（DoD）:
  1. 初回のみ表示
  2. スキップと完了が選べる
  3. 完了後は再表示しない
  4. 3画面以内で説明完了
- 想定ブランチ名: `feature/onboarding-minimum`

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
- Workspaceは`switching`中の再切替を受け付けない。
- Tabの`loading`はMVPでは単純化し排他状態で扱う。
- Envの`custom`は表示名未設定を許容しない。
- APIの`error`は全体停止ではなく、直近イベント由来の状態として扱う。

## 5. Zustand slice 設計
### workspaceSlice
- 責務: Workspace一覧/active/switching管理
- state: `workspaces`, `workspaceState`
- actions: `createWorkspace`, `switchWorkspace`, `finishSwitchWorkspace`, `failSwitchWorkspace`, `removeWorkspace`
- selectors: `selectActiveWorkspace`, `selectIsWorkspaceSwitching`

### tabSlice
- 責務: タブ追加・切替・固定・読み込み状態
- state: `tabsByWorkspace`, `activeTabIdByWorkspace`
- actions: `openTab`, `setActiveTab`, `setTabStatus`, `pinTab`, `closeTab`
- selectors: `selectTabsInActiveWorkspace`, `selectActiveTab`

### uiSlice
- 責務: レイアウト表示、compact、危険操作ダイアログ
- state: `isCompactMode`, `isApiPanelOpen`, `dangerDialogStep`
- actions: `toggleCompactMode`, `setApiPanelOpen`, `openDangerDialog`, `nextDangerDialogStep`, `closeDangerDialog`
- selectors: `selectPaneLayoutPreset`, `selectIsDangerDialogOpen`

### apiSlice
- 責務: APIログ受信状態と一覧管理
- state: `apiState`
- actions: `startReceiving`, `appendApiLog`, `setApiError`, `clearApiLogs`
- selectors: `selectLatestApiLogs`, `selectApiHealth`

## 6. AppShell設計
### 3ペイン構成
1. Left: Workspace一覧 + 縦タブ + 環境バッジ
2. Center: WebView領域 + DevTools起動導線 + 空状態
3. Right/Bottom: API一覧（method/path/status/time）

### 各ペインの責務
- Leftは「操作対象の選択」
- Centerは「主作業」
- API Paneは「観測と異常検知」

### compact mode対応しやすい構造
- `layoutPreset(default|compact)`をstateで管理。
- ペイン表示/幅はpreset定数で定義し、CSS直書きを減らす。
- 将来はSettingsからpreset変更・永続化可能にする。

## 7. GitHub Actions設計
### workflowの目的
- PR/push段階で、型・Lint・テスト・ビルド可否を自動検証し、壊れた変更の早期検知を行う。

### 実行タイミング
- `pull_request`
- `push`

### 実行内容（MVP最小）
1. pnpm install
2. pnpm lint
3. pnpm typecheck
4. pnpm test
5. pnpm build

### scripts前提
- `package.json`に`lint/typecheck/test/build`が定義済みであること。
- テスト未実装を避けるため、最低1つのVitestテストを常設する。

### 将来拡張案
- `main`向けにrelease候補チェック追加
- E2E workflowひな形追加
- path filterで変更箇所ごとの最適化

## 8. GitHub Actionsのyaml例（実用可能）
```yaml
name: CI

on:
  pull_request:
  push:

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js (LTS)
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build
```

## 9. package.jsonに必要なscripts例
```json
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.electron.json --noEmit",
    "test": "vitest run",
    "build": "pnpm build:renderer && pnpm build:electron"
  }
}
```

## 10. 直近1週間の実装計画
- Day1: Issue分解、状態定義固定、AppShell skeleton
- Day2: Workspace切替 + switching制御
- Day3: Envバッジ + prod常時表示
- Day4: DevTools導線 + API一覧4項目
- Day5: prod 2段階確認 + 空状態 + 視認性微調整

### 完了条件
- 各日でDoDに紐づく最小確認ができ、CIが通ること。

## 11. 最初に切るべきPR分割案
1. PR1: AppShell + 状態定義 + slice骨組み
2. PR2: Workspace切替（セッション分離）+ Envバッジ
3. PR3: DevTools導線 + API一覧
4. PR4: prod警告UX + Settings最小
5. PR5: Onboarding + 微調整

## 12. 最初のPR想定タイトル
- AppShell 3ペイン基盤と状態モデル初期定義を追加

## 13. 最初のPR本文（テンプレート）
1. 目的
- MVPの後続実装を安定させるため、UI骨組みと状態管理の土台を先行実装する。

2. 背景
- Workspace/Tab/APIの状態遷移が画面実装と疎結合になっておらず、機能追加時の破綻リスクがある。

3. 変更内容
- AppShell 3ペインを追加
- Workspace/Tab/Env/APIの最小状態型を追加
- Zustand slice（workspace/tab/ui/api）の骨組みを追加
- ダミーデータで表示確認可能な状態を作成

4. 変更理由
- 最重要3機能（環境分離/DevTools/API確認）を縦切りで安全に実装するため。

5. 影響範囲
- Rendererのレイアウト
- Store構造
- Main/IPCへの直接影響は最小（次PRで連携）

6. 確認方法
- `pnpm install`
- `pnpm dev`
- 3ペイン表示確認
- ダミーWorkspace/Tab/API表示確認

7. テスト内容
- 型チェック
- ESLint
- ユニットテスト
- ビルド確認

8. レビューで見てほしい点
- 状態型の過不足
- slice責務分離
- 後続PRでの拡張性

9. 懸念点・未対応事項
- セッション分離のMain連携は次PR
- API実データ連携は次PR
- compact modeはフラグのみ

## 14. 最初のコミットメッセージ案（日本語）
1. AppShellの3ペインレイアウト骨組みを追加
2. Workspace/Tab/Env/APIの最小状態型を定義
3. Zustandのworkspace・tab・ui・api slice雛形を追加
4. APIパネルのダミー一覧表示を実装
5. CIワークフローを追加して型・Lint・テスト・ビルドを自動化

## 15. 最初に作るファイル一覧
- `.github/workflows/ci.yml`
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

## 16. 各ファイルの責務
- `ci.yml`: PR/pushの最低限品質ゲート
- `state.ts`: MVPで固定する型定義
- 各slice: ドメイン別state/action集約
- `createAppStore.ts`: slice統合・store生成
- `AppShell.tsx`: 3ペイン骨組み
- `LeftPane.tsx`: Workspace/Tabの操作導線
- `CenterPane.tsx`: メイン作業面 + DevTools導線
- `ApiPane.tsx`: API監視一覧
- `layout.ts`: ペイン比率preset

## 17. 実装時の注意点
### セキュリティ
- Renderer→Mainはpreload経由のみ。
- prod危険操作はUI表示だけでなく、実行前ガードで二重確認。

### 状態管理
- 一時状態（switching/loading/error）の終了条件を明示。
- selector単位で購読し、過剰再描画を防ぐ。

### レビューしやすさ
- 1PR1目的、無関係変更禁止。
- DoDと確認手順をPR本文に必ず対応付ける。

### 既存影響最小化
- 既存UIを段階的に置換。
- Main/IPC連携はPRを分離して影響範囲を限定。

## 18. テスト観点
- 型: 状態型とsliceの整合性
- 単体: Workspace遷移（normal/error/retry）
- 単体: Tab active/pinned/loading遷移
- 単体: API受信時の一覧反映とerror表示
- UI: prodバッジ常時表示、危険操作2段階確認
- 回帰: DevTools導線が1アクション維持

## 19. 今回やらないこと
- タブDnD並び替え、タブ検索高度化
- APIボディ詳細表示、HAR出力
- RBAC・監査ログ本実装
- テーマ高度カスタマイズ
- 自動更新/通知/分析基盤
- E2E本実装（雛形のみ将来対応）
