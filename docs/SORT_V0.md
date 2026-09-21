# Sort v0（Module 2 精製 — Zoo Keeper + アクティブ連鎖）

**ステータス:** 実装目標＝**Zoo Keeper + active chain**。`packages/sort` はこの手触りで動く · 2026-09-21  
**目的:** SORT_V2_RULES / SORT_YIELD_V2 の契約を**触って確認**できるループ。

> **重要:** 盤は**最初から埋まっている**。隣パネルを上下左右にスワップして同色をそろえ、消去→重力→上から補充→自然連鎖。消去ウィンドウ中もスワップできる**アクティブ連鎖**が技能の中心。  
> **Columns ではない。** クラシック Panel de Pon のような**せり上げ圧・トップアウト・タイマー**でもない。  
> 経済・成果・ハンドオフの契約は `SORT_V2_RULES` / `SORT_YIELD_V2` を参照する。

関連: [`SORT_V2_RULES.md`](./SORT_V2_RULES.md)、[`SORT_YIELD_V2.md`](./SORT_YIELD_V2.md)、explore / trade ハンドオフ。

---

## 1. 意図する手触り（製品方針）

- **Zoo Keeper:** 開始時に盤面が埋まる。隣接スワップ（4 方向）でマッチ。消えたあと上からパネルが落ちて補充。
- **アクティブ連鎖:** マッチ点滅〜消去コミットまでのウィンドウ中もスワップでき、次のマッチを仕込んでコンボを伸ばす。
- **せり上げなし / トップアウトなし**（上昇圧や上限タイマーは採用しない）。

---

## 2. 現行実装（Zoo Keeper + active chain）

| 含む | 含まない（本実装外） |
|---|---|
| explore→sort URL 受取（`salvagedContainers` / `totalStockPieces` / `isExtracted`） | 特殊ピース・タイムアタック |
| 有効ピース予算＋無効（junk）比率 0.20 | 無効比率の探索品質連動 |
| **Zoo Keeper:** 開始時フル充填・隣接スワップ・消去後の上補充 | Columns 落下列 / PdP せり上げ・トップアウト |
| 縦・横 3+ 同色消去 → 重力 → 袋から上補充 → **アクティブ連鎖ウィンドウ** | 斜めマッチ |
| 手数制限（スワップのみ）・結果画面 | パズル連鎖由来の倍率本調整（Hub `craftMultiplier` 受取は §3） |
| `yield*` 集計 ＋ `YieldBag` → `buildSortToTradeUrl` | HubSave / 修理 UI（trade 側） |

---

## 3. 画面 / フロー

```text
起動
  → parseExploreToSortSearch（無ければデモ缶 2・生還）
  → 未生還 or 予算 0 → blocked
  → briefing → 精製開始
  → play: 袋から盤を初期充填（ほぼ／全部埋まる）
         · タップ選択→上下左右の隣タップ、またはスワイプで隣接スワップ
         · 縦・横 3+ 同色（有効のみ）→ 連鎖ウィンドウ（約 0.55s）
         · ウィンドウ中もスワップ可（手数消費なし）でコンボ延長
         · コミット後: 消去 → 重力 → 袋から上補充 → 再マッチで自然連鎖
         · ジャンクはマッチしない（重力では落ちる）
  → result: yield* + YieldBag + importMaterials
  → 「格納庫へ渡す」= buildSortToTradeUrlFromResult（localhost 時は :5175）
```

---

## 4. 実装メモ

- 盤は **6×12**。開始時に袋から可能な限り充填（偶然マッチはスコアなしで settle＋補充）
- 操作: 隣接スワップ（**上下左右**）のみ。画面はタッチ／タップ＋キー（矢印で選択隣とスワップ）
- マッチ: **縦・横**の一直線に同種有効ピースが 3 以上。斜めは対象外。ジャンクは消えない（落下はする）
- **アクティブ連鎖:** マッチ後〜`commitClearStep` までのウィンドウ中、消去予定以外をスワップできる。追加マッチは pending に載りウィンドウが延びる。コミット後に重力→上補充→再マッチで連鎖カウント増加
- 手数: 通常スワップ＝1。連鎖ウィンドウ中のスワップは無料。せり上げ操作は無い
- `craftMultiplier` 既定 1.0。explore→sort の `?craftMultiplier=` または `circuitBonuses` compact の craft があればそれを使う
- **経済ルールは SORT_V2 のまま**（コンテナ予算→有効ピース、消した種類→ yield / YieldBag）

---

## 5. 受け入れ条件

1. explore 相当のクエリで `validPieceBudget` が変わる  
2. ジャンクはマッチ／消去されず、有効ピースの縦横 3+ だけ消える  
3. 消した種類数が `yieldFood` / `yieldMaterial` / `yieldEnergy` に出る  
4. 同じ消去から `YieldBag` が付き、`buildSortToTradeUrl` が `importMaterials` と `yieldBag` を載せる  
5. 未生還・予算 0 は開始不可  
6. 開始時に盤が埋まる・隣接スワップ（上下左右）・消去後の重力／上補充／アクティブ連鎖が動く。せり上げ・トップアウトは無い  
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

1. 「精製開始」→ **盤面が埋まった状態**で始まる  
2. **パネルをスワイプ**（左右・上下）して隣と入れ替える（またはタップ→上下左右の隣タップ）  
3. 同色が縦・横に 3 つ以上そろうと**点滅**（連鎖ウィンドウ）  
4. **消える前に別の場所をスワイプ**して次のマッチを仕込む → 連鎖が伸びる（この間は手数を消費しない）  
5. 消えたあと上から袋のパネルが落ちて補充。自然に次のマッチが続けば連鎖カウントが増える  
6. ジャンクは消せない（重力では落ちる）  
7. 「精製を終える」または手数切れ → 結果の `yield*` / YieldBag  
8. 「格納庫へ渡す」で trade（`npm run dev:trade` → :5175）にクエリが渡る  

キー: セル選択後 `←→↑↓` で隣とスワップ · `Shift+矢印` で選択移動。

クエリなしでもデモ缶 2 で開始可能。未生還の確認例:

```text
http://localhost:5174/?salvagedContainers=2&totalStockPieces=50&isExtracted=0
```

---

## 7. 主なファイル

| パス | 役割 |
|---|---|
| `packages/sort/src/main.ts` | UI・タッチ／連鎖タイマー・trade ハンドオフ |
| `packages/sort/src/refine.ts` | 予算・袋・充填／スワップ／上補充・マッチ／アクティブ連鎖・成果 |
| `packages/sort/src/refine.selftest.ts` | ルール自己テスト |
| `packages/shared` | パーサ / `YieldBag` / URL ビルダ（既存） |
