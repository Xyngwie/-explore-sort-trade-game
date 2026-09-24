# Trade Hangar v0（Module 3 最小ハンガー）

**ステータス:** stub 実装（`packages/trade`）· 2026-09-19  
**目的:** BASE HUB で MECH_FLEET / EXPLORE_IO_V2 / SORT_YIELD_V2 の共有契約を**触って確認**できる薄いループを置く。

関連: `docs/MECH_FLEET.md`、`docs/EXPLORE_IO_V2.md`、`docs/SORT_YIELD_V2.md`、`docs/HUB_SAVE_CONTRACT.md`、[`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md)（invade/restore キー契約 · Hub リンク/取込配線済み）。

---

## 1. スコープ

| 含む | 含まない（スタブ外） |
|---|---|
| 艦隊一覧（状態 健在/要修理/大破・耐久） | 本格経済・ショップ UI |
| 健在のみ出撃 → trade→explore URL（`deployedInstanceIds`） | explore 本編の戦闘 |
| 帰還ウェア適用（URL またはシミュ） | sort パズル本編 |
| 集計修理（`applyRepair`）と型付き修理（`EXAMPLE_TYPED_REPAIR_COST`） | 部位別修理・バランス本調整 |
| 解体（`applyScrap`） | 見た目のアート |
| レア YieldBag 売却（明示仮価格表 · TBD） | 本格ショップ / 経済バランス |
| 保有回路の効果値表示 + 売却（最低30c + 有効値×3c 仮） | 回路マーケット / 相場 |
| HubSave v2 永続化 + `inventory: YieldBag` + `circuits` | HubSave v3 版上げ |
| sort→trade 取込（`importMaterials` + `yieldBag`） | |

---


## 1.5. Module 4 / 5 ハンドオフ（Hub 配線）

| 方向 | キー（要約） | Hub 状態 |
|---|---|---|
| trade → invade | `fromHub` + 任意艦隊要約 | 「戦線へ（任意）」リンク（`buildTradeToInvadeUrl`） |
| invade → trade | `sectorX/Y` + `density` + `intelFlags?` | 取込 → UI 表示 + `wreckline.hubM45Stash.v0`（セクターのみ・HubSave 未拡張） |
| trade → restore | `circuitId?` + `circuitBoard?` | 「回路修復へ」＋保有回路一覧から選択 URL（`HubSave.circuits` / シード） |
| restore → trade | `circuitBoard` + `circuitOutcome` | 取込 → `HubSave.hub.circuits` に upsert（旧 `hubM45Stash` から移行可） |

**非ゴールのまま:** invade 本 salvage / YieldBag · セクターの HubSave 本組み込み。

詳細: [`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md)。

## 2. 画面 / フロー

```text
起動
  → localStorage から HubSave v2 読込（無ければ INITIAL_HUB）
  → URL に sort / wear / invade / restore があれば取込 → クエリ削除 → 自動セーブ
  → ハンガー UI（ヒーロー「次の出撃」: 帰還ワンライナー explore/invade/restore · 回路効果値 · 修理なし時は配備 CTA 強調）

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
- `HubSnapshot.circuits: HubCircuitRecord[]` を**加算**（欠落時は `[]`；`circuitId` + `CircuitBoardState` + `outcome`）
- ヘルパ: `importYieldBagIntoHub` / `upsertCircuitIntoHub`（`packages/shared`）
- 版番号は 2 のまま（破壊的変更なし）。旧 `wreckline.hubM45Stash.v0` の回路は起動時に HubSave へ移行
- **回路ボーナス（track 1）:** `hubCircuitBonuses` / `aggregateCircuitBonuses` — 集計修理割引・出撃 URL の `circuitBonuses`・ハンガー表示。表は [`RESTORE_V0.md`](./RESTORE_V0.md) §5.4.1

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

受け入れの最短経路（Module 3 スタブ · 型付き修理）:

1. **シード読込** → `seed_repair_gen1` が要修理、在庫が `EXAMPLE_TYPED_REPAIR_COST` を満たす  
2. **修理（型付き）** → クレジット + YieldBag を消費し、機体が健在・耐久最大へ  
3. 出撃チェックに当該機が**自動で含まれる**（`selectDeployableInstanceIds`）  
4. **探索へ配備** URL に `seed_repair_gen1` が入る  

資材不足時はボタンを押すと赤字の不足メッセージ（要/持）を出し、状態は変えない。

探索戦闘ルール・sort ルールは変更しない（trade スタブのみ）。

### 4.5.2 検証用真盤（Perfect Circuit seed）

ロック／刻印のプレイテスト用に、**保証可解**な 2×2 Slitherlink を HubSave.circuits へ授与できる。

| ボタン | circuitId | 内容 |
|---|---|---|
| **検証用真盤を受領** | `verify_true` | 未解・可解（`puzzleId=verify-true-2`）。restore で解く → `fully_awakened` + perfect lock |
| **検証用・既に完璧** | `verify_perfect` | 解答済み + `locked` + `lastEditorName`（署名があればそれを刻印） |

共有データ: `@estg/shared` の `perfect-circuit-seed`（`buildVerifyTrueUnsolvedBoard` / `buildVerifyPerfectLockedBoard`）。restore は同 `puzzleId` で固定手がかりを返す（`generatePuzzle`）。

<details>
<summary>ネタバレ（解答ヒント）</summary>

外周を一周（内部の十字辺は線にしない）。各マスの周囲辺数は 2。定数 `VERIFY_TRUE_SOLUTION_HINT` と同文。

</details>


## 3.4b. 回路売却（仮）

保有回路一覧に **効果値**と**充足数字の内訳**（`formatCircuitEffectBreakdownJa` · 同一最小閉ループ採点）（Restore/Trade 共通 `computeCircuitEffect*` · 最小閉ループ）を表示し、**売却 仮 = 最低 30c + 出来栄え floor(effect) × 3c**（`$` 相当・既存 `c` 表記）。効果 0 も +30c（最低額のみ）で売却可（在庫クリア）。確認ダイアログは解体と同系統（総額 + 最低/出来栄え内訳）。

## 3.5. レア売却 仮価格表（TBD）

レア mats / parts の売却単価は **明示テーブル** `RARE_SELL_PRICE_TABLE`（`packages/trade/src/rare-sell-prices.ts`）に置く。  
UI の「レア売却 仮価格表」と在庫の「売却 仮Nc」ボタン、および `sellRareItem` はすべてこの表を参照する（アドホックな単価ハードコード禁止）。

| id | kind | 仮価格 (credits) | balance |
|---|---|---:|---|
| `mat_circuit` | mat | 8 | **TBD** |
| `part_actuator` | part | 35 | **TBD** |
| `part_armor_plate` | part | 40 | **TBD** |
| `part_power_cell` | part | 45 | **TBD** |
| `part_sensor_array` | part | 55 | **TBD** |

- 意図（仮）: parts > basic rare mat。表に無い YieldBag id は売却不可。  
- **バランス未調整** — 各行 `balance: "TBD"`。経済パスまで数値を最終扱いしない。  
- 調整時は表の `credits`（と必要なら行追加）だけ触る。

---

## 4. スタブしているもの

- 弾薬の購入 UI（初期 `ammoLoad` のまま出撃に載せるだけ）
- 本格経済（レア売却は明示仮価格表のみ · バランス TBD）
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
10. 「戦線へ」URL に `fromHub=1`（+ 任意 `deployableMechs` / `startingAmmo`）が付く  
11. 「回路修復へ」URL に `circuitId` / `circuitBoard` が付く（HubSave.circuits 選択またはシード優先）  
12. `?sectorX=&sectorY=&density=` 取込でセクターが表示され、`?circuitBoard=&circuitOutcome=` 取込で outcome が表示され **HubSave.circuits に残る**（リロード後も一覧から修復へ開ける）
12b. 「次の出撃」をヒーローに（CTA 短縮: 戦線 / 探索 / 修復 / 仕分）: 探索/戦線/回路の帰還ワンライナー・回路効果値・配備予定/要修理。修理待ち0かつ出撃可なら配備 CTA を強調（HubSave キー追加なし）
13. レア仮価格表が UI に見え、レア在庫の売却が表の単価でクレジット加算・HubSave に残る（非レアは売却不可）
13b. 保有回路に効果値と「売却 仮Nc」があり、売却で HubSave.circuits から除去・credits += 最低30 + 有効値×3（効果0は +30c 可）

---

## 6. 試し方

```bash
npm install
npm run dev:trade    # :5175
npm run dev:explore # :5173（任意・実 URL 往復）
```

ブラウザで `http://localhost:5175/` を開き:

0. （推奨）「シード読込」→ 健在2 + 要修理1・資材/弾薬入りで即プレイテスト可  
0c. **回路ロック:** 「検証用・既に完璧」→ 一覧に完璧·編集不可 →「閲覧へ」で restore が編集不可表示。または「検証用真盤を受領」→「修復へ」→ 外周一周で完全覚醒 → 拠点へ戻すとロック  
0b. **修理ループ:** 要修理機の「修理（型付き）」→ 在庫/クレジット減・健在化 → 出撃チェックに載る → 「探索へ配備」  
1. または「機体を受領」→ 健在機を選択 → 「探索へ配備」の URL を確認（`deployedInstanceIds` + `mechDurability`）  
2. **実往復:** リンクで explore へ → 撤退 or EXTRACT →「拠点へ摩耗報告」→ trade で耐久減少を確認  
3. **シミュ:** 「シミュ帰還 fail」で要修理化 → 「修理（集計）」  
4. 「デモ資材バッグ」→ 再度要修理化 → 「修理（型付き）」  
4b. **レア売却:** 仮価格表を確認 → レア在庫の「売却 仮Nc」→ クレジット増加（TBD 単価）  

5. 例: `?importMaterials=10&yieldBag=mat_scrap:5;part_actuator:1` を付けてリロード  

詳細: [`docs/EXPLORE_IO_V2.md`](./EXPLORE_IO_V2.md) §9  

---

## 7. 主なファイル

| パス | 役割 |
|---|---|
| `packages/trade/src/main.ts` | ハンガー UI（「次の出撃」パネル · シード読込含む） |
| `packages/trade/src/hangar.ts` | 状態遷移・永続化・ハンドオフ取込・`loadPlaytestSeed` · `buildNextSortieReadiness` |
| `packages/shared/src/hub-save.ts` | `inventory` / `circuits` / `importYieldBagIntoHub` / `upsertCircuitIntoHub` |
