# @estg/sort

Module 2（Athanor）精製。**Zoo Keeper + アクティブ連鎖**: 開始時に盤が埋まり、隣接スワップでマッチ消去し、上から補充しつつ、消去ウィンドウ中のスワップでコンボを伸ばす。

- ルール: [`docs/SORT_V2_RULES.md`](../../../docs/SORT_V2_RULES.md)
- Yield: [`docs/SORT_YIELD_V2.md`](../../../docs/SORT_YIELD_V2.md)
- 試し方: [`docs/SORT_V0.md`](../../../docs/SORT_V0.md)

```bash
npm run dev:sort
# 例: http://localhost:5174/?salvagedContainers=2&totalStockPieces=50&isExtracted=1
```

操作: タップ選択→**上下左右**の隣タップ、またはスワイプでスワップ。マッチ後の連鎖ウィンドウ中もスワップ可（アクティブ連鎖）。せり上げ／トップアウトなし。
