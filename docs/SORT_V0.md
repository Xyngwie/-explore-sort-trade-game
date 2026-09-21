# Sort v0（Module 2 精製 — Panel de Pon / Zoo Keeper 型）

**ステータス:** 実装目標＝Panel de Pon / Puzzle League / Zoo Keeper 系。`packages/sort` はこの手触りで動く · 2026-09-21  
**目的:** SORT_V2_RULES / SORT_YIELD_V2 の契約を**触って確認**できるループ。

> **重要:** 落下・積載パネルを盤面でスワップし、同色をマッチ消去して連鎖させる。**Columns のような 3 個 1 列の落下パズルではない。** 経済・成果・ハンドオフの契約は `SORT_V2_RULES` / `SORT_YIELD_V2` を参照する。

関連: [`SORT_V2_RULES.md`](./SORT_V2_RULES.md)、[`SORT_YIELD_V2.md`](./SORT_YIELD_V2.md)、explore / trade ハンドオフ。

---

## 1. 意図する手触り（製品方針）

- パネルが盤に積まれ、タッチ操作で隣と入れ替えて同色をそろえる。
- マッチしたパネルが消え、上のパネルが落ちて次のマッチを生む。**アクティブ連鎖**（消去ウィンドウ中もスワップしてコンボ延長）が技能表現の中心。
- せり上げで袋から新しい行を下に追加する。

---

## 2. 現行実装（Panel de Pon）

| 含む | 含まない（本実装外） |
|---|---|
| explore→sort URL 受取（`salvagedContainers` / `totalStockPieces` / `isExtracted`） | 特殊ピース・タイムアタック |
| 有効ピース予算＋無効（junk）比率 0.20 | 無効比率の探索品質連動 |
| **Panel de Pon:** 積載グリッド・隣接スワップ・せり上げ | Columns 落下列 |
| 縦・横 3+ 同色消去 → 重力 → **アクティブ連鎖ウィンドウ** | 斜めマッチ |
| 手数制限（スワップ／せり上げ）・結果画面 | パズル連鎖由来の倍率本調整（Hub `craftMultiplier` 受取は §3） |
| `yield*` 集計 ＋ `YieldBag` → `buildSortToTradeUrl` | HubSave / 修理 UI（trade 側） |

---

## 3. 画面 / フロー

```text
起動
  → parseExploreToSortSearch（無ければデモ缶 2・生還）
  → 未生還 or 予算 0 → blocked
  → briefing → 精製開始
  → play: 袋から下段を初期充填
         · タップ選択→隣タップ、またはスワイプで隣接スワップ
         · 縦・横 3+ 同色（有効のみ）→ 連鎖ウィンドウ（約 0.55s）
         · ウィンドウ中もスワップ可（手数消費なし）でコンボ延長
         · せり上げで下に新行（トップアウトで終了）
         · ジャンクはマッチしない
  → result: yield* + YieldBag + importMaterials
  → 「格納庫へ渡す」= buildSortToTradeUrlFromResult（localhost 時は :5175）
```

---

## 4. 実装メモ

- 盤は **6×12**。開始時に下から数行を袋から充填（偶然マッチはスコアなしで settle）
- 操作: 隣接スワップ（上下左右）＋せり上げ。画面ボタン＋タッチ＋キー（矢印で選択隣とスワップ、`R` せり上げ）
- マッチ: **縦・横**の一直線に同種有効ピースが 3 以上。斜めは対象外。ジャンクは消えない（落下はする）
- **アクティブ連鎖:** マッチ後〜`commitClearStep` までのウィンドウ中、消去予定以外をスワップできる。追加マッチは pending に載りウィンドウが延びる。コミット後に重力→再マッチで連鎖カウント増加
- 手数: 通常スワップ／せり上げ＝1。連鎖ウィンドウ中のスワップは無料
- `craftMultiplier` 既定 1.0。explore→sort の `?craftMultiplier=` または `circuitBonuses` compact の craft があればそれを使う。パズル連鎖倍率とは別系統
- **経済ルールは SORT_V2 のまま**（コンテナ予算→有効ピース、消した種類→ yield / YieldBag）

---

## 5. 受け入れ条件

1. explore 相当のクエリで `validPieceBudget` が変わる  
2. ジャンクはマッチ／消去されず、有効ピースの縦横 3+ だけ消える  
3. 消した種類数が `yieldFood` / `yieldMaterial` / `yieldEnergy` に出る  
4. 同じ消去から `YieldBag` が付き、`buildSortToTradeUrl` が `importMaterials` と `yieldBag` を載せる  
5. 未生還・予算 0 は開始不可  
6. 隣接スワップ・せり上げ・消去後の重力／アクティブ連鎖が動く  
7. `npm run typecheck` / `npm run test` / `npm run build:sort` が通る  

---

## 6. 試し方

```bash
npm install
npm run dev:sort
```

ブラウザで例:

```text
http://localhost:5174/?salvagedContainers=2&totalStockPieces=50&isExtracted=1
```

回路 craft 倍率のテスト例:

```text
http://localhost:5174/?salvagedContainers=2&totalStockPieces=50&isExtracted=1&craftMultiplier=1.100
```

### 遊び方（スマホ向けアクティブ連鎖）

1. 「精製開始」→ 下段にパネルが積まれる  
2. **パネルをスワイプ**して隣と入れ替える（またはタップ→隣タップ）  
3. 同色が縦・横に 3 つ以上そろうと点滅（連鎖ウィンドウ）  
4. **消える前に別の場所をスワップ**して次のマッチを仕込む → 連鎖が伸びる  
5. **⬆ せり上げ**で下から新行（袋から）。最上段にパネルがあるとトップアウト  
6. ジャンクは消せない（盤を圧迫するロス）  
7. 「精製を終える」または手数切れ／トップアウト → 結果の `yield*` / YieldBag  
8. 「格納庫へ渡す」で trade（`npm run dev:trade` → :5175）にクエリが渡る  

キー: セル選択後 `←→↑↓` で隣とスワップ · `Shift+矢印` で選択移動 · `R` せり上げ。

クエリなしでもデモ缶 2 で開始可能。未生還の確認例:

```text
http://localhost:5174/?salvagedContainers=2&totalStockPieces=50&isExtracted=0
```

---

## 7. 主なファイル

| パス | 役割 |
|---|---|
| `packages/sort/src/main.ts` | UI・タッチ／連鎖タイマー・trade ハンドオフ |
| `packages/sort/src/refine.ts` | 予算・袋・スワップ／せり上げ・マッチ／アクティブ連鎖・成果 |
| `packages/sort/src/refine.selftest.ts` | ルール自己テスト |
| `packages/shared` | パーサ / `YieldBag` / URL ビルダ（既存） |
