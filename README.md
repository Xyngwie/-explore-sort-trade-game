# explore-sort-trade-game

`explore → sort/refine → trade/hub` を中心に、Module 4 `invade` / Module 5 `restore` までを同一リポジトリで開発するモノレポです。

## 現在地

- **GitHub `main` がソース正本 (SoT)**。旧 `.grok.me` は正本ではなく、残存する場合もプレビュー／練習用途です。
- Module 1〜3 はプレイ可能な実装を持ち、Module 4〜5 も薄いプレイアブル・スタブまで進んでいます。
- モジュール間の受け渡しは `packages/shared` の型・契約と `docs/` の契約文書を基準にします。
- UI の遷移 CTA は `packages/shared` の共通定数を基準に揃えています。2026-09-24 時点で explore / sort / trade / invade / restore の主要結果画面まで整合済みです。
- GitHub Pages に全モジュールのプレビューがあります。

| パッケージ | 役割 | プレビュー |
|---|---|---|
| `packages/shared` | 共通型・ハンドオフ・セーブスキーマ・共有 UI 契約 | — |
| `packages/explore` | Module 1 探索（WRECKLINE） | [Explore](https://xyngwie.github.io/-explore-sort-trade-game/explore/) |
| `packages/sort` | Module 2 精製（Athanor） | [Sort](https://xyngwie.github.io/-explore-sort-trade-game/sort/) |
| `packages/trade` | Module 3 拠点（BASE HUB） | [Trade / Hangar](https://xyngwie.github.io/-explore-sort-trade-game/) |
| `packages/invade` | Module 4 戦線／ルート選択スタブ | [Invade](https://xyngwie.github.io/-explore-sort-trade-game/invade/) |
| `packages/restore` | Module 5 回路修復スタブ | [Restore](https://xyngwie.github.io/-explore-sort-trade-game/restore/) |

### プレイ用プレビュー

- [Trade / Hangar](https://xyngwie.github.io/-explore-sort-trade-game/)
- [Explore](https://xyngwie.github.io/-explore-sort-trade-game/explore/)
- [Sort](https://xyngwie.github.io/-explore-sort-trade-game/sort/)
- [Invade](https://xyngwie.github.io/-explore-sort-trade-game/invade/)
- [Restore](https://xyngwie.github.io/-explore-sort-trade-game/restore/)

> **注:** これらは GitHub Pages のライブプレビューです。`main` のモジュール変更時に `Deploy Modules Preview` ワークフローがビルド・デプロイします。

## 仕様の読み方

**実装・契約を決める文書**と、**将来像を置く文書**を分けます。

1. 現在のコード (`packages/*`) が実装上の一次情報
2. `docs/*_V0.md` / `*_V2.md` / 契約文書が各機能の受入条件・境界を定義
3. [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) が現在の開発順序と未完了事項を整理
4. [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md) は願望・将来像であり、未実装事項を現在仕様として扱わない

主要ドキュメント:

- [`docs/ORCHESTRATION.md`](docs/ORCHESTRATION.md) — 開発運用、エージェント／人間の役割、Git/PR方針
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — 現在の実装状況と次の開発計画
- [`docs/EXPLORE_IO_V2.md`](docs/EXPLORE_IO_V2.md) — Explore 入出力契約
- [`docs/EXPLORE_BEHAVIOR_V0.md`](docs/EXPLORE_BEHAVIOR_V0.md) — Explore の僚機方針・発見・戦報
- [`docs/SORT_V2_RULES.md`](docs/SORT_V2_RULES.md) — Sort のルール
- [`docs/SORT_YIELD_V2.md`](docs/SORT_YIELD_V2.md) — Sort 成果物契約
- [`docs/TRADE_HANGAR_V0.md`](docs/TRADE_HANGAR_V0.md) — Trade/Hangar の最小仕様
- [`docs/INVADE_V0.md`](docs/INVADE_V0.md) — Invade / Front ドラフト仕様
- [`docs/RESTORE_V0.md`](docs/RESTORE_V0.md) — Restore ドラフト仕様
- [`docs/HANDOFF_M45_V0.md`](docs/HANDOFF_M45_V0.md) — Module 4/5 と Hub のハンドオフ契約
- [`docs/HUB_SAVE_CONTRACT.md`](docs/HUB_SAVE_CONTRACT.md) — Hub セーブ契約
- [`docs/PREVIEW_HOSTING_V0.md`](docs/PREVIEW_HOSTING_V0.md) — GitHub Pages プレビュー運用

## セットアップ

Node.js 20 以上を使用します。

```bash
npm install
npm run typecheck
npm test
```

個別モジュールの開発／ビルド:

```bash
npm run dev:explore
npm run dev:sort
npm run dev:trade
npm run dev:invade
npm run dev:restore

npm run build:explore
npm run build:sort
npm run build:trade
npm run build:invade
npm run build:restore
```

## Git / PR

`main` への直接作業ではなく、タスクごとのブランチ → commit → PR を基本とします。

```text
feature/<module>-<task>
fix/<module>-<issue>
docs/<task>
```

PR では、変更範囲・確認したコマンド・未確認事項を明記します。マージ前にコードとドキュメントの整合を確認してください。

## 開発上の原則

- 実装されていないビジョンを「現行仕様」として扱わない。
- `packages/shared` の境界をまたぐ変更は、先に契約への影響を確認する。
- 経済、セーブ、ハンドオフ URL/key などの契約変更は、UI 文言変更と混ぜずに明示する。
- まず現在の実装を読み、最小の変更で目的を達成する。大規模なリファクタリングは別タスクに分離する。
