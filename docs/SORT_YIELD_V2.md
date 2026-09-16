# Sort Yield v2（Module 2 成果の型付き再接続）

**ステータス:** 採用方針（2026-09-17）・契約型は `packages/shared`、sort / trade UI 実装は後続  
**目的:** 精製パズルの消去成果を、集計 `yieldFood` / `yieldMaterial` / `yieldEnergy` だけでなく、修理で消費できる **汎用資材 ID** と **特定パーツ ID** のバッグとしても trade に渡せるようにする。

関連: `docs/SORT_V2_RULES.md`、`docs/MECH_FLEET.md`、`docs/EXPLORE_IO_V2.md`、`packages/shared` の `sort-yield.ts` / `handoff.ts` / `expedition.ts`。

> **Module 3 メモ（本 PR では実装しない）:** 型付き修理コストでバッグを減らす UI・セーブ v3 は後続。本仕様は Module 2 の**出力契約**と shared ヘルパのみ。

---

## 1. ひとことで

**消したピース種類 → 集計 yield（互換）＋型付き `YieldBag`（資材／パーツ）。trade は当面 `importMaterials` 合算も受け、後で修理が ID 単位で消費する。**

---

## 2. 現行（集計のみ）との違い

| | 現行（v1 / Sort v2 ルール採用直後） | Yield v2（本仕様） |
|---|---|---|
| パズル成果 | `yieldFood` / `yieldMaterial` / `yieldEnergy` | **同じ集計を維持** ＋ `yieldBag` |
| trade 搬入 | `importMaterials = floor(合算 * craftMultiplier)` | **同式を維持**（後方互換） |
| 修理との接続 | hub の単一 `materials` 数値 | **汎用資材・特定パーツ ID** が修理コストの消費対象（後続） |
| URL ハンドオフ | `?importMaterials=&craftMultiplier=` | **加算** `yieldBag=id:n;…`（省略可） |

`docs/SORT_V2_RULES.md` のプレイルール（コンテナ予算 → 有効ピース、無効は消せない、消した種類が成果）は**変更しない**。本仕様はその成果の**語彙を広げる**だけ。

---

## 3. ピース種類 → 成果マッピング

### 3.1 有効ピース（Sort v2 どおり）

| ピース ID | 表示案 | 集計フィールド | 型付き成果の主行き先 |
|---|---|---|---|
| `food` | 食料系 | `yieldFood` | 汎用資材 `mat_ration` |
| `material` | 部品系 | `yieldMaterial` | 汎用資材 `mat_scrap` / `mat_polymer` ＋ 特定パーツ |
| `energy` | 電力系 | `yieldEnergy` | 汎用資材 `mat_circuit` / `mat_coolant` ＋ 特定パーツ |
| `junk` | 無効 | （成果なし） | なし |

```text
yieldFood     = clearedCount.food
yieldMaterial = clearedCount.material
yieldEnergy   = clearedCount.energy
```

### 3.2 仮変換ルール（`SORT_YIELD_RULES` / `yieldBagFromClearedCounts`）

1 消去あたり（その後 `craftMultiplier` をバッグ全体に薄い床関数で掛ける）:

| 消去元 | 汎用資材 | 特定パーツ（整数割当・仮） |
|---|---|---|
| `food` × N | `mat_ration` += N | — |
| `material` × N | `mat_scrap` += floor(N×0.6)、`mat_polymer` += floor(N×0.4) | `part_actuator` += floor(N/10)、`part_armor_plate` += floor(N/15)、`part_hydraulic_line` += floor(N/20) |
| `energy` × N | `mat_circuit` += floor(N×0.5)、`mat_coolant` += floor(N×0.5) | `part_power_cell` += floor(N/12)、`part_sensor_array` += floor(N/18) |

- `craftMultiplier` は集計 `importMaterials` と同じくバッグ各エントリへ適用（`floor(count * m)`、0 以下は落とす）。
- 比率・閾値はすべて仮。バランス調整は定数だけ触る。

---

## 4. 仮 ID カタログ

### 4.1 汎用資材（basic materials）

| ID | 日本語案 | 想定用途 |
|---|---|---|
| `mat_scrap` | スクラップ鋼 | 汎用修理・売却 |
| `mat_polymer` | ポリマー | 汎用修理・売却 |
| `mat_circuit` | 回路素体 | 電装系修理・売却 |
| `mat_ration` | 糧食パック | 拠点消費／売却（修理以外も可） |
| `mat_coolant` | 冷却剤 | 熱・電装まわり |

### 4.2 特定パーツ（specific parts）

| ID | 日本語案 | 想定用途 |
|---|---|---|
| `part_actuator` | アクチュエータ | 駆動系修理 |
| `part_armor_plate` | 装甲板 | 装甲修理 |
| `part_power_cell` | 電力セル | 電源修理 |
| `part_sensor_array` | センサーアレイ | センサー修理 |
| `part_hydraulic_line` | 油圧ライン | 油圧／関節修理 |

件数: 汎用資材 **5**、特定パーツ **5**（いずれも仮・増減可）。  
型: `BasicMaterialId` / `PartId` / `YieldItemId`（共用体）。バッグ: `YieldBag`（`Partial<Record<YieldItemId, number>>`）。

---

## 5. 互換レイヤ

### 5.1 `CraftingPuzzleResult`

既存フィールドは破壊しない。任意で加算:

```ts
type CraftingPuzzleResult = {
  yieldFood: number;
  yieldMaterial: number;
  yieldEnergy: number;
  scrapLossCount: number;
  craftMultiplier: number;
  // …既存 optional…
  /** Yield v2: typed bag (省略時は cleared 集計から後で再計算してよい) */
  yieldBag?: YieldBag;
};
```

`applyPuzzleResult` は集計フィールドのみ書く現状を維持してよい。バッグは sort 実装側で `yieldBagFromClearedCounts` し、ハンドオフ／結果オブジェクトに載せる。

### 5.2 `importMaterials` / 集計ウォレット

```text
importMaterials = floor((yieldFood + yieldMaterial + yieldEnergy) * craftMultiplier)
```

- v0 hub（単一 `materials`）はこれまでどおりこの数値を加算（`importMaterialsIntoHub`）。
- 型付きバッグは**別チャネル**。両方送ってよい（推奨）。

### 5.3 `SortToTradePayload` / URL

```ts
type SortToTradePayload = {
  importMaterials: number;
  craftMultiplier: number;
  /** v2 additive */
  yieldBag?: YieldBag;
};
```

例:

```text
?importMaterials=36&craftMultiplier=1.050&yieldBag=mat_scrap:12;mat_polymer:8;part_actuator:1
```

- `yieldBag` 省略時は v1 パーサ経路（集計のみ）。
- ビルダ: `buildSortToTradePayloadFromResult` / `buildSortToTradeUrl`（バッグがあればクエリ加算）。
- パーサ: 未知 ID は落とす／無視（前方互換）。

### 5.4 hub へのマージ（契約ヘルパのみ）

```ts
mergeYieldBags(a, b) → YieldBag
applyYieldBagToInventory(inv, bag) → YieldBag   // 加算
// 後続 trade: canAffordTypedRepair / spendYieldBag など
```

本 PR では **HubSave のスキーマ版上げはしない**（`materials` 数値のまま）。trade が型付き在庫を持つときは別 PR でスナップショットに `inventory: YieldBag` 等を足す。

---

## 6. 後続: trade 修理がキーを消費する形（予告）

現行 `MECH_FLEET_RULES`:

```text
repairCredits   = 50
repairMaterials = 30   // 単一 materials
```

Yield v2 以降の仮形（**本 PR では mech-fleet の enum／修理 API を変えない**）:

```ts
type TypedRepairCost = {
  credits: number;
  basicMaterials: Partial<Record<BasicMaterialId, number>>;
  parts: Partial<Record<PartId, number>>;
};
// 例: 要修理 1 機 → credits 50 + mat_scrap 20 + mat_polymer 10 + part_actuator 1
```

- 足りなければ修理不可（現行 `canAffordRepair` の型付き版）。
- 大破は修理不可・解体のみ（`MECH_FLEET.md` どおり）。
- 部位破壊テーブルは非ゴール（パーツ ID は将来の拡張口）。

---

## 7. 型・ハンドオフ対応表

| 概念 | シンボル | 場所 |
|---|---|---|
| 汎用資材 ID | `BasicMaterialId` / `BASIC_MATERIAL_IDS` | `sort-yield.ts` |
| 特定パーツ ID | `PartId` / `PART_IDS` | 同上 |
| 成果バッグ | `YieldBag` | 同上 |
| 消去→バッグ | `yieldBagFromClearedCounts` | 同上 |
| バッグ演算 | `mergeYieldBags` / `scaleYieldBag` / `yieldBagTotal` | 同上 |
| 精製結果 | `CraftingPuzzleResult`（+ optional `yieldBag`） | `expedition.ts` |
| sort→trade | `SortToTradePayload`（+ optional `yieldBag`） | `handoff.ts` |
| 集計搬入 | `importedMaterialsFromResult`（変更なし） | `handoff.ts` |
| URL | `buildSortToTradeUrl` / `parseSortToTradeSearch` | `handoff.ts` |

**版メモ:** クエリ追加のみ。旧クライアントは `yieldBag` を無視して集計経路のまま動く。

---

## 8. 受け入れ（後続の最小 sort 実装時）

1. コンテナ予算→有効ピース、無効 `junk` は消えない（`SORT_V2_RULES.md`）  
2. 消した `food` / `material` / `energy` 数が集計 `yield*` に出る  
3. 同じ消去から `YieldBag` が仮ルールどおり生成され、修理向け ID が含まれる  
4. `buildSortToTradeUrl` が `importMaterials` と（任意）`yieldBag` を載せ、trade パーサが読める  
5. `yieldBag` 無し URL でも従来どおり取込できる  
6. `npm run test -w @estg/shared` が通る（本 PR の契約ヘルパ含む）  
7. explore 入出力・機体 `MechStatus` enum は変更しない  

---

## 9. 明示的に後回し（非ゴール）

- `packages/sort` の本格パズル UI／盤面実装  
- explore の再改修・摩耗ルール変更  
- `MechStatus` や修理 API の破壊的変更  
- HubSave への `inventory` 永続化（版上げ）  
- 部位破壊・個別パーツ装備 UI  
- 無効比率の探索品質連動、ジオ補正  
- バランス本調整（上の数値・割当はすべて仮）  

---

## 10. shared 実装メモ（本 PR）

| シンボル | 役割 |
|---|---|
| `sort-yield.ts` | ID カタログ・`YieldBag`・消去変換・バッグ純関数 |
| `expedition.ts` | `CraftingPuzzleResult.yieldBag?` 加算 |
| `handoff.ts` | `SortToTradePayload.yieldBag?`、URL encode/decode、`buildSortToTradePayloadFromResult` |
| `constants.ts` | `HANDOFF_QUERY_KEYS.sortToTrade` に `yieldBag` 加算 |

定数の単一ソースはコード側 `SORT_YIELD_RULES` / ID 配列。本ドキュメントの表はそれと揃えること。
