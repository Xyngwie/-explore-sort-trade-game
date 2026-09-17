# Trade Hangar v0（Module 3 最小ハンガー）

**ステータス:** stub 実装（`packages/trade`）· 2026-09-17  
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

機体を受領 → 艦隊に OwnedMech 追加
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

---

## 6. 試し方

```bash
npm install
npm run dev:trade    # :5175
npm run dev:explore # :5173（任意・実 URL 往復）
```

ブラウザで `http://localhost:5175/` を開き:

1. 「機体を受領」→ 健在機を選択 → 「探索へ配備」の URL を確認（`deployedInstanceIds` + `mechDurability`）  
2. **実往復:** リンクで explore へ → 撤退 or EXTRACT →「拠点へ摩耗報告」→ trade で耐久減少を確認  
3. **シミュ:** 「シミュ帰還 fail」で要修理化 → 「修理（集計）」  
4. 「デモ資材バッグ」→ 再度要修理化 → 「修理（型付き）」  
5. 例: `?importMaterials=10&yieldBag=mat_scrap:5;part_actuator:1` を付けてリロード  

詳細: [`docs/EXPLORE_IO_V2.md`](./EXPLORE_IO_V2.md) §9  

---

## 7. 主なファイル

| パス | 役割 |
|---|---|
| `packages/trade/src/main.ts` | ハンガー UI |
| `packages/trade/src/hangar.ts` | 状態遷移・永続化・ハンドオフ取込 |
| `packages/shared/src/hub-save.ts` | `inventory` / `importYieldBagIntoHub` |
