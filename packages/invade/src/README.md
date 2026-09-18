# @estg/invade

Module 4（invade / front）薄いプレイアブル・スタブ。HQ 中心セクター格子でルート選択し、M4/M5 ハンドオフを配線。

- 仕様ドラフト: [`docs/INVADE_V0.md`](../../../docs/INVADE_V0.md)
- キー契約: [`docs/HANDOFF_M45_V0.md`](../../../docs/HANDOFF_M45_V0.md)
- 共有: `@estg/shared` の `sectorDensityAt` / `parseTradeToInvadeSearch` / `buildInvadeToTradeUrl` / `buildInvadeToExploreUrl`
- 到着: `?fromHub=1&deployableMechs=&startingAmmo=` を取込表示（配備コミットではない）
- 出発: セクター選択後に invade→trade / invade→explore の実リンク
- `d ≥ 10` 選択時に前線警告バナー
- **本 salvage / YieldBag は渡さない**（intelFlags のみ）

```bash
npm run dev:invade
# http://localhost:5176/
# 例: http://localhost:5176/?fromHub=1&deployableMechs=2&startingAmmo=28
```
