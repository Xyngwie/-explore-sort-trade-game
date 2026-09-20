# @estg/sort

Module 2（Athanor）精製。意図する手触りは **Panel de Pon / Zoo Keeper 系の落下パネル・マッチ消去・連鎖**であり、Columns の 3 個 1 列ではない。

> 現在の UI は #47 由来の Columns-like provisional 実装。意図する手触りの確定実装ではなく、置き換え可能。

- ルール: [`docs/SORT_V2_RULES.md`](../../../docs/SORT_V2_RULES.md)
- Yield: [`docs/SORT_YIELD_V2.md`](../../../docs/SORT_YIELD_V2.md)
- 試し方: [`docs/SORT_V0.md`](../../../docs/SORT_V0.md)

```bash
npm run dev:sort
# 例: http://localhost:5174/?salvagedContainers=2&totalStockPieces=50&isExtracted=1
```

操作: 左右・回転・ソフト／ハードドロップ（画面ボタン・キー・スワイプ）。
