# Sort v2 ルール（精製 / Athanor）

**ステータス:** 採用方針（2026-09-16）。`packages/sort` の #47 実装は provisional であり、置き換え可能。
**目的:** 現行 Athanor の「先に配合を決めてからパズル」より、因果が読めるルールにする。

関連: `packages/shared` の `PlayerExpeditionState` / `CraftingPuzzleResult` / explore→sort ハンドオフ。

---

## 1. ひとことで

**コンテナ数で「有効ピース」の総量が決まり、消した種類と数だけが成果になる。無効ピースは降ってくるが消せない。**

---

## 2. 現行（v1）との違い

| | v1（現行 Build / Athanor） | v2（本仕様） |
|---|---|---|
| 開始前 | 食料・部品・電力の**配合を先に指定** | 配合フェーズなし |
| ピース | 主に消せるピース | **有効**と**無効**が混在 |
| 成果 | 配合×消し効率などが絡む | **消した色／種類のカウントが成果** |
| ロスの見え方 | 数値・倍率側に寄りがち | 盤上の無効ピースとして見える |

v1 の仕分けUI・配合プランは v2 では採用しない（結果画面の内訳表示は可）。

---

## 3. 入力（explore から）

ハンドオフ（既存）:

- `salvagedContainers`（缶数）
- `totalStockPieces`（省略時は `cans * 25`）
- `isExtracted`

プレイ条件:

- `isExtracted === true`
- `totalStockPieces > 0`（または缶数から換算して > 0）

満たさない場合は精製不可（既存どおりブロックしてよい）。

---

## 4. ピース供給

### 4.1 有効ピース総量

```text
validPieceBudget = totalStockPieces
                 = salvagedContainers * PIECES_PER_CONTAINER   # 通常
```

`PIECES_PER_CONTAINER` は shared の定数（現行 25）。

### 4.2 無効ピース

無効ピースはマッチ／消去できない。盤を圧迫するロスの可視化。

**比率（v2 仮・後で調整可）:**

```text
invalidRatio = 0.20   # 有効予算に対する追加割合（仮）
invalidPieceCount = floor(validPieceBudget * invalidRatio)
```

- 最初は**固定比率**でよい（拠点スキルや探索品質で変えるのは後続）
- 拒否や未設定時もこの既定値

### 4.3 色／種類

有効ピースは少なくとも次の3種（成果に直結）:

| ID | 表示案 | 成果フィールド |
|---|---|---|
| `food` | 食料系 | `yieldFood` |
| `material` | 部品系 | `yieldMaterial` |
| `energy` | 電力系 | `yieldEnergy` |

降下時の有効3種の内訳は、初期は**均等ランダム**（または均等＋軽いゆらぎ）。プレイヤーが事前に配合しない。

無効ピースは第4種 `junk`（マッチ不可）。

---

## 5. プレイ中

- **意図する手触り:** Panel de Pon / Zoo Keeper 系の落下パネル。盤面でパネルをそろえてマッチさせ、消去後の落下から連鎖を生む。**Columns のような 3 個 1 列の落下操作を意味しない。**
- マッチ3（または同等の消去パズル）で**有効ピースだけ**消せる
- 無効ピースは選択・マッチ対象外（移動でどかせるかは実装任せ。最初は「消せない壁／ゴミ」で可）
- 制限: 手数 or 時間のどちらか一方を v0 で固定（推奨: **手数**の方が成果との対応が明確）

> 現行 #47 の `packages/sort` はこの契約を確認するための Columns-like provisional。パズル UI／操作は将来置き換えてよいが、コンテナ予算・無効ピース・成果・ハンドオフの契約は維持する。

---

## 6. 成果（出力）

消去カウントをそのまま成果の主入力にする。

```text
yieldFood     = clearedCount.food
yieldMaterial = clearedCount.material
yieldEnergy   = clearedCount.energy
```

任意の薄い倍率（後続）:

```text
craftMultiplier = f(連鎖数, 残り手数, …)   # 1.000〜1.100 程度
```

v2 最小実装では `craftMultiplier = 1` でもよい。

Hub 回路の集計 `craftMultiplier`（trade→explore の `circuitBonuses` → explore→sort の `craftMultiplier` / `circuitBonuses`）を受け取った場合は、その値を成果倍率に使う。パズル連鎖由来の倍率とは別系統。Panel de Pon / Zoo Keeper 系の手触りは [`SORT_V0.md`](./SORT_V0.md) に記録する。**経済ルールは本仕様のまま**。

ロス:

```text
scrapLossCount = （盤に残った有効ピース数）+（無効ピース数の扱い）
```

仮: `scrapLossCount = remainingValid + invalidPieceCount` のうち、消化できなかった分。最小実装では「消えなかった有効ピース数」だけでも可。

`CraftingPuzzleResult` / `applyPuzzleResult` との互換は維持する（フィールド名は変えない）。

trade への搬入（既存）:

```text
importMaterials = floor((yieldFood + yieldMaterial + yieldEnergy) * craftMultiplier)
```

---

## 7. UI フロー（v2）

1. 受取表示（缶数・有効ピース予算・無効比率）  
2. すぐパズル開始（配合画面なし）  
3. 結果: 種類別クリア数 → yield、搬入数プレビュー、`格納庫へ渡す`

---

## 8. 受け入れ（最小実装時）

1. explore の URL クエリで予算が変わる  
2. 無効ピースが消えず、有効だけ消える  
3. 消した種類数が `yield*` に出る  
4. `buildSortToTradeUrl` / 既存ハンドオフで trade に渡せる  
5. 未生還・予算0は開始不可  

---

## 9. 明示的に後回し

- 無効比率を探索品質・拠点スキルで変える  
- 都市度ジオによる盤の補正  
- v1 配合UIの復活  
- 高度な特殊ピース  

---

## 10. Build / 実装メモ

リポの `packages/sort` は**本 v2 で新規に最小実装**する。  
現行 grok.me Athanor（v1）はプレビューとして残ってよいが、正本ルールは本ドキュメントとする。
