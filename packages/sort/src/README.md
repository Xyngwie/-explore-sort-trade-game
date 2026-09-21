# @estg/sort

Module 2（Athanor）精製。**Panel de Pon / Puzzle League / Zoo Keeper 系**の落下・積載パネルをスワップしてマッチ消去し、**アクティブ連鎖**でコンボを伸ばす。

- ルール: [`docs/SORT_V2_RULES.md`](../../../docs/SORT_V2_RULES.md)
- Yield: [`docs/SORT_YIELD_V2.md`](../../../docs/SORT_YIELD_V2.md)
- 試し方: [`docs/SORT_V0.md`](../../../docs/SORT_V0.md)

```bash
npm run dev:sort
# 例: http://localhost:5174/?salvagedContainers=2&totalStockPieces=50&isExtracted=1
```

操作: タップ選択→隣タップ、またはスワイプでスワップ。**せり上げ**で下から新列。マッチ後の連鎖ウィンドウ中もスワップ可（アクティブ連鎖）。
