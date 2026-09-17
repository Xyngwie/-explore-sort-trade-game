# Sort v0（Module 2 最小精製スタブ）

**ステータス:** stub 実装（`packages/sort`）· 2026-09-17  
**目的:** SORT_V2_RULES / SORT_YIELD_V2 の契約を**触って確認**できる薄いループを置く。

関連: [`SORT_V2_RULES.md`](./SORT_V2_RULES.md)、[`SORT_YIELD_V2.md`](./SORT_YIELD_V2.md)、explore / trade ハンドオフ。

---

## 1. スコープ

| 含む | 含まない（スタブ外） |
|---|---|
| explore→sort URL 受取（`salvagedContainers` / `totalStockPieces` / `isExtracted`） | 本格 match-3 エンジン・特殊ピース |
| 有効ピース予算＋無効（junk）比率 0.20 | 無効比率の探索品質連動 |
| 盤上タップで同種連結 3+ 消去（ジャンクは不可） | v1 配合 UI |
| 手数制限・結果画面 | 連鎖倍率の本調整（`craftMultiplier=1`） |
| `yield*` 集計 ＋ `YieldBag` → `buildSortToTradeUrl` | HubSave / 修理 UI（trade 側） |

---

## 2. 画面 / フロー

```text
起動
  → parseExploreToSortSearch（無ければデモ缶 2・生還）
  → 未生還 or 予算 0 → blocked
  → briefing → 精製開始
  → play: 同色 3+ タップ消去 / ジャンクは消えない / 手数消費
  → result: yield* + YieldBag + importMaterials
  → 「格納庫へ渡す」= buildSortToTradeUrlFromResult（localhost 時は :5175）
```

---

## 3. スタブしているもの

- 盤は固定 6×8＋袋からの補充（巨大予算でも手数で打ち切り）
- 消去は「連結グループ・タップ」のみ（スワイプやヒントなし）
- `craftMultiplier` 固定 1.0
- 見た目は色付きセル＋1文字ラベル

---

## 4. 受け入れ条件

1. explore 相当のクエリで `validPieceBudget` が変わる  
2. ジャンクをタップしても消えず、有効グループだけ消える  
3. 消した種類数が `yieldFood` / `yieldMaterial` / `yieldEnergy` に出る  
4. 同じ消去から `YieldBag` が付き、`buildSortToTradeUrl` が `importMaterials` と `yieldBag` を載せる  
5. 未生還・予算 0 は開始不可  
6. `npm run typecheck` / `npm run test` / `npm run build:sort` が通る  

---

## 5. 試し方

```bash
npm install
npm run dev:sort
```

ブラウザで例:

```text
http://localhost:5174/?salvagedContainers=2&totalStockPieces=50&isExtracted=1
```

1. 「精製開始」→ 同色が3つ以上つながっているセルをタップ  
2. ジャンクをタップしても消えないことを確認  
3. 「精製を終える」または手数切れ → 結果の `yield*` / YieldBag  
4. 「格納庫へ渡す」で trade（`npm run dev:trade` → :5175）にクエリが渡る  

クエリなしでもデモ缶 2 で開始可能。未生還の確認例:

```text
http://localhost:5174/?salvagedContainers=2&totalStockPieces=50&isExtracted=0
```

---

## 6. 主なファイル

| パス | 役割 |
|---|---|
| `packages/sort/src/main.ts` | UI・trade ハンドオフ |
| `packages/sort/src/refine.ts` | 予算・盤・消去・成果 |
| `packages/sort/src/refine.selftest.ts` | ルール自己テスト |
| `packages/shared` | パーサ / `YieldBag` / URL ビルダ（既存） |
