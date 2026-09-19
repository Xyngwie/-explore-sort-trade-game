# @estg/invade

Module 4（invade / front）薄いプレイアブル。**前線セクター格子そのものがマインスイーパ**。HQ 起点で外側へ偵察し、M4/M5 ハンドオフを配線。

- 仕様ドラフト: [`docs/INVADE_V0.md`](../../../docs/INVADE_V0.md)
- キー契約: [`docs/HANDOFF_M45_V0.md`](../../../docs/HANDOFF_M45_V0.md)
- 共有: `@estg/shared` の `sectorDensityAt` / `parseTradeToInvadeSearch` / `buildInvadeToTradeUrl` / `buildInvadeToExploreUrl`
- 到着: `?fromHub=1&deployableMechs=&startingAmmo=` を取込表示（配備コミットではない）
- **盤:** AOI `25×25`（半辺 12 · 座標 −12…+12）。HQ `(0,0)` 強制開放 · 空白＝探索済 · 数字＝周囲敵感知 · 地雷＝敵（→ Module 1）· 壁 `d≥12`
- **密度:** `P(mine)` は Chebyshev d で上昇（近傍 ~5% → 前線 ~25%）
- ハンドオフ: `intelFlags`（`minesRemaining` / `sectorCleared` / `scoutHazard` / `sectorFlagged` / `scoutClear`）と density 微調整。**新しい URL キーなし**
- 地雷踏み: `scoutHazard`（前線マップはハードロックしない）
- 出発: ルート焦点セルで invade→trade / invade→explore の実リンク
- **本 salvage / YieldBag は渡さない**
- 回路ボーナス（track 1）・trade/restore は触らない
- ネストした「セクター内 8×8」は廃止（PR #35 アプローチを訂正）

```bash
npm run dev:invade
# http://localhost:5176/
# 例: http://localhost:5176/?fromHub=1&deployableMechs=2&startingAmmo=28
#
# 遊び方:
# 1. 前線格子でセルを開く / 右クリックまたは旗モードで旗
# 2. 開いたセルをクリックしてルート焦点
# 3. 「格納庫へ渡す」または「探索へ渡す」
```
