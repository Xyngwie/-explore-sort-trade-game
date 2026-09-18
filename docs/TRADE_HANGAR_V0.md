# Trade Hangar v0（Module 3 最小ハンガー）

**ステータス:** stub 実装（`packages/trade`）· 2026-09-18  
**目的:** BASE HUB で MECH_FLEET / EXPLORE_IO_V2 / SORT_YIELD_V2 の共有契約を**触って確認**できる薄いループを置く。

関連: `docs/MECH_FLEET.md`、`docs/EXPLORE_IO_V2.md`、`docs/SORT_YIELD_V2.md`、`docs/HUB_SAVE_CONTRACT.md`。

---

## 1. スコープ

| 含む | 含まない（スタブ外） |
|---|---|
| 艦隊一覧（状態 健在/要修理/大破・耐久） | 本格経済・ショップ UI |
| 健在のみ出撃 → trade→explore URL（`deployedInstanceIds`） | explore 本編の戦闘 |
| 帰還ウェア適用（URL またはシミュ） | sort パズル本編 |
| 集計修理（`applyRepair`）と型付き修理（`EXAMPLE_TYPED_REPAIR_COST`） | 部位別修理・バランス本調整 |
| 解体（`applyScrap`） | 見た目のアート |
| HubSave v2 永続化 + `inventory: YieldBag` | HubSave v3 版上げ |
| sort→trade 取込（`importMaterials` + `yieldBag`） | |

---

## 2. 画面 / フロー

```text
起動
  → localStorage から HubSave v2 読込（無ければ INITIAL_HUB）
  → URL に sort / wear があれば取込 → クエリ削除 → 自動セーブ
  → ハンガー UI

シード読込 → プレイテスト用 HubSave 一括適用（健在2 + 要修理1・クレジット/型付き資材/弾薬）
機体を受領 → 艦隊に OwnedMech 追加（空/不足時の手動付与）
出撃チェック → 「探索へ配備」リンク（deployableMechs + deployedInstanceIds + startingAmmo）
（任意）シミュ帰還 extract/abort/fail → wearFleetAfterSortie
または explore から ?returnKind=&mechWear= で戻る → applyWearReportsToFleet

要修理 → 修理（集計）または 修理（型付き）
任意状態 → 解体 → クレジット/資材回収

sort から ?importMaterials=&yieldBag= → materials 加算 + inventory マージ
```

---

## 3. セーブ（加算）

- キー: 既存どおり `wreckline.hubSave.v1`（中身 `v: 2`）
- `HubSnapshot.inventory: YieldBag` を**加算**（欠落時は `{}`）
- ヘルパ: `importYieldBagIntoHub`（`packages/shared`）
- 版番号は 2 のまま（破壊的変更なし）

---


---

## 4.5. プレイテスト用シード

Pages / Android で毎回「機体を受領」「デモ資材バッグ」しなくて済むよう、**「シード読込」**で HubSave を一括上書きする。

| 項目 | 内容 |
|---|---|
| 艦隊 | `seed_op_gen1` 健在 / `seed_op_gen2` 健在 / `seed_repair_gen1` 要修理（耐久25） |
| ウォレット | credits ≥800（`EXAMPLE_TYPED_REPAIR_COST.credits` の余裕込み）· materials 200 |
| YieldBag | `buildSeedYieldBagForTypedRepair()` = `EXAMPLE_TYPED_REPAIR_COST` ×3 + circuit/armor デモ枠 |
| 弾薬 | standard 40 · ap 10 · hp 5 |
| API | `buildPlaytestSeedHub()` / `loadPlaytestSeed()` → 既存 `saveHubSaveToLocalStorage` |
| 対比 | 「デモ初期化」= セーブ消去 → `INITIAL_HUB`（空艦隊） |

### 4.5.1 シード → 型付き修理 → 再出撃ループ

受け入れの最短経路（Module 3 スタブのみ・invade/restore 未配線）:

1. **シード読込** → `seed_repair_gen1` が要修理、在庫が `EXAMPLE_TYPED_REPAIR_COST` を満たす  
2. **修理（型付き）** → クレジット + YieldBag を消費し、機体が健在・耐久最大へ  
3. 出撃チェックに当該機が**自動で含まれる**（`selectDeployableInstanceIds`）  
4. **探索へ配備** URL に `seed_repair_gen1` が入る  

資材不足時はボタンを押すと赤字の不足メッセージ（要/持）を出し、状態は変えない。

探索戦闘ルール・sort ルールは変更しない（trade スタブのみ）。

## 4. スタブしているもの

- 弾薬の購入 UI（初期 `ammoLoad` のまま出撃に載せるだけ）
- クレジット獲得以外の経済（解体・搬入のみ）
- explore イベント積み上げ摩耗（現状は returnKind フラット減；URL 往復は実装済み）
- 型付き修理と集計修理の統一コスト表（並存させて契約を両方見せる）

---

## 5. 受け入れ条件

1. `npm run typecheck`（shared + explore + trade）が通る  
2. `npm run test -w @estg/shared` が通る  
3. ハンガーで機体状態ラベル（健在/要修理/大破）が見える  
4. 健在機のみ出撃 URL に `deployedInstanceIds` が付く  
5. シミュ帰還または `mechWear` URL で耐久が減り、状態が再計算される  
6. sort 相当の `?importMaterials=&yieldBag=` で集計資材と inventory が増える  
7. 集計修理・型付き修理・解体がセーブに残る（リロード後も維持）  
8. 「シード読込」で混合艦隊 + YieldBag + 弾薬が HubSave に残り、リロード後も維持  
9. シード読込 → 型付き修理で要修理機が健在になり、出撃 URL にその instanceId が含まれる（不足時はメッセージのみ）

---

## 6. 試し方

```bash
npm install
npm run dev:trade    # :5175
npm run dev:explore # :5173（任意・実 URL 往復）
```

ブラウザで `http://localhost:5175/` を開き:

0. （推奨）「シード読込」→ 健在2 + 要修理1・資材/弾薬入りで即プレイテスト可  
0b. **修理ループ:** 要修理機の「修理（型付き）」→ 在庫/クレジット減・健在化 → 出撃チェックに載る → 「探索へ配備」  
1. または「機体を受領」→ 健在機を選択 → 「探索へ配備」の URL を確認（`deployedInstanceIds` + `mechDurability`）  
2. **実往復:** リンクで explore へ → 撤退 or EXTRACT →「拠点へ摩耗報告」→ trade で耐久減少を確認  
3. **シミュ:** 「シミュ帰還 fail」で要修理化 → 「修理（集計）」  
4. 「デモ資材バッグ」→ 再度要修理化 → 「修理（型付き）」  
5. 例: `?importMaterials=10&yieldBag=mat_scrap:5;part_actuator:1` を付けてリロード  

詳細: [`docs/EXPLORE_IO_V2.md`](./EXPLORE_IO_V2.md) §9  

---

## 7. 主なファイル

| パス | 役割 |
|---|---|
| `packages/trade/src/main.ts` | ハンガー UI（シード読込ボタン含む） |
| `packages/trade/src/hangar.ts` | 状態遷移・永続化・ハンドオフ取込・`loadPlaytestSeed` |
| `packages/shared/src/hub-save.ts` | `inventory` / `importYieldBagIntoHub` |
