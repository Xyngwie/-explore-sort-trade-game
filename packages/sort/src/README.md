# @estg/sort

Module 2（Athanor）精製。**Zoo Keeper + アクティブ連鎖**: 開始時に盤が埋まり、隣接スワップでマッチ消去し、上から**ゆっくり**落下補充（約 500ms/行）するあいだ、着地済みパネルもスワップしてコンボを伸ばす。

- ルール: [`docs/SORT_V2_RULES.md`](../../../docs/SORT_V2_RULES.md)
- Yield: [`docs/SORT_YIELD_V2.md`](../../../docs/SORT_YIELD_V2.md)
- 試し方: [`docs/SORT_V0.md`](../../../docs/SORT_V0.md)

```bash
npm run dev:sort
# 例: http://localhost:5174/?salvagedContainers=2&totalStockPieces=50&isExtracted=1
```

操作: タップ選択→**上下左右**の隣タップ、またはスワイプでスワップ（Pointer Events + `touch-action:none`、軸優位比 1.15 でほぼ斜めも通す）。消去後の**ゆっくり落下補充中**もスワップ可（アクティブ連鎖）。**idle でマッチしないスワップは即終了**（連鎖中の仕込みは対象外）。1 行ロジック刻みは約 500ms のまま、見た目は fall-in CSS で滑らかに補間。せり上げ／トップアウトなし。有効が尽きたらオジャマだけが落ちて埋める。ローカルでは「コンテナ100でテストプレイ」で長時間セッション可。
