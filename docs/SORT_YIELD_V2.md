# Sort Yield — 4資源モデル

**現行仕様:** Sort の成果は次の4資源だけを扱う。

- `ammo` — 弾薬
- `armor` — 装甲パーツ
- `power` — 電力パーツ
- `junk` — ジャンク

## 1. Sortの成果

パズルで消えた有効ピースは対応する資源として `YieldBag` に入る。

```text
消去
  ↓
ammo / armor / power

盤面に最後まで残った有効色
  ↓
junk
```

`junk` はマッチ対象にならず、最後まで消えなかった赤・青・黄の残存分として扱う。

## 2. Shared契約

`packages/shared/src/sort-yield.ts` が成果資源の単一の契約層。

```ts
const RESOURCE_IDS = ["ammo", "armor", "power", "junk"];
```

`YieldBag` はこの4資源だけを保存対象とする。

- `compactYieldBag`
- `mergeYieldBags`
- `scaleYieldBag`
- `yieldBagTotal`
- `applyYieldBagToInventory`
- `spendYieldBag`

はいずれも4資源だけを処理する。

## 3. HUBへの搬入

Sort完了時のHUB搬入は `yieldBag` を正規の4資源成果として扱う。

`搬入` は直前のSortで得られた4資源の合計、`資材` はHUBに現在保存されている4資源の合計として表示する。

従来の `mat_*` / `part_*` 型付き素材体系は現行仕様では使用しない。

## 4. 旧素材体系

以下は旧仕様であり、現在の保存・売買対象ではない。

- `mat_scrap`
- `mat_polymer`
- `mat_circuit`
- `mat_ration`
- `mat_coolant`
- `part_actuator`
- `part_armor_plate`
- `part_power_cell`
- `part_sensor_array`
- `part_hydraulic_line`

また、旧仕様の「食料 / 部品 / 電力」を成果IDとして扱う設計も移行対象である。

## 5. Sort内部移行

現在のSort盤面エンジンには移行途中の内部名として、

```text
food / material / energy / junk
```

が残っている。

これは外部の成果契約とは分離されており、現在は最後に

```text
food     → ammo
material → armor
energy   → power
```

へ変換している。

**次の移行作業では、盤面エンジン自身を `ammo / armor / power / junk` に統一し、この変換層を削除する。**

この変更では、マッチ判定・重力・補充・連鎖・手数などのゲームルールを変更しない。

## 6. 受入条件

Sort内部移行完了時に、以下を確認する。

1. 盤面の4種が `ammo / armor / power / junk` だけになる。
2. 消去集計も同じ4資源名になる。
3. 旧 `food / material / energy` → 新4資源の変換関数が不要になる。
4. Sort → HUB の `YieldBag` がそのまま4資源として渡る。
5. 旧 `mat_*` / `part_*` ID が成果・在庫・売買経路に存在しない。
6. shared / sort / trade の typecheck とtestが成功する。
7. Pagesへデプロイ後、実機でSort→HUBを確認する。

## 7. 非ゴール

今回の資源整理では、以下を変更しない。

- パズルのルール
- 盤面サイズ
- 消去条件
- 連鎖ルール
- ジャンクのゲーム上の意味
- HUBの売買価格
- Invade / Restore の既存ゲームルール

目的は、**成果資源の内部表現を新4資源へ一本化すること**。
