# 自律分散エージェント運用規約・世界観・仕様基準書 (AUTONOMOUS OPERATION GUIDE)

**ステータス:** 正式運用規約（2026-10-09 制定）  
**適用対象:** Cursor Automations（Cloud Agents）、GitHub Actions、各開発エージェント、および人間（プロダクトオーナー）。

---

## 1. 目的と自律リレー体制の概要

本リポジトリでは、Cursor Automations（Cloud Agents）と GitHub Actions を組み合わせ、Issue コメントや Pull Request を介して **「風紀委員 → 実装隊長 → 実装エージェント（アロー／ジャベリン／トマホーク）」** が JSON プロトコルによって自律的にバトンを繋ぎ、実装・検証・マージ・デプロイまでを自律完結させる体制を構築している。

クラウド自動化では、トリガーされるたびに**「過去の記憶を持たない、まっさらな新エージェント」**が起動する。  
本ドキュメントは、新たに起動したエージェントが作業開始前に必ず読み込み、このプロジェクト固有の**「世界観」「監査基準」「コーディングの暗黙ルール」「判断基準」**を 100% 同期するための基準書である。

---

## 2. 世界観と設計思想のコア原則（Soul & Vision）

詳細な願望全体像は [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) にあるが、開発において絶対にブレてはならない根底の思想は以下の通りである。

### 2.1 世界の基本設定
- **舞台（改造後の地球）:** 地表から高度約 2km に位置する、セラミック状に固まる菌類が形成した「外殻」の上。外殻の下の旧地表は水没し異常気象で居住不能。機体に搭乗しなければ外殻の上を移動することはできず、生身で外に出ることはできない。
- **井戸（エレベーター）:** 外殻を支える無数の「井戸」から水と食料が無尽蔵に供給される。降りても戻れないため降りる者はいない。
- **生業としてのサバイバル:** **戦闘は目的ではなく「障害」である。** 敵を殲滅することやスコア稼ぎではなく、危険を避け、資源を拾い集め、拠点で精製し、機体を直し、無事に生還することが第一級の正解である。
- **機体と上位機体の不在:** 機体は素材としての装甲パーツとジャンクから組み立てられており、新規設計する技術者はいない。性能はどっこいどっこいであり、上位機体は存在しない。
- **敵（はぐれ機体）:** 回路が入ったまま停止した機体が制御を失い、フィールドの弾薬（高圧電源）や電力を集めて徘徊しているもの。掲示板（人里）から離れるほど強力になる。
- **回路（Circuit）:** 旧文明の基幹システムのエージェント AI の残滓。スキルとして機体性能や行動を制御する。
- **市場掲示板コミュニティ:** 回路で複数機を制御する能力が閾値に達した者が、基幹システムへのアクセス権（売買市場）を開放し、コミュニティの核となった。文字文化は衰退し、口承や定型記号が中心である。

### 2.2 機体大破・残骸・資源循環の思想
- **資源を最後まで無駄にしない:** この世界では資源そのものが極めて貴重である。
- **撃破・大破時の残骸:** 機体が撃破された場合、機体は回路を装着したまま**「その場の残骸」**として戦場に残る。回路だけが戦場にポロッと落ちることはない（回路単体ドロップは廃止、機体残骸とセット）。
- **残骸の回収:** 後続の出撃において、搭乗円（または救助円）の内側にあれば大破状態のまま回路ごと回収でき、拠点（格納庫）へ戻る。
- **残存弾薬・バッテリーの保護:** 機体を失っても、残弾や電力は後続機が回収・再利用できる設計思想が貫かれている。

---

## 3. 5大モジュール構成と境界規約

リポジトリは npm workspaces によるモノレポ構成である。

```text
packages/
├── shared/    # 共通インターフェース・型定義・HubSave契約・URLハンドオフ
├── explore/   # Module 1: 探索（WRECKLINE）- リアルタイム有人出撃・サルベージ・摩耗・救助
├── sort/      # Module 2: 精製（Athanor）- Zoo Keeper風アクティブ連鎖パズル・資源精製
├── trade/     # Module 3: 拠点（BASE HUB）- 格納庫・機体管理・編成・修理・回路装備・倉庫
├── invade/    # Module 4: 前線（FRONT）- 盤面マス選択・危険度・置き去り機/残骸の印
└── restore/   # Module 5: 回路復元（PARADOX）- Slitherlink系一筆書きパズル・ワンオフ回路復元
```

### 境界防御ルール（ScopeLock）
1. 各エージェントは指示された `Allowed` に指定されたファイル／ディレクトリ以外には **1バイトも変更を加えてはならない**。
2. モジュール間連携（URLパラメータやセーブデータ構造）を変更する場合は、必ず `packages/shared` の契約（[`HUB_SAVE_CONTRACT.md`](./HUB_SAVE_CONTRACT.md)）と型定義を正本として扱う。

---

## 4. コーディングと運用の鉄則（Golden Rules）

すべてのエージェントは、以下の鉄則を遵守しなければならない。

1. **GitHub `main` を唯一のソース正本（SoT）とする:**
   - 設計メモや過去の会話よりも、現在 `main` にマージされているコードと契約文書（[`docs/ITEM5_FORMAL_SPEC.md`](./ITEM5_FORMAL_SPEC.md), [`docs/HUB_SAVE_CONTRACT.md`](./HUB_SAVE_CONTRACT.md) 等）を優先する。
   - 仕様が曖昧な場合、推測で勝手にコードを書かない。
2. **新しい識別子・保存キー・URLキーの無断作成禁止:**
   - 「英語の新しい識別子・保存キー・URLキーを勝手に増やさない」ことは最重要の規律である。
   - 既存のキー（例: 救助費用における `rescueFee` / `rescueFeeCredits` 等）を金額や数値だけ変えて流用する。
3. **テスト規律と虚偽報告の厳禁:**
   - `npm run typecheck`、`npm test`、および該当モジュールの `npm run build:<module>` は必ず実行する。
   - **実行していないテストを `PASS` や `GREEN` と報告してはならない。** 実行していないものは必ず `NOT_RUN` と表記する。
4. **マージは1本ずつ、デプロイ確認を見届ける:**
   - 複数PRを同時にマージしない。マージコミットに対する GitHub Actions `Deploy Modules Preview` の成功（緑）を確認して初めてタスク完了となる。
5. **神宮（プロダクトオーナー）の実機確認を意識する:**
   - 神宮は PC を持たず、スマートフォンで確認する。画面の文字溢れ、ボタンのタップしやすさ、日本語変換の安定性を常に考慮する。

---

## 5. JSON リレープロトコル完全仕様

エージェント間の通信は、Issue コメントまたはチャット上で、以下の標準 JSON フォーマットを用いて行われる。

### 5.1 共通エンベロープ
```json
{
  "sender": "<inspector | lead | arrow | javelin | tomahawk>",
  "recipient": "<inspector | lead | arrow | javelin | tomahawk>",
  "type": "<SPEC_DECISION | AGENDA | SPEC_UPDATE | TASK_ASSIGNMENT | WORK_REPORT | REVISION_REQUEST | PR_REPORT | DEPLOY_REPORT>",
  "payload": { ... }
}
```

### 5.2 メッセージタイプ一覧と遷移

```text
[風紀委員] ── SPEC_DECISION ──▶ [実装隊長]
    ▲                                │
    │ (AGENDA: 不明点差し戻し)        │ TASK_ASSIGNMENT
    └── SPEC_UPDATE ─────────────────┤
                                     ▼
                           [実装エージェント]
                                     │
    ┌── REVISION_REQUEST ────────────┤ (WORK_REPORT: draft PR)
    │   (修正指示)                   ▼
    └──────────────────────▶ [実装隊長] (照査)
                                     │
                             PR_REPORT (本PR化)
                                     ▼
                                 [風紀委員] (マージ＆デプロイ確認)
                                     │
                               DEPLOY_REPORT (完了)
```

#### ① `SPEC_DECISION`（風紀委員 → 実装隊長）
決定された仕様を実装隊長に渡し、タスク分解を指示する。
```json
{
  "sender": "inspector",
  "recipient": "lead",
  "type": "SPEC_DECISION",
  "payload": {
    "title": "タスク名",
    "sourceDoc": "docs/ITEM5_FORMAL_SPEC.md",
    "baseCommit": "<SHA>",
    "spec": {
      "inScope": ["実装する要件のリスト"],
      "outOfScope": ["今回実装しない要件のリスト"],
      "rules": ["厳守すべきルール（新キー作成禁止など）"]
    }
  }
}
```

#### ② `AGENDA`（実装隊長 → 風紀委員）
仕様記述に曖昧さ、未決事項、モジュール間の競合・矛盾がある場合に差し戻す。
```json
{
  "sender": "lead",
  "recipient": "inspector",
  "type": "AGENDA",
  "payload": {
    "taskTitle": "タスク名",
    "questions": [
      {
        "id": "Q1",
        "topic": "論点（例: 時間切れと搭乗円完了の重なり）",
        "options": ["案A: ...", "案B: ..."],
        "recommended": "案A",
        "reason": "..."
      }
    ]
  }
}
```

#### ③ `SPEC_UPDATE`（風紀委員 → 実装隊長）
議題に対するオーナーとの壁打ち結果を踏まえた再決定仕様。
```json
{
  "sender": "inspector",
  "recipient": "lead",
  "type": "SPEC_UPDATE",
  "payload": {
    "taskTitle": "タスク名",
    "resolution": "決定内容の記述",
    "spec": { ... }
  }
}
```

#### ④ `TASK_ASSIGNMENT`（実装隊長 → 実装エージェント）
特定の実装エージェント（アロー／ジャベリン／トマホーク）への具体的なコーディング指示。
```json
{
  "sender": "lead",
  "recipient": "arrow",
  "type": "TASK_ASSIGNMENT",
  "payload": {
    "task": "実装作業名",
    "branchName": "cursor/xxx-xxxx",
    "base": "<SHA または branch>",
    "do": [
      "具体的に実装すること"
    ],
    "doNot": [
      "やってはならないこと（新キー作成禁止、他パッケージ変更禁止など）"
    ],
    "allowed": [
      "packages/explore/**",
      "docs/STATUS.md"
    ]
  }
}
```

#### ⑤ `WORK_REPORT`（実装エージェント → 実装隊長）
実装・ローカル検証完了後、draft PR を作成して実装隊長に提出する報告。
```json
{
  "sender": "arrow",
  "recipient": "lead",
  "type": "WORK_REPORT",
  "payload": {
    "task": "実装作業名",
    "pr": {
      "number": 248,
      "url": "https://github.com/...",
      "head": "<commit SHA>",
      "isDraft": true
    },
    "changedFiles": ["packages/explore/src/..."],
    "tests": {
      "typecheck": "PASS",
      "selftest": "PASS",
      "build": "PASS",
      "ci": "PASS"
    },
    "scopeLockViolation": false,
    "unresolved": []
  }
}
```

#### ⑥ `REVISION_REQUEST`（実装隊長 → 実装エージェント）
照査で不備や仕様漏れが発見された場合の修正命令。
```json
{
  "sender": "lead",
  "recipient": "arrow",
  "type": "REVISION_REQUEST",
  "payload": {
    "task": "実装作業名",
    "prNumber": 248,
    "issues": [
      "指摘事項1: ...が満たされていない",
      "指摘事項2: Allowed 以外のファイルが変更されている"
    ],
    "fixInstructions": [
      "修正手順..."
    ]
  }
}
```

#### ⑦ `PR_REPORT`（実装隊長 → 風紀委員）
照査完了後、draft を解除（Ready for review）して風紀委員にマージを依頼する報告。
```json
{
  "sender": "lead",
  "recipient": "inspector",
  "type": "PR_REPORT",
  "payload": {
    "task": "タスク名",
    "pr": {
      "number": 248,
      "head": "<commit SHA>",
      "url": "https://github.com/..."
    },
    "changedFiles": ["..."],
    "auditResult": "PASS",
    "ciStatus": "GREEN",
    "nextStep": "風紀委員がPRをマージし、Deploy Modules Previewを確認する"
  }
}
```

#### ⑧ `DEPLOY_REPORT`（風紀委員 → 関係者）
PR マージ後の GitHub Actions デプロイ結果の確認と完了宣言。
```json
{
  "sender": "inspector",
  "recipient": "lead",
  "type": "DEPLOY_REPORT",
  "payload": {
    "task": "タスク名",
    "prNumber": 248,
    "mergeCommit": "<SHA>",
    "workflow": "Deploy Modules Preview",
    "runId": "37784707604",
    "conclusion": "success",
    "previewUrl": "https://xyngwie.github.io/-explore-sort-trade-game/explore/",
    "nextStep": "神宮がスマートフォンでプレビューを確認する"
  }
}
```

---

## 6. 各役割の照査・監査チェックリスト

### 風紀委員（Inspector）の監査基準
- [ ] PR の変更ファイルが、指示された `Allowed` の範囲内に完全に収まっているか（ScopeLock）。
- [ ] 契約文書（`HUB_SAVE_CONTRACT.md` など）にない新しい保存キーや URL パラメータが勝手に作られていないか。
- [ ] PR Build Check（CI）の build-and-test が成功（GREEN）しているか。
- [ ] 走っていないテストを PASS や GREEN と報告していないか。
- [ ] 世界観（戦闘は障害、残骸と資源の循環、機体なしでは生きられない等）と矛盾していないか。

### 実装隊長（Lead）の照査基準
- [ ] 指示書（`TASK_ASSIGNMENT`）の `do` が漏れなく実装されているか。
- [ ] `doNot`（やってはならないこと）が厳格に守られているか。
- [ ] `ScopeLockViolation: false` であるか（許可されていないファイルが触られていないか）。
- [ ] 実装エージェントが実際にローカルテスト（typecheck, selftest, build）を実行しているか。
- [ ] PR が draft 状態で作成されているか。

### 実装エージェント（Worker）の作業基準
- [ ] 指定された `base` から新しいブランチ（`cursor/<name>-<id>`）を切ったか。
- [ ] 許可されたファイル（`Allowed`）以外を一切編集していないか。
- [ ] 既存の型・関数・定数を極力流用し、勝手な拡張をしていないか。
- [ ] `npm run typecheck`、`npm test`、`npm run build:<module>` をすべてパスさせたか。
- [ ] draft PR を作成し、作業報告 JSON を **「実装隊長（lead）」** に提出したか。
