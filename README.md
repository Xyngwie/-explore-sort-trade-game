# explore-sort-trade-game

Explore → sort/refine → trade/hub のモノレポです。Module 4 / 5 は薄いプレイアブル・スタブ（ハンドオフ未配線）。Pages プレビューは全モジュール対応。

| パッケージ | ゲーム上の役割 | 現行プレビュー |
|---|---|---|
| `packages/shared` | 共通型・ハンドオフ・セーブスキーマ | — |
| `packages/explore` | Module 1 探索（WRECKLINE）・振る舞い垂直スライス | [Pages `/explore/`](https://xyngwie.github.io/-explore-sort-trade-game/explore/)（ローカル `dev:explore`） |
| `packages/sort` | Module 2 精製（Athanor） | [Pages `/sort/`](https://xyngwie.github.io/-explore-sort-trade-game/sort/)（ローカル `dev:sort`） |
| `packages/trade` | Module 3 拠点（BASE HUB） | [Pages ルート](https://xyngwie.github.io/-explore-sort-trade-game/)（ローカル `dev:trade`） |
| `packages/invade` | Module 4 戦線（invade / front）薄いスタブ | [Pages `/invade/`](https://xyngwie.github.io/-explore-sort-trade-game/invade/)（ローカル `dev:invade` · :5176） |
| `packages/restore` | Module 5 回路修復（restore）薄いスタブ | [Pages `/restore/`](https://xyngwie.github.io/-explore-sort-trade-game/restore/)（ローカル `dev:restore` · :5177） |

## 正本

- **ソース正本:** この GitHub リポジトリの `main`（explore / sort / trade ともモノレポ）
- **Module 1:** `packages/explore` が SoT。旧 `.grok.me` Module1 は **退役／練習用**（URL を正本にしない）
- 旧 split `.grok.me` URL は退役方向。正本プレビューは GitHub Pages（詳細は PREVIEW_HOSTING_V0）

プロダクトビジョン（願望・未実装）: [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md)  
運用方針: [`docs/agent_development_policy.md`](docs/agent_development_policy.md)  
制約適応版オーケストレーション: [`docs/ORCHESTRATION.md`](docs/ORCHESTRATION.md)  
Sort v2 ルール: [`docs/SORT_V2_RULES.md`](docs/SORT_V2_RULES.md)  
機体フリート循環: [`docs/MECH_FLEET.md`](docs/MECH_FLEET.md)  
Explore I/O v2（機体インスタンス入出力）: [`docs/EXPLORE_IO_V2.md`](docs/EXPLORE_IO_V2.md)  
Explore Behavior v0（僚機方針・発見・戦報）: [`docs/EXPLORE_BEHAVIOR_V0.md`](docs/EXPLORE_BEHAVIOR_V0.md)  
Sort Yield v2（型付き資材／パーツ成果）: [`docs/SORT_YIELD_V2.md`](docs/SORT_YIELD_V2.md)  
Trade Hangar v0（最小ハンガー）: [`docs/TRADE_HANGAR_V0.md`](docs/TRADE_HANGAR_V0.md)  
Sort v0（最小精製）: [`docs/SORT_V0.md`](docs/SORT_V0.md)
Invade / Front v0（戦線ひな型・ドラフト）: [`docs/INVADE_V0.md`](docs/INVADE_V0.md)  
Restore v0（精密回路修復・ドラフト）: [`docs/RESTORE_V0.md`](docs/RESTORE_V0.md)  
Preview Hosting v0（GitHub Pages・全モジュール）: [`docs/PREVIEW_HOSTING_V0.md`](docs/PREVIEW_HOSTING_V0.md)
Pages 用 workflow 正本（UI で `.github/workflows/` へコピー）: [`docs/ci/deploy-modules-preview.yml`](docs/ci/deploy-modules-preview.yml)

## セットアップ

```bash
npm install
npm run typecheck
npm run dev:explore   # packages/explore 最小出撃
npm run dev:sort      # packages/sort 最小精製
npm run dev:trade     # packages/trade 最小ハンガー
npm run dev:invade    # packages/invade 戦線スタブ (:5176)
npm run dev:restore   # packages/restore 回路スタブ (:5177)
```


## ブランチ

`feature/<module>-<task>` / `fix/<module>-<issue>` — `main` へは PR 経由。
