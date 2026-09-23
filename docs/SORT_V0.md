# Sort v0（Module 2 精製 — Zoo Keeper + アクティブ連鎖）

**ステータス:** 実装目標＝**Zoo Keeper + active chain**（ゆっくり落下補充中スワップ）。`packages/sort` はこの手触りで動く · 2026-09-22  
**目的:** SORT_V2_RULES / SORT_YIELD_V2 の契約を**触って確認**できるループ。

> **重要:** 盤は**最初から埋まっている**。隣パネルを上下左右にスワップして同色をそろえ、消去→重力→上から補充→自然連鎖。消去ウィンドウ中もスワップできる**アクティブ連鎖**が技能の中心。  
> **Columns ではない。** クラシック Panel de Pon のような**せり上げ圧・トップアウト・タイマー**でもない。  
> 経済・成果・ハンドオフの契約は `SORT_V2_RULES` / `SORT_YIELD_V2` を参照する。

関連: [`SORT_V2_RULES.md`](./SORT_V2_RULES.md)、[`SORT_YIELD_V2.md`](./SORT_YIELD_V2.md)、explore / trade ハンドオフ。

---

## 1. 意図する手触り（製品方針）

- **Zoo Keeper:** 開始時に盤面が埋まる。隣接スワップ（4 方向）でマッチ。消えたあと上からパネルが落ちて補充。
- **アクティブ連鎖:** 消去後の**ゆっくりした落下・上補充のあいだ**（穴が埋まりきるまえ）もスワップでき、次のマッチを仕込んでコンボを伸ばす。点滅は短い予告。
- **せり上げなし / トップアウトなし**（上昇圧や上限タイマーは採用しない）。

---

## 2. 現行実装（Zoo Keeper + active chain）

| 含む | 含まない（本実装外） |
|---|---|
| explore→sort URL 受取（`salvagedContainers` / `totalStockPieces` / `isExtracted`） | 特殊ピース・タイムアタック |
| 有効ピース予算のみで開始 → 尽きたら junk のみ補充 | 固定 invalidRatio 混入・探索品質連動 |
| **Zoo Keeper:** 開始時フル充填・隣接スワップ・消去後の上補充 | Columns 落下列 / PdP せり上げ・トップアウト |
| 縦・横 3+ 同色消去 → **ゆっくり落下＋上補充**（その間スワップ可＝**アクティブ連鎖**） | 斜めマッチ |
| 手数制限（スワップのみ）・結果画面 | パズル連鎖由来の倍率本調整（Hub `craftMultiplier` 受取は §3） |
| `yield*` 集計 ＋ `YieldBag` → `buildSortToTradeUrl` | HubSave / 修理 UI（trade 側） |

---

## 3. 画面 / フロー（単一プレイフィールド）

UI は**1 つのプレイフィールド（盤ステージ）**上でフェーズを切り替える（別画面ナビや大きな外付けパネル積み上げはしない）。

`StagePhase = blocked | briefing | playing | result`（`RefineLive.phase` の `play` → UI `playing`）。

```text
起動
  → parseExploreToSortSearch（無ければデモ缶 2・生還）
  → 未生還 or 予算 0 → blocked（同フィールド上オーバーレイ）
  → briefing（同フィールド上: 缶数・有効予算・遊び方 + 精製開始 CTA）
  → playing: 盤がフィールドを埋める
         · タップ選択→上下左右の隣タップ、またはスワイプで隣接スワップ
         · 縦・横 3+ 同色（有効のみ）→ 短い点滅（約 0.28s）→ 消去
         · その後パネルが上から**ゆっくり落下補充**（settleStepMs ≈ 500ms / 1 行）
         · **落下補充中もスワップ可**（手数消費なし）＝すでに着地した下段パネルも操作可
         · 着地パネルのスワップでマッチしたら settle を中断→点滅消去→連鎖数+1
         · 穴が埋まりきると再マッチ判定 → 自然連鎖
         · 有効袋が空になったら以降はジャンクのみ落下（マッチしない／重力では落ちる）
         · idle でマッチしないスワップ → 即終了（連鎖中の仕込みスワップは対象外）
         · HUD はフィールド縁の薄いレール（手数 / 袋 / 消去 / 連鎖）
  → result: **同じフィールド**に盤（暗転）＋中央リボン「仕分完了！」＋ CTA（格納庫へ / もう一度）＋コンパクト yield
  → 「格納庫へ」= buildSortToTradeUrlFromResult（localhost 時は :5175）
  → 「もう一度」= 同一セッション再開始（テストプレイ100なら予算維持／それ以外は現行クエリ）→ briefing（同フィールド）
```

---

## 4. 実装メモ

- 盤は **6×12**。開始時に**有効ピースのみ**の袋から可能な限り充填（偶然マッチはスコアなしで settle＋補充）。有効が尽きたあとの穴埋めはジャンク
- ローカル長時間デモ: UI の「コンテナ100でテストプレイ」（explore ハンドオフは変えない）
- 操作: 隣接スワップ（**上下左右**）のみ。画面はタッチ／タップ＋キー（矢印で選択隣とスワップ）
- マッチ: **縦・横**の一直線に同種有効ピースが 3 以上。斜めは対象外。ジャンクは消えない（落下はする）
- **アクティブ連鎖:** 消去コミット後の **settling**（ゆっくり落下・上補充）中にスワップできる（手数無料）。**すでに着地した下段パネルもロックしない** — そこで作ったマッチは settle を中断して点滅消去し、連鎖数を +1。点滅中のスワップも無料（追加マッチは pending に合流）。settle 完了後の自然再マッチも連鎖カウント増加
- タイミング定数: `clearBlinkMs`（点滅 ≈ 280ms）、`settleStepMs`（1 行落下／頂上スポーン ≈ **500ms**）。UI は各 settle ティックで 1 行分の fall-in CSS アニメ（`var(--settle-ms)`）を掛け、見た目を滑らかにする
- スワイプ判定: 移動 ≥ `swipeMinPx`（18px）。軸優位比 `swipeAxisDominanceRatio`（**1.15**）— `max(|dx|,|dy|) >= min * 1.15` なら強い軸で隣とスワップ。ほぼ斜めでも優勢軸を採用し、真の斜め（軸がほぼ等しい）のみ却下
- 手数: 通常スワップ＝1。点滅・落下補充中のスワップは無料。せり上げ操作は無い
- **終了（マッチなし）:** idle（`clearing` / `settling` のアクティブ連鎖外）でスワップしてもマッチができない場合、即 `finishRefine`（残りパネルの無限並べ替えを禁止）。落下・点滅中の非マッチ・仕込みスワップは終了しない
- `craftMultiplier` 既定 1.0。explore→sort の `?craftMultiplier=` または `circuitBonuses` compact の craft があればそれを使う
- **経済ルールは SORT_V2 のまま**（コンテナ予算→有効ピース、消した種類→ yield / YieldBag）

---

## 5. 受け入れ条件

1. explore 相当のクエリで `validPieceBudget` が変わる  
2. 開始時はジャンク混入なし。有効尽きたらジャンクのみ補充。ジャンクはマッチ／消去されず、有効ピースの縦横 3+ だけ消える  
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
3. 同色が縦・横に 3 つ以上そろうと**短く点滅**→消去  
4. 消えたあと上からパネルが**ゆっくり落ちて**穴を埋める（落下補充中）  
5. **穴が埋まりきるまえに別の場所をスワイプ**して次のマッチを仕込む → それが**アクティブ連鎖**（手数を消費しない）  
6. 補充が終わって自然に次のマッチが続けば連鎖カウントが増える  
7. 有効がなくなったらオジャマだけが落ちて埋める。ジャンクは消せない（重力では落ちる）  
8. 「精製を終える」／手数切れ／**idle でマッチしないスワップ** → **同じフィールド**にリボン結果（`yield*` コンパクト）  
9. 「格納庫へ」で trade（`npm run dev:trade` → :5175）にクエリが渡る  

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
