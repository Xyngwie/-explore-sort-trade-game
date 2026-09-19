# @estg/invade

Module 4（invade / front）薄いプレイアブル・スタブ。HQ 中心セクター格子でルート選択し、**薄掃討（Flag / Sweep）** のあと M4/M5 ハンドオフを配線。

- 仕様ドラフト: [`docs/INVADE_V0.md`](../../../docs/INVADE_V0.md)
- キー契約: [`docs/HANDOFF_M45_V0.md`](../../../docs/HANDOFF_M45_V0.md)
- 共有: `@estg/shared` の `sectorDensityAt` / `parseTradeToInvadeSearch` / `buildInvadeToTradeUrl` / `buildInvadeToExploreUrl`
- 到着: `?fromHub=1&deployableMechs=&startingAmmo=` を取込表示（配備コミットではない）
- 薄掃討: 選択セルを **旗立て** または **偵察掃討**（hazard 確率 ≈ density）。結果は `intelFlags`（`sectorFlagged` / `scoutClear` / `scoutHazard`）と軽微な density 調整のみ
- 出発: セクター選択後に invade→trade / invade→explore の実リンク
- `d ≥ 10` 選択時に前線警告バナー
- **本 salvage / YieldBag は渡さない**
- 回路ボーナス（track 1）は未実装

```bash
npm run dev:invade
# http://localhost:5176/
# 例: http://localhost:5176/?fromHub=1&deployableMechs=2&startingAmmo=28
#
# 遊び方:
# 1. 格子でセクターをクリック（壁以外）
# 2. 「旗立て」または「偵察掃討」
# 3. 「格納庫へ渡す」または「探索へ渡す」
```
