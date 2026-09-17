# explore-sort-trade-game

Explore → sort/refine → trade/hub のモノレポです。

| パッケージ | ゲーム上の役割 | 現行プレビュー（移行期間） |
|---|---|---|
| `packages/shared` | 共通型・ハンドオフ・セーブスキーマ | — |
| `packages/explore` | Module 1 探索（WRECKLINE）・振る舞い垂直スライス | モノレポ `dev:explore`（旧 grok.me は退役／練習用） |
| `packages/sort` | Module 2 精製（Athanor） | `brush-green-zinc-crystal.grok.me` |
| `packages/trade` | Module 3 拠点（BASE HUB） | `mist-river-velvet-drum.grok.me` |

## 正本

- **ソース正本:** この GitHub リポジトリの `main`（explore / sort / trade ともモノレポ）
- **Module 1:** `packages/explore` が SoT。旧 `.grok.me` Module1 は **退役／練習用**（URL を正本にしない）
- sort / trade の移行期プレビュー URL は下表どおり残る場合あり

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
Preview Hosting v0（Trade プレビュー配信・準備）: [`docs/PREVIEW_HOSTING_V0.md`](docs/PREVIEW_HOSTING_V0.md)

## セットアップ

```bash
npm install
npm run typecheck
npm run dev:explore   # packages/explore 最小出撃
npm run dev:sort      # packages/sort 最小精製
npm run dev:trade     # packages/trade 最小ハンガー
```


## ブランチ

`feature/<module>-<task>` / `fix/<module>-<issue>` — `main` へは PR 経由。
