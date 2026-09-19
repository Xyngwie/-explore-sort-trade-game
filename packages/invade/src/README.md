# @estg/invade

Module 4（invade / front）薄いプレイアブル。HQ 中心セクター格子でルート選択し、**セクター内マインスイーパ**のあと M4/M5 ハンドオフを配線。

- 仕様ドラフト: [`docs/INVADE_V0.md`](../../../docs/INVADE_V0.md)
- キー契約: [`docs/HANDOFF_M45_V0.md`](../../../docs/HANDOFF_M45_V0.md)
- 共有: `@estg/shared` の `sectorDensityAt` / `parseTradeToInvadeSearch` / `buildInvadeToTradeUrl` / `buildInvadeToExploreUrl`
- 到着: `?fromHub=1&deployableMechs=&startingAmmo=` を取込表示（配備コミットではない）
- **内盤:** 選択セクターで 8×8 マインスイーパ。HQ セル強制開放 · 空白＝探索済 · 数字＝周囲敵感知 · 地雷＝敵（→ Module 1 概念）
- 密度→敵数: `mineCount = round(3 + density * 13)`（3…16）
- ハンドオフ: `intelFlags`（`minesRemaining` / `sectorCleared` / `scoutHazard` / `sectorFlagged` / `scoutClear`）と density 微調整。**新しい URL キーなし**
- 地雷踏み: `scoutHazard`（前線マップはハードロックしない）
- 出発: セクター選択後に invade→trade / invade→explore の実リンク
- `d ≥ 10` 選択時に前線警告バナー
- **本 salvage / YieldBag は渡さない**
- 回路ボーナス（track 1）・trade/restore は触らない

```bash
npm run dev:invade
# http://localhost:5176/
# 例: http://localhost:5176/?fromHub=1&deployableMechs=2&startingAmmo=28
#
# 遊び方:
# 1. 格子でセクターをクリック（壁以外）
# 2. 内盤で開く / 右クリックまたは旗モードで旗
# 3. 「格納庫へ渡す」または「探索へ渡す」
```
