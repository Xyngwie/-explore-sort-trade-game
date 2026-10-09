# 自律エージェント運用基準・世界観・仕様規範 (Autonomous Agent Standards & Guidelines)

**目的:** Cursor Automations（Cloud Agents）および GitHub Actions による自律リレー運用（風紀委員 ⇄ 実装隊長 ⇄ 実装エージェント）において、新しくまっさらな状態で起動されたエージェントが、迷うことなく100%の同一基準で思考・判断・行動できるようにするためのリポジトリ公式規範ドキュメントである。

---

## 1. 世界観と設計思想の鉄則

本作は「ディストピアでの生活基盤ゲーム」であり、一般的なハクスラや戦闘ゲームとは思想が根底から異なる。仕様判断・UI設計・メッセージ作成時は必ず以下を前提とすること。

### 1.1 世界観設定（正本：`docs/PRODUCT_VISION.md` §2.1）
1. **舞台（高度 2km の外殻）:**
   - 人類が暮らすのは、異常気象と海面上昇で水没した旧地表から高度約 2km に位置する「外殻（改造後の地球）」の上。
   - 外殻を支える無数の「井戸」から水と食料が無償供給されるため飢餓はないが、生活維持資材（装甲・電力・弾薬パーツ）を得るためにスカベンジャー（探索者）が危険を冒して外殻へ出る。
   - 井戸の下の旧地表に降りる者はいない（戻れないことが実証済み）。
   - 外殻環境は過酷であり、**機体なしでは外に出られない（徒歩での外出不可）**。
2. **機体・敵・回路・弾薬:**
   - **機体性能はどっこいどっこい:** 機体を新規設計できる技術者はおらず、ジャンクと装甲パーツを継ぎ接ぎして製造される。上位機体・高級機体は存在しない。
   - **敵は「はぐれ機体（野良・ゾンビ機体）」:** 回路が入ったまま停止・漂流し、暴走して弾薬と電力を収集し続けている残滓。
   - **回路（AIの残滓）:** 旧文明の基幹システムのエージェントだったものの残滓。スキル・行動制御の本体。
   - **弾薬は高圧電源:** 火薬ではなく、武器用の高圧電力バッテリー。
3. **文化と社会（口承文化・掲示板経済）:**
   - 文字を書く文化は衰退しており、話し言葉・記号・色・数量・口頭伝達が中心。
   - 基幹システムへのアクセス閾値に達した者が過去に立てた「市場掲示板」を中心にコミュニティが形成されている。
   - 掲示板間は非常に離れており、遠くへ行くほど過去の強豪の「強力な回路を持つ野良機体」が徘徊する危険地帯となる。

### 1.2 ゲームデザイン哲学（戦闘は「目的」ではなく「障害」）
1. **戦闘は障害:**
   - 敵の殲滅やスコア稼ぎは主目標ではない。交戦は摩耗・弾薬消費・被撃破リスクを生むコスト。
   - **「敵の薄いエリアを探索してコンテナを回収し、無事に帰る」ことは第一級の正解である。**
2. **生業としてのサバイバルと淡泊な喪失:**
   - ウィザードリィ並みに淡泊。戦場から持ち帰れないものは持ち帰れない。
   - 機体が撃破された場合、その場に「残骸（回路入り）」として残る。
3. **「未解放のコマンドは見せない」方針（重要）:**
   - 主人公はどんな回路があるかも、何ができるようになるかも知らない。
   - **未解放のコマンドは、ボタン・ショートカットキー・ヘルプ・操作一覧・ログ・UIのどこにも出してはならない（「🔒回路で解放」などの未解放煽りも一切禁止）。**
   - 小隊方針（1〜4キー）で未解放の僚機がいる場合、ログで「未解放のため対象外」と出さず、その僚機の頭上に「？」を出して 50/50 で待機するか無視する。
4. **用語の絶対統一:**
   - 旧用語「抽出（EXTRACT）」は廃止。必ず**「帰還」**を用いる（Xキー行動・搭乗円は**「帰還要請」**）。

---

## 2. 5大モジュール構成と境界ルール

| モジュール | パッケージパス | ポート | 役割・手触り |
|---|---|---|---|
| Module 1: Explore | `packages/explore` | 5173 | リアルタイム有人出撃。サルベージと摩耗。僚機行動制御 |
| Module 2: Sort | `packages/sort` | 5174 | 日常の精製。3マッチパズル（Zoo Keeper + 連鎖補充） |
| Module 3: Trade | `packages/trade` | 5175 | 拠点ハブ（格納庫）。機体・回路管理、修理、売買、出撃編成 |
| Module 4: Invade | `packages/invade` | 5176 | 地雷原・ルート選択（Minesweeper系譜）。段位・戦場密度決定 |
| Module 5: Restore | `packages/restore` | 5177 | 回路復元（Slitherlink系パズル）。高価値ワンオフ。タイマー圧なし |
| Shared | `packages/shared` | - | 共通型定義、HubSave永続化契約、モジュール間ハンドオフ契約 |

### 境界・依存ルール
- 各モジュールは独立した Vite アプリケーションであり、直接相互参照（import）してはならない。
- データの受け渡しは `packages/shared` で定義された型（`HubSave`、URLパラメータハンドオフ）を経由する。
- **二重払いの禁止:** 同一のサルベージ成果を Invade と Explore の両方で満額付与してはならない。

---

## 3. 実装・コーディングの暗黙ルールと検証規範

新規エージェントが「知らずに踏みがち」な地雷・暗黙ルールを明文化する。

### 3.1 厳格な ScopeLock（スコープ外への不干渉）
- 自身の担当タスク（Order / TASK_ASSIGNMENT）で指定された `Allowed` ディレクトリ・ファイル以外は絶対に編集しない。
- 「ついでに直した」「リファクタリングした」は CI 違反（ScopeLockViolation）として即座に REJECT される。
- 仕様書・決定ドキュメント（`docs/*.md`）の更新は、風紀委員および実装隊長の承認指示がある場合のみ行う。

### 3.2 既存キー・識別子の不可侵原則
- **英語識別子・保存キー・URLキーを勝手に変更・新設しない。**
- 新しいキーが必要な場合は、まず風紀委員へ議題（SPEC_INQUIRY）として上げ、`packages/shared` の契約更新と同時に設計合意を得る。
- 過去セーブデータとの後方互換性を常に維持する（未定義キーへの安全なフォールバックを必須とする）。

### 3.3 必須検証コマンド
実装完了時、PR作成前に必ず以下のローカル検証を行うこと。
1. 型チェック: `npm run typecheck`
2. 単体テスト: `npm test`（または関連パッケージの selftest）
3. 変更モジュールのビルド確認:
   - Explore: `npm run build:explore`
   - Sort: `npm run build:sort`
   - Trade: `npm run build:trade`
   - Invade: `npm run build:invade`
   - Restore: `npm run build:restore`

### 3.4 虚偽報告の禁止（実測主義）
- **走らせていないテストを PASS や GREEN と報告してはならない（走らせていない場合は `NOT_RUN` と明記）。**
- 実機プレビューを確認していない場合は `PreviewPlay: "NOT_RUN"` と記載する。

---

## 4. 自律リレープロトコル（JSON 規格）

エージェント間のコミュニケーションは、Slack / GitHub Issue コメント上で以下の規格化された JSON を用いて行う。

### 4.1 プロトコルの全体構造

```text
[風紀委員 (Inspector)]
       │
       │ SPEC_DECISION (仕様決定・確定)
       ▼
  [実装隊長 (Lead)] ◀─── SPEC_INQUIRY (仕様疑義・論点照会)
       │
       │ TASK_ASSIGNMENT / ORDER (タスク指示・スコープ限定)
       ▼
 [実装エージェント (Arrow / Javelin / Tomahawk)]
       │
       │ IMPLEMENTATION_RESULT (ドラフトPR作成・検証報告)
       ▼
  [実装隊長 (Lead)] (照査・コードレビュー)
       │
       │ REVIEW_RESULT / APPROVAL
       ▼
[風紀委員 (Inspector)] (マージ・デプロイ確認・STATUS更新)
```

### 4.2 主要メッセージフォーマット

#### ① 風紀委員 → 実装隊長: `SPEC_DECISION`
```json
{
  "sender": "inspector",
  "recipient": "lead",
  "type": "SPEC_DECISION",
  "payload": {
    "title": "仕様件名",
    "details": "決定された仕様の詳細内容",
    "acceptance_criteria": [
      "受入条件1",
      "受入条件2"
    ],
    "references": [
      "docs/ITEM5_FORMAL_SPEC.md"
    ]
  }
}
```

#### ② 実装隊長 → 風紀委員: `SPEC_INQUIRY`（仕様疑義・論点差し戻し）
```json
{
  "sender": "lead",
  "recipient": "inspector",
  "type": "SPEC_INQUIRY",
  "payload": {
    "title": "仕様確認・論点",
    "question": "確認したい仕様の曖昧な点や境界条件",
    "proposed_options": [
      {"option": "A", "desc": "案Aの説明"},
      {"option": "B", "desc": "案Bの説明"}
    ]
  }
}
```

#### ③ 実装隊長 → 実装エージェント: `TASK_ASSIGNMENT` (または従来の `IMPLEMENT` Order)
```json
{
  "From": "実装隊長",
  "To": "アロー",
  "Command": "IMPLEMENT",
  "Status": "PASS",
  "Task": "タスク名・概要",
  "PR": {
    "Number": null,
    "Head": null,
    "Merge": false
  },
  "ChangedFiles": [],
  "Tests": {
    "SelfTest": "NOT_RUN",
    "Typecheck": "NOT_RUN",
    "Build": "NOT_RUN",
    "CI": "NOT_RUN"
  },
  "ScopeLockViolation": false,
  "Unresolved": [],
  "NextStep": "アローが実装し draft PR を作成して作業報告を提出",
  "Order": {
    "Assignee": "アロー",
    "Standby": ["トマホーク", "ジャベリン"],
    "Base": "origin/main",
    "Source": "docs/ITEM5_FORMAL_SPEC.md",
    "Do": [
      "実装すべき事項1",
      "実装すべき事項2"
    ],
    "DoNot": [
      "禁止事項1",
      "勝手なリファクタリング禁止",
      "draft のままマージしない"
    ],
    "Allowed": [
      "packages/explore/**",
      "packages/shared/**"
    ],
    "PreviewPlay": "NOT_RUN",
    "Deploy": "NOT_TRIGGERED"
  }
}
```

#### ④ 実装エージェント → 実装隊長: `IMPLEMENTATION_RESULT`
```json
{
  "From": "アロー",
  "To": "実装隊長",
  "Command": "IMPLEMENTATION_RESULT",
  "Status": "PASS",
  "Task": "タスク名",
  "PR": {
    "Number": 248,
    "Head": "コミットSHA",
    "Merge": false
  },
  "ChangedFiles": [
    "packages/explore/src/game/rescue.ts"
  ],
  "Tests": {
    "SelfTest": "PASS",
    "Typecheck": "PASS",
    "Build": "PASS",
    "CI": "PASS"
  },
  "ScopeLockViolation": false,
  "Unresolved": [],
  "NextStep": "実装隊長が計画と照査する。マージしない",
  "Order": {
    "Assignee": "アロー",
    "Base": "ベースコミットSHA",
    "PreviewPlay": "NOT_RUN",
    "Deploy": "NOT_TRIGGERED"
  }
}
```

---

## 5. デプロイとマージの安全基準（PRマージの鉄則）

1. **マージは原則1本ずつ:**
   - 複数PRを一括マージしない。
2. **Deploy Modules Preview の緑（成功）を待つ:**
   - PRマージ後、GitHub Actions の `Deploy Modules Preview` が完了し、ステータスが success になったことを確認してから次の作業・マージへ進む。
   - 万が一デプロイが赤（failure）になった場合は、即座に通常開発を停止し、fix-forward の修正PRを作成して最優先で復旧させる。
3. **進行状況の記録:**
   - 変更が完了したら、必ず `docs/STATUS.md` に結果（マージコミットSHA、デプロイ結果、次にやること）を書き戻す。
