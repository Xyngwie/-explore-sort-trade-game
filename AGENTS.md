# AI / Coding Agent Declaration & Autonomous Operation Protocol

## 1. 最重要：新しく起動したエージェントへ (Must Read)

このリポジトリでは、Cursor Automations（Cloud Agents）と GitHub Actions による完全自律リレー体制が敷かれています。
**作業を開始する前に、必ず以下のドキュメントを読み込んでください。**

- **自律分散エージェント運用規約・世界観・仕様基準書:** [`docs/AUTONOMOUS_OPERATION.md`](./docs/AUTONOMOUS_OPERATION.md)
- **進行状況と現在の立ち位置:** [`docs/STATUS.md`](./docs/STATUS.md)
- **世界観とゲーム哲学:** [`docs/PRODUCT_VISION.md`](./docs/PRODUCT_VISION.md)
- **共通セーブデータ契約:** [`docs/HUB_SAVE_CONTRACT.md`](./docs/HUB_SAVE_CONTRACT.md)

---

## 2. 開発体制と役割分担

- **神宮 (xyngwie):** プロダクトオーナー。世界観・要件・優先度・仕様判断の最終決定。PC を持たず、スマートフォンで実機確認する。
- **風紀委員 (Inspector / ChatGPT・Codex):** 全体の整合性・仕様決定・監査・デプロイ確認。決定仕様を `SPEC_DECISION` JSON で実装隊長へ指示。PR を監査・マージし、`DEPLOY_REPORT` を出力する。
- **実装隊長 (Lead / Orchestrator):** 現場監督。決定仕様のタスク分解、ファイル衝突の完全防止、実装エージェントへの `TASK_ASSIGNMENT` 指示。不明点は `AGENDA` で風紀委員へ差し戻す。作業報告を照査し、問題なければ本 PR 化して `PR_REPORT` を提出する。
- **実装エージェント (Worker / アロー, ジャベリン, トマホーク):** 指示された `TASK_ASSIGNMENT` に従い、許可されたファイル範囲（`Allowed`）のみを変更・テストする。draft PR を作成し、作業報告 `WORK_REPORT` を**実装隊長宛て**に提出する。

各エージェントの完成版 Instructions（指示文）は [`docs/agent_instructions/`](./docs/agent_instructions/) に配置されています。

---

## 3. 自律 JSON リレーフロー

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

---

## 4. PR に必ず残す宣言

PR 本文の冒頭に次の形式で記載する。

```text
## Agent Declaration
- Who: <agent / role>
- What: <what this PR changes>
- Why: <purpose>
- Scope: <in scope / out of scope>
- Status: <current status>
```

これにより、別のエージェントが PR を見た時点で「この変更は誰の何の意図なのか」を把握できるようにする。

---

## 5. コーディングと運用の鉄則

1. **SoT は GitHub `main`:** main のコードと契約文書を正本とする。推測で仕様を捏造しない。
2. **新キー・新識別子の無断作成禁止:** 保存キー（`HubSave`）、URL クエリ、状態識別子を勝手に増やさない。既存の仕組みを流用する。
3. **ScopeLock（境界防御）:** 指示された `Allowed` 以外のファイルには 1 バイトも触らない。
4. **テストの虚偽報告厳禁:** 走っていないテストを PASS や GREEN と書かない（`NOT_RUN` と書く）。
5. **マージは 1 本ずつ、デプロイ確認を見届ける:** `Deploy Modules Preview` の success を確認するまで完了としない。

---

## 6. Cursor Cloud specific instructions

- 依存関係はリポジトリルートで `npm ci`（Node.js 20 以上、npm workspaces）。`npm run typecheck` と `npm test` が確認コマンド。本番ビルドは `npm run build:explore` / `build:sort` / `build:trade` / `build:invade` / `build:restore`。
- Cloud Agent の `start` は次の Vite 開発サーバーを tmux セッション `estg_explore` / `estg_sort` / `estg_trade` / `estg_invade` / `estg_restore` で起動し、応答を待って終了する。既にセッションがあるときは作り直さない。
  - explore `http://localhost:5173/`
  - sort `http://localhost:5174/`
  - trade（格納庫） `http://localhost:5175/`
  - invade `http://localhost:5176/`
  - restore `http://localhost:5177/`
- ページのホストが `localhost` または `127.0.0.1` のとき、モジュール間リンクは上のポートになる（`packages/shared/src/constants.ts` の `LOCAL_DEV_MODULE_URLS`）。
- 動作確認: 格納庫で「シード読込」→ 艦隊が 3 機になる →「探索へ」→ Explore の「出撃」。
