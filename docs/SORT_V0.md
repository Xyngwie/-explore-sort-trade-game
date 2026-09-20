# Sort v0（Module 2 精製 — Panel de Pon / Zoo Keeper 型）

**ステータス:** Module 2 の意図は Panel de Pon / Zoo Keeper 系。現行 `packages/sort` は #47 の Columns-like provisional 実装で、置き換え可能 · 2026-09-21
**目的:** SORT_V2_RULES / SORT_YIELD_V2 の契約を**触って確認**できるループ。

> **重要:** 目指す手触りは、落下パネルを盤面で操作し、同色をマッチ消去して連鎖させるもの。**Columns のような 3 個 1 列の落下パズルではない。** 現行の 3 個落下列・回転実装は #47 の仮置きであり、製品仕様の正本ではない。経済・成果・ハンドオフの契約は `SORT_V2_RULES` / `SORT_YIELD_V2` を参照する。

関連: [`SORT_V2_RULES.md`](./SORT_V2_RULES.md)、[`SORT_YIELD_V2.md`](./SORT_YIELD_V2.md)、explore / trade ハンドオフ。

---

## 1. 意図する手触り（製品方針）

- パネルが落下し、盤面上のパネルを操作して同色をそろえる。
- マッチしたパネルが消え、上のパネルが落ちて次のマッチを生む。連鎖が気持ちよさの中心。
- 操作単位や盤面 UI はこの感触を実現する方向で決める。3 個の宝石を縦列で操作する Columns 方式を前提にしない。

## 2. 現行 provisional 実装（#47 / Columns-like）

| 含む | 含まない（本実装外） |
|---|---|
| explore→sort URL 受取（`salvagedContainers` / `totalStockPieces` / `isExtracted`） | 特殊ピース・タイムアタック |
| 有効ピース予算＋無効（junk）比率 0.20 | 無効比率の探索品質連動 |
| **Columns:** 3 個落下列の移動／回転／ドロップ | タップ連結消去（旧スタブ） |
| 縦・横・斜め 3+ 同色消去 → 重力 → 連鎖 | v1 配合 UI |
| 手数制限（配置回数）・結果画面 | パズル連鎖由来の倍率本調整（Hub `craftMultiplier` 受取は §3） |
| `yield*` 集計 ＋ `YieldBag` → `buildSortToTradeUrl` | HubSave / 修理 UI（trade 側） |

---

## 3. 画面 / フロー（現行 provisional #47）

```text
起動
  → parseExploreToSortSearch（無ければデモ缶 2・生還）
  → 未生還 or 予算 0 → blocked
  → briefing → 精製開始
  → play: 袋から 3 個列が落下 · 左右／回転／ドロップ
         · 着地後に直線 3+ 同色（有効のみ）消去 · 重力連鎖
         · ジャンクはマッチしない · 配置ごとに手数消費
  → result: yield* + YieldBag + importMaterials
  → 「格納庫へ渡す」= buildSortToTradeUrlFromResult（localhost 時は :5175）
```

---

## 4. 実装メモ（現行 provisional #47 / Columns-like）

- 盤は **6×12**。袋（予算＋ジャンク）から都度 3 個の落下列をスポーン（残り 1–2 個なら短い列）
- 操作: 左右移動・回転（下→上サイクル）・ソフト／ハードドロップ。画面ボタン＋キー＋スワイプ
- マッチ: 縦・横・斜めの一直線に同種有効ピースが 3 以上。ジャンクは線に入っても消えない
- 消去後は列内重力 → 再判定（連鎖）。1 配置＝手数 1
- `craftMultiplier` 既定 1.0。explore→sort の `?craftMultiplier=` または `circuitBonuses` compact の craft、もしくはペイロードの任意 `craftMultiplier` があればそれを使う（Hub 回路ボーナス経由）。パズル連鎖倍率とは別系統
- **経済ルールは SORT_V2 のまま**（コンテナ予算→有効ピース、消した種類→ yield / YieldBag）
- 見た目は色付きセル＋1文字ラベル。落下中セルと着地ゴーストを表示

---

## 5. 受け入れ条件（現行 provisional #47 の確認項目）

1. explore 相当のクエリで `validPieceBudget` が変わる  
2. ジャンクはマッチ／消去されず、有効ピースの直線 3+ だけ消える  
3. 消した種類数が `yieldFood` / `yieldMaterial` / `yieldEnergy` に出る  
4. 同じ消去から `YieldBag` が付き、`buildSortToTradeUrl` が `importMaterials` と `yieldBag` を載せる  
5. 未生還・予算 0 は開始不可  
6. 落下ピースの移動・回転・ドロップと、消去後の重力／連鎖が動く  
7. `npm run typecheck` / `npm run test` / `npm run build:sort` が通る  

---

## 6. 試し方（現行 provisional #47）

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

### 遊び方

1. 「精製開始」→ 中央付近に 3 個の落下列が出る  
2. **◀ ▶** で列移動、**⟳**（または盤タップ／上スワイプ）で回転、**▼** で 1 段、**⏬ 落とす** で着地  
3. 同色が縦・横・斜めに 3 つ以上そろうと消え、上のピースが落ちて連鎖することがある  
4. ジャンクは消せない（盤を圧迫するロス）  
5. 「精製を終える」または手数切れ／袋切れ／盤面トップアウト → 結果の `yield*` / YieldBag  
6. 「格納庫へ渡す」で trade（`npm run dev:trade` → :5175）にクエリが渡る  

キー: `←` `→` · `↑` / `X` 回転 · `↓` ソフト · `Space` ハード。

クエリなしでもデモ缶 2 で開始可能。未生還の確認例:

```text
http://localhost:5174/?salvagedContainers=2&totalStockPieces=50&isExtracted=0
```

---

## 7. 主なファイル

| パス | 役割 |
|---|---|
| `packages/sort/src/main.ts` | UI・操作・trade ハンドオフ |
| `packages/sort/src/refine.ts` | 予算・袋・落下列・マッチ／重力／連鎖・成果 |
| `packages/sort/src/refine.selftest.ts` | ルール自己テスト |
| `packages/shared` | パーサ / `YieldBag` / URL ビルダ（既存） |
