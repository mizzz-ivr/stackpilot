# 開発者向けワークスペース型ブラウザ UI/UX 仕様（MVP）

## 1. デザインコンセプト
**Calm Command Surface**: 静かな常設UIで集中を保ちつつ、危険操作時のみ明確に警告する。

## 2. デザイン原則
1. 環境認知最優先（常時表示）
2. DevTools/API導線は最短
3. prod操作は慎重導線（2段階）
4. 高密度だが浅い階層
5. 非重要情報は段階開示
6. 状態駆動コンポーネントで保守性確保
7. 低刺激ダークテーマ
8. 最小アニメーション

## 3. 情報設計（IA）
- App
  - Workspace Context
    - Tabs
    - WebView
    - API Panel
    - DevTools Launcher
  - Workspace Manage
  - Settings
  - Onboarding

## 4. レイアウト方針
- 左: Workspace切替 + 縦タブ
- 上: 戻る/進む/リロード/URL + 環境バッジ + DevTools
- 中央: WebView
- 右(狭幅時下): API確認パネル

## 5. 主要画面UI仕様
### メインブラウザ
- 強調: 環境バッジ、Workspace、アクティブURL、DevTools
- 非強調: API詳細本文（必要時のみ）

### Workspace 作成/編集モーダル
- 項目: name/env/baseURL/isolation/prod safety
- prod選択時は追加確認

### API確認パネル
- 一覧: method/status/path/duration/time
- 詳細: headers/body/response/error
- 4xx/5xx優先強調

### 設定画面
- Appearance / Shortcuts / Security / Data

### 初回オンボーディング
- 3ステップ（Workspace・環境安全・DevTools/API導線）

### prod警告UI
- 常時弱警告 + 危険操作時強警告（確認ダイアログ）

### 空状態
- Workspaceなし / タブなし / APIログなし の3種

## 6. 主要コンポーネント
- AppShell, Sidebar, WorkspaceSwitcher
- TabList/TabItem(Pinned)
- TopBar, UrlField, EnvBadge, DevToolsButton
- ApiPanel/ApiRequestList/ApiDetail
- WarningBanner/WarningDialog
- EmptyState, SettingsSection

## 7. コンポーネント状態
- 共通: default/hover/active/focus-visible/disabled/loading/error
- Tab: active/pinned/loading/crashed
- EnvBadge: local/dev/stg/prod/custom
- API row: pending/2xx/3xx/4xx/5xx/aborted

## 8. カラートークン方針
- semantic token中心:
  - bg.base/bg.elevated/bg.overlay
  - fg.primary/secondary/muted
  - border.subtle/strong
  - accent.info/success/warning/danger
  - env.local/dev/stg/prod/custom
- prodのみ1段強い視覚強調

## 9. タイポグラフィ方針
- UI本文: 13px基準
- 高密度一覧: 12px
- 数値/ログ: 等幅フォント併用

## 10. 余白・角丸・影・境界線
- 余白: 4/8/12/16/24
- 角丸: 6/10/14
- 境界線: 1px低コントラスト
- 影: モーダル等最小限

## 11. 環境ラベル表現
- Top Bar固定
- 色+テキスト+アイコンの3点で識別
- Workspace切替時に最優先更新

## 12. 警告UIルール
1. prod常時警戒
2. 危険操作前に強警告
3. 不可逆操作は確認テキスト
4. 対象/影響を簡潔明示

## 13. API確認パネル情報優先順位
1) 異常検知
2) 送信先とパス
3) 時刻
4) 再現情報（headers/body）
5) 本文全文

## 14. DevTools導線の設計理由
- 頻出操作を常設ボタン+ショートカットで短縮
- Workspace文脈を切らない

## 15. compact mode設計余地
- density token（comfortable/compact）で切替
- 余白・行高・アイコン・サイドバー幅を連動

## 16. アクセシビリティ方針
- WCAG AA準拠
- キーボード完結
- focus-visible明示
- 色依存回避（テキスト/形状併用）

## 17. 実装しやすい分割案
- `features/workspace`
- `features/tabs`
- `features/navigation`
- `features/api-inspector`
- `features/settings`
- `shared/ui`, `shared/theme`, `shared/state`

## 18. React + Tailwind命名方針
- コンポーネント: PascalCase
- Hook: useXxx
- Slice: xxxSlice.ts
- data属性で状態表現（例: data-env="prod"）

## 19. MVPでやる/やらない
### やる
- Workspace分離
- 環境バッジ常時表示
- 縦タブ+pinned
- DevTools即時導線
- API一覧+基本詳細
- prod警告

### やらない
- 高度な通信改変
- 派手な演出
- プラグイン機構

## 20. Figmaフレーム一覧
1. Tokens
2. Components
3. Main(default/prod/api-open)
4. Workspace Modal
5. Settings
6. Onboarding
7. Empty States
8. Interaction spec
9. Compact比較

---

## 推奨デザイン方針
- 環境認知をUI中心に据える
- 通常時は静か、危険時のみ強調
- 状態駆動で保守しやすい設計

## 避けるべき設計
- 色だけで環境判別
- prodとdev同じ操作負荷
- アニメーション過多
- MVPでの過剰機能
