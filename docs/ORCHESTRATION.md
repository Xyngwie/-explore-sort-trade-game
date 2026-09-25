# プロジェクト開発運用方針

**ステータス:** 現行運用方針（2026-09-26 改訂）  
**目的:** GitHub モノレポを正本として、ChatGPT/Codex と人間のレビューを組み合わせて安全に開発する。

関連:
- プロダクトの将来像: [`PRODUCT_VISION.md`](./PRODUCT_VISION.md)
- 現在の実装計画: [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)
- Explore 入出力: [`EXPLORE_IO_V2.md`](./EXPLORE_IO_V2.md)
- Explore 振る舞い: [`EXPLORE_BEHAVIOR_V0.md`](./EXPLORE_BEHAVIOR_V0.md)
- Sort: [`SORT_V2_RULES.md`](./SORT_V2_RULES.md) / [`SORT_YIELD_V2.md`](./SORT_YIELD_V2.md)
- Trade: [`TRADE_HANGAR_V0.md`](./TRADE_HANGAR_V0.md)
- Module 4/5: [`INVADE_V0.md`](./INVADE_V0.md) / [`RESTORE_V0.md`](./RESTORE_V0.md)
- ハンドオフ／セーブ: [`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md) / [`HUB_SAVE_CONTRACT.md`](./HUB_SAVE_CONTRACT.md)

---

## 1. 基本原則

### 1.1 GitHub `main` をソース正本にする

- `main` にあるコードと契約文書を現在のソース・オブ・トゥルース (SoT) とする。
- GitHub Pages は `main` から生成される確認用プレビューであり、ソース正本ではない。
- 旧 `.grok.me` プロトタイプは、残存していても正本ではない。
- 実装とドキュメントが食い違う場合、まずコードと契約文書を調査し、意図を確認したうえでドキュメントを更新する。推測で仕様を変更しない。

### 1.2 人間は「何を作るか」と「最終的に入れるか」を決める

人間（プロダクトオーナー／レビュアー）は主に次を担当する。

- 要件、優先度、やらないことを決める
- プレイ結果や PR 差分を確認する
- 仕様変更、破壊的変更、公開判断、マージを承認する

コードの細かな編集やファイル間の機械的な同期は、可能な限りエージェント側で行う。

### 1.3 ChatGPT はオーケストレーター、Codex は実装ワーカー

- **ChatGPT（参謀）:** 要求を整理し、現状調査、スコープ分割、契約への影響確認、レビュー観点の整理を行う。
- **Codex Cloud:** GitHub 上のブランチでコード／ドキュメントを編集し、テスト・ビルドを実行し、commit/PR まで行う実装経路とする。
- **人間:** PR の差分を確認し、必要なら修正を指示し、最終的にマージする。

Codex を使わない軽微な調査や設計相談は、ChatGPT の通常チャットだけで完結してよい。

---

## 2. 現在のリポジトリ構成

```text
packages/
├── shared/    # 共通型・契約・共有 UI 定数
├── explore/   # Module 1
├── sort/      # Module 2
├── trade/     # Module 3
├── invade/    # Module 4（薄い実装）
└── restore/   # Module 5（薄い実装）

docs/          # 仕様・契約・開発計画
.github/       # CI / Pages 等
README.md      # 開発者向け入口
```

モジュールの詳細な現在地と次の作業は [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) を参照する。

---

## 3. 作業フロー

標準フロー:

1. **現状確認** — main のコード、関連 docs、直近の変更を読む。
2. **目的と受入条件を明確化** — 何を変えるか／何を変えないかを決める。
3. **影響範囲を確認** — shared 型、セーブ、ハンドオフ、UI、Pages などへの影響を調べる。
4. **専用ブランチを作成** — `feature/`、`fix/`、`docs/` など。
5. **実装／ドキュメント更新** — タスクのスコープ内だけを変更する。
6. **検証** — 少なくとも関連する typecheck / test / build を実行する。
7. **commit** — 目的が分かる単位で commit する。
8. **PR** — 変更概要、検証結果、未確認事項、契約変更の有無を記載する。
9. **レビュー** — 差分と実行結果を確認し、必要なら追加修正。
10. **マージ** — 人間または承認された運用主体が最終判断する。

### 3.1 ドキュメントだけを更新する場合

コードを変更する必要がない場合でも、先に現在の実装を読んでから更新する。特に「実装済み／未実装」「正本」「次にやること」の記述は、コードと直近 PR の状態に合わせる。

### 3.2 仕様が不明な場合

- ビジョンから実装仕様を勝手に推定しない。
- 既存の V0/V2、契約文書、型、テスト、実装の順に確認する。
- 判断が必要な仕様差分は PR に明記し、マージ前に確認する。

---

## 4. ブランチと PR

基本形:

```text
feature/<module>-<task>
fix/<module>-<issue>
docs/<task>
```

`main` への直接変更は避け、PR を基本経路とする。

PR 本文には最低限次を含める:

- 何を変更したか
- なぜ変更したか
- 変更しなかった範囲
- 実行した検証コマンドと結果
- 仕様／契約／セーブへの影響
- 未確認事項、既知の制限

---

## 5. 契約変更の扱い

次の変更は通常の UI 文言修正より慎重に扱う。

- `packages/shared` の公開型・ハンドオフキー
- HubSave / セーブ形式
- Module 間の I/O
- 経済値・Yield の意味
- Pages の公開経路
- 外部 URL や origin をまたぐ連携

契約を変更する場合は、実装と同じ PR に契約文書の更新を含め、互換性と移行方法を説明する。

CTA の文言統一など、契約キーを変更しない UI コピー変更は、契約変更と混同しない。

---

## 6. 検証

リポジトリ全体の基本確認:

```bash
npm install
npm run typecheck
npm test
```

UI を変更した場合は、該当モジュールの build も確認する。

```bash
npm run build:explore
npm run build:sort
npm run build:trade
npm run build:invade
npm run build:restore
```

変更範囲に応じて必要なコマンドだけを実行してよいが、PR 本文には実行した範囲を明記する。

---

## 7. やらないこと

- 実装されていない `PRODUCT_VISION` の願望を現在仕様として実装しない。
- 契約を確認せずにモジュール境界を変更しない。
- 無関係なリファクタリングをタスクへ混ぜない。
- Pages の表示だけを見てソースを変更するのではなく、まず `packages/*` と契約文書を確認する。
- PR を作らずに `main` へ大きな変更を直接投入しない。

---

## 8. 将来の拡張

必要になった場合にのみ、次を追加する。

- CI による typecheck / test / build の自動ゲート
- Pages デプロイの自動確認
- PR テンプレート／チェックリスト
- モジュールごとの受入テスト強化

これらは現行ゲーム仕様とは別の開発基盤改善として扱う。
