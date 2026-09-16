# explore-sort-trade-game

Explore → sort/refine → trade/hub のモノレポです。

| パッケージ | ゲーム上の役割 | 現行プレビュー（移行期間） |
|---|---|---|
| `packages/shared` | 共通型・ハンドオフ・セーブスキーマ | — |
| `packages/explore` | Module 1 探索（WRECKLINE） | `blend-honey-branch-scarlet.grok.me` |
| `packages/sort` | Module 2 精製（Athanor） | `brush-green-zinc-crystal.grok.me` |
| `packages/trade` | Module 3 拠点（BASE HUB） | `mist-river-velvet-drum.grok.me` |

## 正本（移行期間）

- **ソース目標:** この GitHub リポジトリの `main`
- **実行プレビュー:** 各 `.grok.me`（Grok Build）
- Build で直したら再公開し、必要なら Export をリポへ同期する

運用方針: [`docs/agent_development_policy.md`](docs/agent_development_policy.md)  
制約適応版オーケストレーション: [`docs/ORCHESTRATION.md`](docs/ORCHESTRATION.md)  
Sort v2 ルール: [`docs/SORT_V2_RULES.md`](docs/SORT_V2_RULES.md)

## セットアップ

```bash
npm install
npm run typecheck
npm run dev:explore   # packages/explore 最小出撃
```


## ブランチ

`feature/<module>-<task>` / `fix/<module>-<issue>` — `main` へは PR 経由。
