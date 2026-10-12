# Module 3 拠点だけの最小セーブ契約（v0）

日付: 2026-09-15  
対象: BASE HUB のみ（`https://mist-river-velvet-drum.grok.me`）  
非対象: WRECKLINE / Athanor（URLハンドオフのまま・揮発）

---

## 1. 目的

周回を跨いで「拠点の所持」だけを残す。  
出撃中・精製中の一時状態は保存しない。

---

## 2. 残すもの（Persist）

`HubSnapshot` 相当:

| キー | 型 | 意味 |
|---|---|---|
| `credits` | number | 所持クレジット |
| ~~`materials`~~ | number | ~~所持資材~~（§12.12 で廃止） |
| `fleet` | `MechId[]` | 配備済み機体（**上限なし**。2026-10-03 項目15 で上限3を撤廃。現行は `OwnedMech[]`、§12） |
| ~~`ammoLoad`~~ | `Record<AmmoId, number>` | ~~弾種別所持~~（§12.12 で廃止） |
| `importedMaterials` | number | 直近の Module 2 搬入表示用（任意。0でも可） |
| `selectedMechId` | MechId | UI選択（任意） |
| `selectedAmmoId` | AmmoId | UI選択（任意） |

セーブファイル形:

```ts
type HubSaveV1 = {
  v: 1;
  savedAt: string; // ISO
  hub: {
    credits: number;
    materials: number;
    fleet: string[];
    ammoLoad: Record<string, number>;
    importedMaterials: number;
    selectedMechId: string;
    selectedAmmoId: string;
  };
};
```

ストレージ: **同一オリジンの `localStorage`**  
キー名（固定）: `wreckline.hubSave.v1`

---

## 3. 捨てるもの（Reset / 保存しない）

| 項目 | 扱い |
|---|---|
| `phase`（supply / sortie） | 起動時は常に supply 推奨 |
| `sortieCommitted` | false |
| Comms / 操作ログ | 空で開始（任意で「Save loaded」1行） |
| M1 出撃中ワールド（位置・視界・弾・敵） | 保存しない |
| M2 パズル盤・仕分け・タイマー | 保存しない |
| URLクエリ（importMaterials 等） | 従来どおり一度消費して消す。セーブより**後**に適用してよい |

**クエリとセーブの順序（推奨）:**

1. localStorage から hub をロード  
2. その上で `?importMaterials=` があれば加算（今の importFromModule2）  
3. 加算後に自動セーブ  

こうすると「精製→格納庫へ戻った成果」が次起動にも残る。

---

## 4. いつ書くか / 読むか

**Load:** アプリ起動時（hub-store 初期化）に1回。壊れてたら `INITIAL_HUB` にフォールバック。

**Save（どれか欠けても動くなら、まずは全部）:**

- `credits` / `materials` / `fleet` / `ammoLoad` が変わった直後  
- `importFromModule2` 成功後  
- `commitSortie` 前後は必須ではない（出撃パラメータはURLで渡す）  
- 明示ボタン「セーブ」は任意（自動でも可）

**Reset:** 既存「デモを初期値に戻す」は  
`INITIAL_HUB` に戻したうえで localStorage も消すか、上書き保存する（どちらかをUIに明記）。

---

## 5. バリデーション（最低限）

読込時:

- `v !== 1` → 無視して初期化  
- `credits` / `materials` は有限数、負なら 0  
- `fleet` は既知 `MechId` のみ。**長さの上限はない**（2026-10-03 項目15 で `HUB_LIMITS.maxMechs` と読み込み時の切り詰めを撤廃。代わりに出撃機の上限 `HUB_LIMITS.maxSortieMechs = 3`、§12.5 `sortieSelection`）  
- `ammoLoad` は既知 `AmmoId` のみ、合計 ≤ `maxAmmo` にクランプ可  

書けない／読めない環境でもアプリは落ちない（デモ初期値で継続）。

---

## 6. 受け入れ条件

1. 拠点でクレジット・資材・機体・弾薬を変える → リロード（またはタブを閉じて再開）しても残る  
2. M2から `?importMaterials=` で戻った加算も、その後のリロードで残る  
3. M1/M2側にセーブ実装は無い（変更不要）  
4. 「デモを初期値に戻す」で初期状態に戻り、以降のロードも初期（または明示的にクリア）  

---

## 7. Grok Build（BASE HUB）に貼る文

```
【改修】Module 3（BASE HUB）だけの最小セーブ／ロードを入れてください。

目的: 周回用の拠点状態だけ localStorage に残す。M1/M2は触らない。

保存キー: wreckline.hubSave.v1
形式: { v:1, savedAt: ISO, hub: { credits, materials, fleet, ammoLoad, importedMaterials, selectedMechId, selectedAmmoId } }

残す: HubSnapshot の上記フィールド
捨てる: phase / sortieCommitted / 操作ログ（起動は supply、committed false）

挙動:
1. 起動時にロード。壊れていたら INITIAL_HUB
2. credits/materials/fleet/ammoLoad/import が変わったら自動セーブ
3. ?importMaterials= の受取は、ロードのあとに適用し、適用後にセーブ
4. 「デモを初期値に戻す」は初期化＋セーブ消去または初期で上書き（UIに一言）
5. 失敗しても落ちない

受け入れ: リロード後も所持が残ること。M2から戻った資材加算もリロード後に残ること。
```

---

## 8. 将来（同一アプリ化時）

同じ `HubSaveV1.hub` を共通ストアの初期値にする。  
キー名と `v:1` を維持すれば移行が楽。


---

## 9. 機体フリート（v2 追記）

`fleet` は **所有インスタンス**（`OwnedMech[]`）へ拡張。ペイロード版は **`v: 2`**（ストレージキー名は当面 `wreckline.hubSave.v1` のまま）。  
詳細・仮バランス・マイグレーションは [`MECH_FLEET.md`](MECH_FLEET.md)。

---

## 10. 回路ボード（v2 追記）

`HubSnapshot.circuits: HubCircuitRecord[]` を**加算**（欠落時は `[]`）。  
各要素: `{ circuitId, circuitBoard: CircuitBoardState, outcome, updatedAt?, lastEditorName?, locked? }`（刻印・Perfect ロックは加算）。  
版番号は **`v: 2` のまま**（inventory と同様）。ヘルパ: `upsertCircuitIntoHub` / `normalizeCircuits`。  
詳細: [`TRADE_HANGAR_V0.md`](./TRADE_HANGAR_V0.md)、[`RESTORE_V0.md`](./RESTORE_V0.md)。

---

## 11. 前線マインスイーパ進捗（v2 追記）

`HubSnapshot.frontProgress: InvadeFrontProgress | null` を**加算**（欠落時は `null`）。  
読込時エイリアス: `invadeBoard` → `frontProgress`。版番号は **`v: 2` のまま**。

各要素: `{ seed, aoiHalf?, opened[], flagged[], focus, hitMine?, updatedAt? }`。  
地雷レイアウトは `seed`（uint32）から invade 側 `rngFromSeed` で再生成し、開いたマス・旗・ルート焦点を載せる。  
ヘルパ: `normalizeFrontProgress` / `setFrontProgressInHub` / `clearFrontProgressInHub`。  
UI: invade 「盤を再生成」は確認のうえ進捗をクリアする。

---

## 12. 回路の装着・落とし物・パーフェクト最大サイズ（v3）

設計: [`CIRCUIT_DATA_MODEL_V0.md`](./CIRCUIT_DATA_MODEL_V0.md)（2026-09-28 承認）。実装 A（shared）で入った契約。

### 12.1 版とキー

| 項目 | 内容 |
|---|---|
| ペイロード | **`HubSaveV3`（`v: 3`）**。`createHubSave` は常に v3 を書く。`parseHubSave` は v1・v2・v3 を受け付け、正規化後は常に v3。`v ≥ 4` は `null` |
| 保存キー | **`wreckline.hubSave.v3`**（`HUB_SAVE_STORAGE_KEY`）。旧キー `wreckline.hubSave.v1`（`HUB_SAVE_LEGACY_STORAGE_KEY`）は読み込み元としてだけ使う |
| 読み込み順 | ① 新キー → ② なければ旧キー（v1/v2）を移行 → ③ 移行結果を新キーに書く。**旧キーは消さず、書き換えもしない** |
| Reset | `clearHubSaveFromLocalStorage` は **新旧両方のキーを消す**（消さないと次回旧キーから再移行される）。退避したセーブ（12.3）は消さない |

キーを分けたので、古いビルドのタブが旧キーに書いても v3 のセーブは変わらない。

### 12.2 v3 で加わったもの

- `circuits[]` の各要素（`HubCircuitRecord`）に `restoreState`（`unrestored`／`fully_awakened`／`bypass`／`offline`）、`origin`（`crafted`／`bought`／`enemy_drop`／`picked_up`／`legacy`）、`equippedTo`（`OwnedMech.instanceId` または `null`＝倉庫）、任意の `acquiredAt`・`effectKey`（~~予約~~ → #270 で使用開始。§12.9）。
  - `outcome` は `restoreState` の **3 値の写し（@deprecated）** として残す（`unrestored` → `"offline"`）。既存の呼び出し側を変えないため。正本は `restoreState`。
  - `unrestored` のとき `circuitBoard.outcome` は空。それ以外は `restoreState` と同じ。
  - 評価値は保存しない（`circuitEffectValue` で毎回計算。手がかり生成の互換は selftest で固定、設計 §9 U17）。
- **件数の切り詰めを廃止**。`HUB_LIMITS.maxCircuits`（8）は trade が参照しているので `@deprecated` で残す。
- `perfectMaxSize: number`（0〜20。Restore の最大 20×20 に合わせ、読み込み時に 20 を超える値は 20 に丸める。2026-09-28 までは 0〜64）。パーフェクト（Fully Awakened かつ locked）にできた最大の辺。欠落時（v1/v2 からの移行）は既存のパーフェクト回路の最大辺で初期化（U11）。保存値があればそのまま使う（売っても下がらない）。
- `fieldDrops: FieldCircuitDrop[]`（`{ dropId, frontSeed, cell, circuit, cause, fromMechInstanceId?, droppedAt }`）。欠落時 `[]`。読めない要素は 1 件ずつ捨てる。
- `appliedSortieIds?: string[]`（直近 20 件）。出撃報告の二重反映防止。

### 12.3 安全に読めない場合

| 状況 | 挙動 |
|---|---|
| JSON が壊れている・形が不正 | 元の文字列を `wreckline.hubSave.corrupt.<ISO>` に退避してから `null`（同じ文字列は二重に退避しない）。`loadHubSaveWithStatus` は `status: "corrupt_backed_up"` と `backupKey` を返す |
| 保存済みが新しい版（`v ≥ 4`） | 分かる範囲で読んで返す（`status: "newer_read_only"`）。**`saveHubSaveToLocalStorage` は書き込みを拒否**（`false`） |
| 回路 1 件だけ壊れている | その 1 件だけ捨てる（ほかは残す）。捨てた件数は `droppedCircuits` |
| `equippedTo` が存在しない機体 | 倉庫へ戻す |
| 1 機の装着数が枠（当面 1）を超える | `updatedAt` が新しいものを残し、ほかは倉庫へ（部隊上限は項目3 まで判定しない、U3） |

移行は冪等（同じ v2 から何度移しても同じ v3。ID は振り直さない）。

### 12.4 ヘルパ（shared）

- 保存: `loadHubSaveWithStatus`／`loadHubSaveFromLocalStorage`／`saveHubSaveToLocalStorage`／`clearHubSaveFromLocalStorage`／`migrateHubSaveToV3`（`migrateHubSaveV1ToV2` は別名で残す）。
- 回路（`circuit-inventory.ts`）: `circuitEffectValue`／`circuitActiveEffect`／`circuitSize`／`equipCircuit`／`unequipCircuit`／`recordPerfectSize`／`craftMaxSize`／`addFieldDrops`／`recoverFieldDrops`／`applySortieReport`／`buildMechCircuitsForDeploy`。
- `upsertCircuitIntoHub`（restore→trade の取込）は既存レコードの `equippedTo`・`origin`・`acquiredAt` を引き継ぐ。`perfectMaxSize` の更新は実装 B で取込側から `recordPerfectSize` を呼ぶ。

### 12.5 2026-10-01〜03 の追加（#199・#201・#203・#204・#206、携行弾の修正）

`HubSaveV3`（`v: 3`・キー `wreckline.hubSave.v3`）のまま、任意フィールドを加算した。版もキーも変えていない。ここではコード（携行弾の修正 #208・#209 と U9 の直接保存を入れた後）がしていることを書く。反映経路（U9）は 2026-10-03 の神宮の決定どおり **Explore が出撃終了時に HubSave へ直接書く**（U9 の PR で実装。[`CIRCUIT_DATA_MODEL_V0.md`](./CIRCUIT_DATA_MODEL_V0.md) §5.5）。帰還 URL は互換のため残り、trade は同じ処理で 1 回だけ反映する（§12.6 末尾）。

#### 機体ごと（`fleet[]` の `OwnedMech`。`shared` `mech-fleet.ts`）

| フィールド | 型・範囲 | 既定・正規化 | PR |
|---|---|---|---|
| `currentAmmo?` | 整数 0〜その機体の上限（28 × 銃の回路。MMR 6・LMG 56。輸送 URL の切り詰めは最大 56＝`MECH_AMMO_MAX_CAPACITY`）。`instanceId` ごとの携行弾 | 正規化（`normalizeHubSnapshot` → shared `mech-ammo.ts` `applyHubAmmoRules`）で、**欠落は機体の上限まで満タンにして書く**（従来の暫定ルール「未設定＝満タン」を保存時に確定させる。在庫からは引かない）。上限を超える分は**捨てずに**「弾薬」在庫（`inventory.ammo`）へ戻す。配り方は下の「携行弾の配り方（2026-10-12 決定）」 | #201・携行弾の修正・fix/circuit-ammo-activity-refill |
| `battery` | `{ capacity: number; activity: number }`。`capacity` は 1 以上の整数、`activity` は 0〜`capacity` の整数 | 欠落・不正は `capacity 300`／`activity 300`（`MECH_BATTERY_DEFAULT_*`）。`normalizeBattery` で切り捨て・範囲内に収める。新しく作る機体も 300／300 | #204 |

- HUB の `ammoLoad`（弾種別の所持）は **共有在庫のまま**。`currentAmmo` は `ammoLoad` に入れない。
- 帰還の携行弾・バッテリーは、帰還の `mechCurrentAmmo`・`mechBattery` を該当する機体の `currentAmmo`・`battery` に書き戻す（shared `applyReturnedMechState`。#209 で trade に入れ、U9 で shared へ移した。0 も 0 として書く。報告にない機体は変えない）。Explore の直接保存と trade の帰還 URL の反映はどちらも shared `applyExploreReturnToHub`（出撃報告 → 摩耗 → 携行弾・バッテリー）を通る。`sortieId` が既に `appliedSortieIds` にある帰還は何もしないので、二重に反映せず、古い URL を開き直しても新しい値を上書きしない。書き戻した値は次の出撃 URL（`buildTradeToExplorePayloadFromFleet`）の `mechCurrentAmmo`・`mechBattery` でそのまま送られる。
#### 携行弾の配り方（2026-10-12 神宮の決定、fix/circuit-ammo-activity-refill）

§12.5 で未決だった「機体ごとに配る本ルール」を決めた（shared `mech-ammo.ts`）。

- **在庫**: 「弾薬」在庫は `inventory.ammo`（1 個＝1 発）。旧 `ammoLoad`（弾種別）は触らない（M1）。
- **上限**: 格納庫での上限＝基礎 28 × 銃の回路（MMR ÷5＝6、LMG ×2＝56。`mechAmmoCap`）。解放モードの 0.5 倍は**出撃中だけ**で、撃てない分は機体に残して持ち帰る（P3）。保存時の切り詰めは機体ごとの上限（LMG は 56 を保つ）。
- **回路の付け替え**（`equipCircuit`・`unequipCircuit`、装着回路の売却、`ensureCaptainFalseOneByOne`、`enforceEquipIntegrity` で装着が動いた機体。**大破機も含む**）: その機体の携行弾をいったん全部在庫へ戻し、新しい上限を計算し、在庫から上限まで積む（`reloadMechAmmo`）。上限が変わらなくても毎回戻して積み直す（M5）。足りなければあるだけ積む（M2）。動いた弾は記録だけ（trade のコンソールに 1 行。リボン・バナーは出さない、M4・M8）。合計（携行弾＋在庫）は変わらない。
- **自動補充**（M3、`refillFleetAmmo`）: 帰還時（`applyExploreReturnToHub` の最後。大破機は除く）と出撃前（trade の出撃リンクを押したとき＝`markDeployed`、Explore が HubSave から部隊を組む Invade リンクと「再出撃」）に、在庫から上限まで積む。格納庫を開いただけでは積まない（出撃中に積むと帰還の上書きで在庫が消えるため）。
- **足りないとき**（M8）: 付け替え→記録だけ。出撃前→出撃ボタンの近くに 1 行（例「弾薬が足りません：僚機A 12/28」。名前は出撃順の 隊長／僚機A／僚機B、複数は「・」でつなぐ。trade `#ammo-short-line`、Explore の作戦概要 `#ammo-short-presortie`）。帰還→結果画面に 1 行（Explore `#ammo-short-note`。帰還結果 `ApplyExploreReturnResult.ammoShort`）。
- **解体**（M7）: 解体した機体の携行弾は在庫へ戻す（trade `scrapMech`）。
- **壊れたセーブの修復**（M6、新しい任意キー **`ammoBatteryRepaired?: true`**）: このキーが無いセーブを読んだとき 1 回だけ、`battery.capacity` が 300 を超える機体（`fleet` と `lostMechs`）を 300 に戻し（`activity` も 300 以下に）、携行弾が上限未満の機体を上限まで**付与**する（在庫からは引かない）。その後キーを `true` にする。2 回目以降は何もしない。残骸（`lostMechs`）の携行弾は変えない。
- **バッテリー**: 回路による最大活動量の上乗せ（`modsFor().activity`）と解放モードの最大活動量 0.5 倍は**出撃中だけ計算し、保存しない**（Explore `effectiveBatteryCapacity`）。帰還は上乗せ前の `capacity` を書く。充電は先送りのまま。**将来、充電を入れるときは携行弾と同じく「満たせないときは知らせる」扱いにする**（今回はドキュメントだけ）。
- **5-3 の途中保存**: 修正前の途中保存は `mechBattery` に上乗せ後の値を持つことがある。読み直し（`worldFromCheckpointBody` → `restorePreBoostBattery`）で `circuitPlay.baseBattery`（上乗せ前）に戻し、300 を超える値は 300 にする。`circuitPlay.ammoCapAt`（出撃中の上限の記録。保存キーではない）が無い途中保存も読める。旧 `baseAmmo` は読み捨て。
- selftest: `shared` `mech-ammo.selftest.ts`（旧セーブ＝`currentAmmo` 無し・バッテリー膨張・残骸付き、M6 は 1 回だけ、MMR・LMG の付け替えで合計不変、大破機の付け替え、出撃の繰り返しで上限が積み重ならない、不足の 1 行）、`explore` `ammoRefill.selftest.ts`（MMR で 3 回出撃しても 6 のまま、撃てない分を捨てない、分配で捨てない、修正前の途中保存、出撃前の補充）、`trade` `hangar.selftest.ts`（出撃リンクでの補充と URL、出撃ボタンの 1 行、解体で在庫へ、付け替えの記録行）。

- **A1・A2（2026-10-12 神宮、#266 の PR で記録）**: A1 = A（付け替えで動いた弾は開発用コンソールに記録するだけ。画面には出さない）。A2 = A（fix/circuit-ammo-activity-refill で実装側が決めた技術上の既定 4 つはそのまま）。4 つは次のとおり:
  1. 古いセーブで `currentAmmo` が無い機体は、その機体の上限まで満タンとして扱う（在庫からは引かない）。
  2. 帰還時の自動補充は大破機を除く（回路の付け替えでの積み直しは大破機も含む）。
  3. 格納庫を開いただけでは補充しない（出撃中に補充すると、帰還の上書きで消えるため）。
  4. 修正前の 5-3 の途中保存で、バッテリーの上限が 300 を超えているものは 300 に戻す。
- **機体のお金（#266、feat/money-mech-economy）**: 新しい保存キーは無い。購入・作成は `fleet` に `mech_gen1` を 1 機足す。~~（`currentAmmo` 欠落 → 上の暫定ルールで満タン 28 を付与。在庫からは引かない）~~ → 変更（E1 = B・2026-10-12 神宮、fix/hangar-money-followups）: **`currentAmmo: 0`** で足す。出撃前の補充（M3）で在庫から積み、足りなければ出撃ボタンの近くに 1 行（M8）。購入で弾の合計（携行弾＋在庫）は増えない。残骸復活は `fleet` の大破機の `durability`・`status` だけを変える（`instanceId`・回路の `equippedTo`・`currentAmmo`・`battery` はそのまま）。通常修理は `inventory.armor` を足りない耐久の分だけ引き、クレジット・`materials` は変えない。どれも 1 回の操作で 1 回だけ保存する（URL に操作を載せないので読み直しで繰り返さない）。
- **格納庫の所持欄（2026-10-12、fix/hangar-money-followups）**: 上の所持欄の「弾薬」は `inventory.ammo`、「装甲パーツ」（E3 で追加）は `inventory.armor`、「電力パーツ」は `inventory.power` を出す（trade `holdingPills`）。旧 `ammoLoad`（弾種別）はセーブに残し、書き換えない（出撃 URL の `startingAmmo` は今も `ammoLoad` の合計）。→ §12.12 でセーブから外した。
- trade の旧 typed-repair（`repairTyped`）は機体を作り直すので、`currentAmmo` は未設定に、`battery` は 300／300 に戻る（旧コードは触らない方針。STATUS のバックログ）。

## 12.5a 置き去り機体（lostMechs）の保存対象と回収経路（2026-10-03 正本化）

- **Invade outing:** 未帰還の機体は `lostMechs` に保存する。置き去り時点の `instanceId` / `currentAmmo` / `battery` / `circuitIds` を保持し、Invade の盤上の同一地点に再出現可能とする。
- **Non-Invade outing:** 未帰還の機体は `lostMechs` に保存せず、**機体および装着回路を完全喪失**とする。これは RS-01「未帰還状態」の明示的な例外であり、Invade outing にのみ Abandoned の永続追跡を適用する。
- **Invade の再出現:** `lostMechs` の場所情報（`frontSeed` / `cell`）に基づき、Invade board 上で置き去り機を表示し、その地点から Explore に出撃できる。Explore 開始時に対象機体が再出現する。
- **回収:** Explore の離昇時に搭乗円内に再出現機がいれば回収する。回収成功時は `instanceId` / `currentAmmo` / `battery` / `circuitIds` を維持したまま `fleet` に戻し、`lostMechs` から削除する。
- **再置き去り:** 再出現した機体を回収しなかった場合、同じ `instanceId` の `lostMechs` 行をその時点の状態で更新する。行を重複追加しない。
- **通常 deploy:** `lostMechs` の機体は直接 deploy 対象ではない。回収成功後に通常の `fleet` へ戻り、通常の deploy 対象となる。
- **Wreck / Enemy:** Abandoned から Wreck / Enemy へ遷移する具体条件は本契約では定義しない。`battery.activity === 0` をその直接条件にはしない。
- **後方互換:** 場所や写しを持たない legacy row は、既存実装の後方互換処理に従う。Invade 側で必要な位置補完は実装済みルールとして扱い、新しい保存スキーマは追加しない。

#### HubSnapshot のトップレベル（`shared` `hub-save.ts`）

| フィールド | 型 | 既定・正規化 | 書くもの | PR |
|---|---|---|---|---|
| `inventoryFieldDrops` | `FieldInventoryDrop[]`：`{ dropId, frontSeed, cell, inventory: YieldBag, cause, droppedAt }` | 欠落は `[]`。`dropId` は `/^[a-zA-Z0-9_.:-]{1,160}$/`、`frontSeed` は uint32、`cell` は `FrontCellCoord`、`cause` は `FIELD_DROP_CAUSES` 以外なら `wreck_not_carried`、`droppedAt` が不正なら 1970-01-01。読めない要素・同じ `dropId` は 1 件ずつ捨てる。回路の `fieldDrops` とは別 | `applySortieReport`（帰還報告の `inventoryDrops`）。回収（`recoveredInventoryDropIds`）すると `inventory` に足して一覧から外す | #199 |
| `sortieSelection` | `string[]`（任意）：格納庫で選んだ出撃機の `instanceId` | 欠落は付けない（`undefined`）。正規化（`normalizeSortieSelection`）で `fleet` にいない ID・重複を除き、先頭から最大 3 件（`HUB_LIMITS.maxSortieMechs`）。**使う側は必ず shared `resolveSortieSelection(hub)` を通す**: 選択のうち出撃できる機体（`canDeploy`）を `fleet` の順に最大 3 機。選択がない（初回・旧セーブ）か、選んだ機体がどれも出撃できない（置き去りで `fleet` にいない・大破・要修理）ときは **`fleet` の先頭から出撃できる 3 機**。書くときは `setSortieSelection(hub, ids)`（出撃できる機体だけ・`fleet` の順・最大 3） | trade 格納庫（チェックボックス・「先頭から3機」・出撃リンク押下時に出撃した機体を保存）。Explore の「再出撃」と trade の出撃 URL はどちらもこの値を `resolveSortieSelection` で読む | 項目15 |
| `lostMechs` | `LostMechReturnState[]`：`{ instanceId, currentAmmo: number \| undefined, battery, circuitIds: string[] }` ＋任意（回収の 1 本目の PR）`frontSeed`（uint32）・`cell`（`FrontCellCoord`）・`lostAt`（ISO）・`lostSortieId`・`catalogId`・`durability`・`durabilityMax`・`status` | 欠落は `[]`。`instanceId` が空・重複、`battery.capacity` が 1 未満・数でない、`currentAmmo` が数でない行は 1 件ずつ捨てる。`currentAmmo` は切り捨て・0 以上（**上限 28 の丸めはしない**）。任意の項目は不正な値だけを 1 つずつ捨て、行は残す（古い行は任意の項目を持たないまま読み書きできる）。**`fleet` にいる機体の行は捨てる**（機体は 1 か所）。**`circuitIds` は毎回の正規化で「`equippedTo` がこの機体の回路」にそろえる**（行の順を先に、ほかのその回路を後ろに）。件数の上限はない | `applySortieReport`（帰還報告の `lostMechs`）。新しいものを先頭に足す。再び現れてまた置き去りになった機体は同じ項目を更新して先頭へ。回収（帰還の `recoveredLostMechInstanceIds`）で外して `fleet` に戻す | #206・回収の 1 本目 |

`applySortieReport`（`circuit-inventory.ts`）の追加の動き:

- `wreckedMechInstanceIds` の機体（`lostMechInstanceIds` に入っていないもの）は `fleet` に **残したまま** `durability 0`・`status "destroyed"` にする（#199）。
- `lostMechs` は、`fleet` にいて `lostMechInstanceIds`・`wreckedMechInstanceIds` に入っていない機体だけを受け付け、その機体を `fleet` から外して `hub.lostMechs` に記録する。`circuitIds` は `circuits` に実在する ID だけ残す。**回路の落とし物（`fieldDrops`）は作らない**。回路レコードは `circuits` に残り、**`equippedTo` は置き去りの機体のまま**（回収の 1 本目の PR。正規化 `enforceEquipIntegrity` は `lostMechs` の機体を指す回路を倉庫に戻さない。機体の回路枠・部隊の上限にも数えない）。その回路は格納庫で付け替え・取り外しできない（shared `equipCircuit` は `on_lost_mech` で断り、`unequipCircuit` は何もしない。`isCircuitOnLostMech`）。**HUB では所有から離れている扱い**（2026-10-03 神宮）: HubSave には残すが、trade の回路一覧・装備の選択肢・回路の枚数には出さず（shared `hubVisibleCircuits`）、売却・付け替え・取り外しは trade の処理でも断る。回路ボーナス（trade `hubCircuitBonuses`、Explore `invadeSquadSearch`：修理割引・作成倍率・耐久バッファ）にも数えない（`hubVisibleCircuits` から集計。パーフェクト最大サイズの記録は全回路を数える）。trade の出撃パネルに置き去りの数（「置き去り N 機（Invade の盤に表示）」、0 機なら出さない）。回収すると、その機体に付いたまま一覧・ボーナスに戻る。
- **場所・時刻・写し（回収の 1 本目の PR）**: 場所（行の `frontSeed`＋`cell`、なければ報告の `frontSeed`＋`cell`）がある行だけに `lostAt`（反映した時刻）・`lostSortieId`（その `sortieId`）と写し（`catalogId`・`durability`・`durabilityMax`・`status`。`fleet` の機体、再度の置き去りなら前の項目から）を付ける。`applyExploreReturnToHub` は写しの `durability` にその出撃の摩耗（`mechWear.durabilityAfter`）を当てる。場所がない行は従来の形のまま記録する（古い帰還 URL・古いセーブとの互換。**回収の 2 本目の PR 以降の Explore は場所のない行を送らない**: Invade を通った出撃は行に `frontSeed`＋`cell` を付け、Invade を通らない出撃は下の `abandonedMechInstanceIds` で機体を失う）。
- **Invade を通らない出撃での置き去り（回収の 2 本目の PR・#206 の残り）**: 帰還の `abandonedMechInstanceIds` にある機体を、`applyExploreReturnToHub` が報告の `lostMechInstanceIds`（`lostCause` は `left_behind`）として渡す。`cell: null` なので、その機体は `fleet` から外れ、`lostMechs` には残らず、装着していた回路は落とし物にも倉庫にもならずに `circuits` から消える（`lostForever`）。ほかの回路（倉庫・別の機体）は動かない。`sortieId` のある帰還だけで働く（今の Explore は常に載せる）。
- **回収（回収の 1 本目の PR）**: 帰還の `recoveredLostMechInstanceIds` にある機体を `recoverLostMechs` が `lostMechs` から外し、`fleet` の末尾に戻す（`applySortieReport` の最初。その後の摩耗・携行弾・バッテリーの書き戻しも当たる）。`instanceId`・`currentAmmo`・`battery` はそのまま、回路は `equippedTo` が残っているので装着したまま戻る。機体は写しから作る（`catalogId`・`durability`・`durabilityMax`。状態は耐久から決め直す）。**写しのない古い行は `mech_gen1`・耐久 41（健在の下限 `operationalMinDurability`、`LOST_MECH_RECOVERY_FALLBACK_DURABILITY`）で戻す**。`lostMechs` にない ID・`fleet` にいる ID は無視する。
  - **決定（2026-10-03 神宮）・shared 部分は回収の 1 本目の PR、Explore での再出現・回収は 2 本目、Invade の表示・再配置は 3 本目の PR で実装済み**: 置き去りの僚機の回路は落とし物（`fieldDrops`）にしない。回路は失われた機体（`lostMechs` の項目）に付いたままで、`circuitIds` も変えない。失われた機体が戻るのは、プレイヤーが World で見つけて回収したときだけ（回収の処理は Explore が持ち、今ある帰還の反映に乗せる）。自動で部隊に戻ることはない。回収したら `instanceId`・`currentAmmo`・`battery`・`circuitIds` をそのまま保ち、`lostMechs` から外す。再び現れて回収されなかった場合は、同じ `lostMechs` の項目を最新の状態で更新する。残骸化・敵化の条件は未定（バッテリーの活動量 0 はその条件ではない）。回収した機体は通常の部隊として出撃し、`lostMechs` の機体が直接出撃することはない。Explore での再出現・回収の細部は §12.6 末尾。
  - **足した項目（2026-10-03 決定・回収の 1 本目の PR で実装。上の表）**: 置き去りにした場所 `{ frontSeed, cell }`・`lostAt`・`lostSortieId`、部隊へ戻すための写し `catalogId`・`durability`・`durabilityMax`・`status`。Invade は `frontSeed` で絞って表示する。別の構造は作らない。`lostMechs` の機体は出撃の上限にも回路の上限にも数えない。
  - ~~**既知の食い違い**: 正規化で回路が倉庫に戻り、`lostMechs[].circuitIds` にも残る（回路の二重化）~~ → **回収の 1 本目の PR で修正**。**既存セーブの扱い**: 二重化していたセーブ（回路が `equippedTo: null` で倉庫にあり、行の `circuitIds` にも ID がある）は、**回路を今ある場所に残す**（倉庫のまま。プレイヤーが別の機体に付け直していればその機体のまま。売却済みなら ID だけ消える）。行の `circuitIds` からはその ID を外す。回路の数は変わらず、1 つの回路は倉庫・機体・置き去りの機体のどれか 1 か所にだけある。プレイヤーが倉庫で見て使えていた回路を取り上げないための選択。
  - ~~**残る既知の食い違い**: Invade を通らない出撃では、決定どおりなら置き去りの機体は `lostMechs` に残さず機体も回路も失うが、今は残している~~ → **回収の 2 本目の PR で解消**（上の `abandonedMechInstanceIds`）。この PR より前に Invade を通らない出撃で記録された場所のない行は、回収の 3 本目の PR 以降、Invade を開いたときに今の盤の開始地点へ置かれる（下の「Invade での表示・移動」）。
- **Invade での表示・移動（回収の 3 本目の PR。2026-10-03 神宮の決定。`invade/src/lost-mechs.ts`・`hub-persist.ts`）**:
  - Invade を開いたとき（盤の復元・新規作成とも）と盤を作り直したとき、`lostMechs` を今の盤に合わせて HubSave に書き戻す: 別の盤の `frontSeed` の行は同じ座標のまま `frontSeed` を今の盤の seed に書き換える（盤の作り直しで移す）。座標は盤の遊べる範囲（壁の内側、各座標 ±11）に収める。場所（`frontSeed`＋`cell`）のない行は今の盤の開始地点（HQ `{ sx: 0, sy: 0 }`）に置く（場所だけを付け、`lostAt`・写しは足さない）。回路の落とし物 `fieldDrops` と一般インベントリの落とし物 `inventoryFieldDrops` も同じルール（同じ座標、範囲外は範囲内へ）で `frontSeed`・`cell` を書き換える。
  - 盤では、今の盤の `frontSeed` の行がいるマスに印（右上の灰色の点。表示だけで、地雷・開閉の判定には関わらない。凡例に「置き去り機」の見本）を付け、ツールチップの末尾に「置き去り機 <ID>」（複数なら「置き去り機 N 機: <ID>, …」）を足す。印のあるマスを選ぶと出撃バーに「置き去り機 N 機：出撃して離陸すれば回収」。そこから出撃すれば Explore で再出現し、離昇時に搭乗円の内側にいれば回収される（§12.6 末尾）。回収した行は `lostMechs` から消えるので印も消える。
- `sortieId` がない・不正（`/^[a-zA-Z0-9_.:-]{1,64}$/` 以外）、または `appliedSortieIds` に既にあるときは何もしない（`applied: false`）。反映したら `appliedSortieIds` の末尾に足し、直近 20 件（`HUB_LIMITS.maxAppliedSortieIds`）に切り詰める。

### 12.6 受け渡し URL のキー（2026-10-01〜03 の追加）

**trade → explore**（`buildTradeToExploreUrl`／`parseTradeToExploreSearch`）:

| キー | 形 | 内容 |
|---|---|---|
| `mechCurrentAmmo` | `instanceId:弾数;instanceId:弾数`（`instanceId` はエンコードしない） | 出撃機のうち `currentAmmo` がある機体だけ。**このキーを載せるときは `startingAmmo` を載せない**（`startingAmmo` は `@deprecated`。キーがないときだけ従来どおり載せる） |
| `mechBattery` | `encodeURIComponent(instanceId):capacity:activity;…` | 出撃する全機体のバッテリー |

**explore → trade（帰還 URL。`hubWearHandoffUrl` → `buildExploreToHubWearUrl`／`parseExploreToHubWearSearch`）**。既存の `returnKind`・`mechWear` に加えて:

| キー | 形 | explore が今載せるか | trade の扱い |
|---|---|---|---|
| `sortieId` | `explore_<16進>`（出撃機・帰還の種類・経過ミリ秒・回収数・携行弾・出撃ごとの乱数 `World.sortieNonce` から FNV-1a ハッシュ） | 載せる | `applyExploreReturnToHub` で 1 回だけ反映（`appliedSortieIds` にあれば何もしない）。なければ従来どおり毎回摩耗などを反映 |
| `wreckedMechInstanceIds` | `id,id` | 載せる（帰還後の耐久が 0 以下の機体） | 大破で `fleet` に残す |
| `lostMechs` | JSON 配列（`LostMechReturnState`。任意の `frontSeed`・`cell`・`lostAt`・`lostSortieId`・写しも、値があるものだけ載る） | **Invade を通った出撃だけ**載せる（回収の 2 本目の PR）: 離昇時の置き去りの僚機（`instanceId` と受け取ったバッテリーがあるもの。回路 ID は出撃時に受け取った `mechCircuits` の全 ID）と、再出現したが回収しなかった機体（HubSave の行の値のまま）。どちらも `frontSeed`＋`cell` を付ける。`lostAt`・`lostSortieId`・写しは shared が付ける | `fleet` から外して `lostMechs` に記録（場所があれば時刻・写しも）。既にある行は同じ行を更新 |
| `recoveredLostMechInstanceIds` | `id,id` | 載せる（回収の 2 本目の PR。離昇時に搭乗円の内側にいた再出現機） | `lostMechs` から外して `fleet` に戻す（`recoverLostMechs`） |
| `recoveredDropIds` | `id,id` | 載せる（F の回収。離昇時に搭乗円の内側にいた落とし物の回路） | `fieldDrops` から外して `circuits` に `equippedTo: null` で戻す（`recoverFieldDrops`。既に持っている `circuitId` は場に残す） |
| `abandonedMechInstanceIds` | `id,id` | 載せる（回収の 2 本目の PR。**Invade を通らない出撃**で離昇時に置き去りにした僚機） | 機体と装着していた回路を失う（`lostMechs` に残さない、倉庫に戻さない。§12.5） |
| `frontSeed` | 非負整数 | **Invade を通った出撃だけ**載せる（`dropCell` と両方あるときだけ） | 背負えなかった大破機の回路を、この盤の `fieldDrops` にする |
| `dropCell` | `sx,sy`（整数。絶対値 32 以下） | 同じ。片方だけでは載せない。読んだときも片方が欠けていれば無視する | 出撃マス |
| `mechCurrentAmmo` | trade → explore と同じ形 | 載せる（出撃した全機体。未設定で出撃した機体も満タンからの残り） | 機体の `currentAmmo` に書き戻す（携行弾の修正・trade） |
| `mechBattery` | trade → explore と同じ形 | 載せる（U9 以降。出撃時に受け取ったバッテリーをそのまま返す。explore は今バッテリーを消費しない。受け取っていない機体は載せない＝既定の 300/300 を作らない） | 機体の `battery` に書き戻す |
| `inventoryDrops` | JSON 配列（`FieldInventoryDrop`） | 載せない（今の Explore には表せる一般インベントリの落とし物がない。#199 の PR 本文） | `inventoryFieldDrops` に追加 |
| `recoveredInventoryDropIds` | `id,id` | 載せない | `inventoryFieldDrops` から回収 |
| `rescueFee` | 非負整数 | 救助のときだけ載せる。ボタンの救助撤退と全滅は `floor(所持金 / 2)`（項目5-2）。隊長が大破した時間切れは `floor(所持金 × 3 / 4)`（項目5-2b。同じキー）。0 も載せる。隊長が生きている時間切れは載せない | `applyExploreReturnToHub` が `sortieId` ごとに 1 回だけ `credits` から引く（所持を超えない。0 は引かない） |

- trade の帰還の反映（と Explore の直接保存。どちらも `applyExploreReturnToHub`）は、帰還に `frontSeed` と `cell`（`dropCell`）が両方あるとき、背負えなかった大破機の装着回路をそのマスの `fieldDrops` にする（下）。片方でも欠ける出撃では、その回路は落とし物にも倉庫にもならず失う（U7）。帰還の `recoveredDropIds` は `recoverFieldDrops` で倉庫（`equippedTo: null`）に戻す。既に持っている `circuitId` は場に残す。`acquiredCircuits` はまだ空。`lostMechInstanceIds` は帰還の `abandonedMechInstanceIds`。
- **背負えなかった大破機の回路**: `wreckedMechInstanceIds` のうち `lostMechs` に入っていない機体の装着回路。背負って帰る処理は未実装なので、置き去りでない大破はすべてこれにあたる。`cause` は `wreck_not_carried`。機体そのものは `destroyed`・耐久 0 で `fleet` に残す（#199）。同時に置き去り（`lostMechs`）なら、回路は落とさずその機体に付いたまま。結果画面は、マスがあれば「前線マス (x, y) に落ちた」、なければ「失われた」と出す。
- `HANDOFF_QUERY_KEYS.exploreToHubWear` は `returnKind`・`mechWear`・`mechCurrentAmmo`・`recoveredLostMechInstanceIds`（回収の 1 本目の PR で追加）・`abandonedMechInstanceIds`（2 本目で追加）・`recoveredDropIds`（F の回収で追加）・`frontSeed`・`dropCell`・`rescueFee`（項目5-2）。trade が取り込んだ後に URL から消すのはこれら（と他の受け渡しのキー）なので、`sortieId` などは URL に残る（`returnKind`・`mechWear` が消えるので再読み込みで再反映はされない）。`tradeToExplore` にも `mechBattery` は入っていない。
- **直接保存（U9、設計 §5.4・§9 U9）**: Explore は結果画面を最初に描くとき（どの結果ボタンを押すより前）に、この帰還と同じ内容を HubSave に書く（`explore/src/game/hubDirectSave.ts`）。「Sort へ」「再出撃」「格納庫へ」のどれを選んでも、大破・置き去り（`lostMechs`）・摩耗・携行弾・バッテリーは 1 回だけ記録される。HubSave がない（ローカル開発で explore :5173 と trade :5175 の `localStorage` が別、または Explore を直接開いた）ときは書かず、「格納庫へ」の帰還 URL で trade が反映する。
- trade は帰還 URL を開いたとき、Explore が保存済みの帰還（`sortieId` が `appliedSortieIds` にある）なら再適用せず「探索帰還 … · 反映済み（Explore が出撃終了時に保存）」と出す。帰還 URL だけの場合（旧来・ローカル開発）は 1 回だけ反映する。
- **再出撃（2026-10-03 参謀の決定・案 A）**: 結果画面の「再出撃」は、直接保存した HubSave から部隊を組み直す（`explore/src/game/resortie.ts`）。出撃機は「前回の出撃機のうちまだ出撃できる機体」（`canDeploy`。置き去りの機体は `fleet` にいない、大破は `destroyed`）で、保存した携行弾・耐久・バッテリーを使う。回路と回路ボーナス・Invade のセクターは前回の出撃 URL から引き継ぐ（前回の出撃にいなかった機体＝回収したばかりの機体や新しく選んだ機体の回路は HubSave の装着から載せる。回収の 2 本目の PR）。出撃できる機体がいなければ再出撃せず結果画面に注記を出す。HubSave にこの帰還がないとき（保存できなかった）は、前回の出撃 URL の機体に同じ帰還をメモリ上で当てて組み直す。**項目15（2026-10-03）以降、HubSave から組み直すときの出撃機は格納庫の選択**（`sortieSelection` を `resolveSortieSelection` で解決した機体。§12.5）で、格納庫に表示される選択と同じになる（`resortiePlan`）。置き去り（`fleet` にいない）・大破・要修理の機体は除き、選んだ機体がどれも出撃できなければ先頭から出撃できる 3 機。trade の出撃リンクは押したときに出撃した機体を `sortieSelection` に保存するので、通常は「前回の出撃機のうちまだ出撃できる機体」と一致する。HubSave にこの帰還がないときは従来どおり前回の出撃 URL の機体。
- **Invade の盤（回収の 3 本目の PR）**: Invade は URL のキーを足していない。置き去り機の印・移動は HubSave の `lostMechs`・`fieldDrops`・`inventoryFieldDrops` を直接読み書きする（§12.5「Invade での表示・移動」）。
- **Explore での置き去り・再出現・回収（回収の 2 本目の PR。`explore/src/game/lostMechs.ts`・`invadeSquad.ts`・`outcome.ts`）**:
  - **出撃の場所**: Invade のセクター（`sectorX`・`sectorY`）があり、HubSave に `frontProgress.seed` があるときだけ、その出撃は「Invade を通った出撃」（`World.sortieLocation = { frontSeed, cell }`。`cell` は `FrontCellCoord` の範囲 ±32）。Invade の Explore リンクには seed が載らないので、`frontSeed` は出撃時の HubSave から取る。それ以外（格納庫からの直接出撃・HubSave がない）は場所なし。
  - **Invade からの出撃も部隊を連れて出る**（項目15 の決定）: Invade のリンクはセクターだけで出撃機のキーを持たないので、Explore は出撃キーがないときに HubSave から trade の出撃リンクと同じ形で組む（`invadeSquadSearch`: `resolveSortieSelection` の機体・携行弾・耐久・バッテリー・装着回路・回路ボーナス（置き去り機の回路は除く）。セクターなど元のキーは残す）。これがないと Invade からの出撃に `instanceId` がなく、置き去りを記録できない。
  - **再出現**: 出撃開始時（最初の出撃・再出撃とも）に、HubSave の `lostMechs` のうち `frontSeed` と `cell` が同じで出撃機でない行を、降下地点（隊長の初期位置）から半径 70 の円周上に止まった機体として置く（`World.strandedMechs`。搭乗円の半径は 110 なので、降下地点で回収を要請すれば内側に入る）。
  - **回収**: 離昇時（隊長が搭乗している＝離昇が成立したとき）に、再出現機のうち搭乗円の内側にいるものを回収する（`World.recoveredLostMechIds` → 帰還の `recoveredLostMechInstanceIds`）。撤退・全滅では回収しない。回収した機体は HubSave の行の写し・携行弾・バッテリー・回路のまま `fleet` に戻る（§12.5）。
  - **回収しなかった再出現機**: 出撃が終わったとき（離昇・撤退・全滅とも）に、その行を帰還の `lostMechs` に同じ場所で載せ直す。shared が同じ `instanceId` の行を `lostAt`・`lostSortieId` 付きで更新するので、行は増えない。
  - **置き去り**: Invade を通った出撃では帰還の `lostMechs`（場所付き）、通らない出撃では `abandonedMechInstanceIds`。結果画面にどちらになったか（「前線マス (x, y) に残る」／「回路ごと失われる」）と、再出現機を回収したかを出す。
- **Explore での落とし物の再出現・回収（F の回収。`explore/src/game/circuitDrops.ts`・`outcome.ts`）**:
  - **再出現**: 出撃開始時に、HubSave の `fieldDrops` のうち今の出撃マス（`frontSeed` と `cell`）のものを降下地点の近傍（半径 55 の円周上）に出す（`World.strandedDrops`）。別マスの落とし物は出さない。URL キーは足さず HubSave を読む（U19）。
  - **回収**: 離昇時（隊長搭乗）に、搭乗円の内側にある落とし物を回収（`World.recoveredDropIds` → 帰還の `recoveredDropIds`）。
  - **反映**: 直接保存と帰還 URL の両方で `applyExploreReturnToHub` が `recoverFieldDrops` を実行し、回収した回路を `circuits` に `equippedTo: null`（倉庫）で戻す。既に同じ `circuitId` を持っている場合は場に残り、倉庫には戻らない。
  - **結果画面**: 倉庫へ戻した回路だけを出す（既に持っていて場に残ったものは出さない）。
- **出撃 URL（項目15）**: trade の出撃 URL（`deployedInstanceIds`・`mechDurability` など）には選んだ出撃機（最大 3 機）だけを載せる。摩耗・携行弾・バッテリーの書き戻しも、帰還に載った機体（＝出撃した機体）だけに当たる。

### 12.7 explore での使い方（#203・#206・携行弾の修正・U9）

- `World.currentAmmo: Record<instanceId, number | undefined>` は出撃時（`createWorld`）に出撃機ごとに作る。（2026-10-12 以降、HubSave の正規化が欠落を満タンで書くので、通常は値がある。出撃中の上限は基礎 28 × 銃の回路 × 解放の倍率で、上限を超える分は `circuitPlay.ammoFloor` として撃たずに持ち帰る。捨てない。§12.5「携行弾の配り方」）`mechCurrentAmmo` に値がある機体はその値（0 なら撃てない）。**値がない機体は満タン `MECH_AMMO_BASE_CAPACITY`（28）にする**（携行弾の修正（explore、#208）。**暫定ルール（2026-10-03 参謀の決定。神宮の経済タスクでの決定待ち）**。設計は [`MECH_FLEET.md`](./MECH_FLEET.md) §4.1）。`startingAmmo` は `World.ammoStock`（HUB の共有在庫の写し）にだけ入り、射撃では減らない。
- 射撃は撃った機体の `currentAmmo` だけを 1 減らす。`currentAmmo` が 0 以下の機体は撃たない（`sim.ts` `tryFire`）。修正前（#203〜携行弾の修正）は、trade が `currentAmmo` を設定しないため出撃 URL に `mechCurrentAmmo` が載らず、未設定の機体が撃てなかった（2026-10-03 に手元で確認。explore の selftest で、d6ca6ff の trade が出す出撃 URL そのものと shared の URL 生成の両方から、隊長機・僚機が射程内の敵を撃てることを固定した）。
- `World.mechBattery` は `mechBattery` の写しで、`lostMechs` の記録と帰還の `mechBattery`（U9）に使う。`World.circuitIdsByUnit` は `mechCircuits` の全回路 ID（状態を問わない）をユニットごとに持ち、`lostMechs.circuitIds` に使う。効果の判定は従来どおり `equippedByUnit`（FA・Bypass だけ）。

### 12.8 置き去り機体の再出現・回収（2026-10-03 正本化）

RS-01 の例外として、置き去り機体の扱いは出撃経路で分かれる。

- **Invade を通った出撃:** 未帰還の僚機は `lostMechs` に保存する。保存した機体は、同じ `frontSeed`＋`cell` の Invade 盤から再び出撃したときに World へ再出現する。プレイヤーが回収しないまま出撃を終えた場合は、同じ `lostMechs` の項目をその時点の状態で更新する。
- **回収:** Explore の離昇時に、再出現した置き去り機体が搭乗円内にあれば回収する。回収成功時は `instanceId`・`currentAmmo`・`battery`・`circuitIds` を保持したまま `fleet` に戻し、`lostMechs` から削除する。回収した機体は通常 fleet と同じ deploy 対象になる。
- **Non-Invade 出撃:** 未帰還機体は `lostMechs` に保存せず、機体そのものを完全喪失とする。装着回路も回収可能な状態として残さない。したがって後から Invade で再出現・回収することはできない。
- **直接 deploy 禁止:** `lostMechs` の機体を直接 deploy 対象にはしない。Invade で再出現し、Explore の回収処理を経て fleet に戻った後に deploy 可能となる。
- **legacy row:** 古い `lostMechs` 行など場所情報を持たない互換データは、Invade を開いた際に現在の盤の開始地点へ配置して場所情報を補完する。これは後方互換処理であり、新しい置き去り状態を推測する仕様ではない。
- **Wreck / Enemy:** Abandoned から Wreck / Enemy へ遷移する具体条件は本契約では定義しない。Battery Activity=0 を直接条件にも使わない。

### 12.9 回路の効果のキー（#270、Issue #269・2026-10-12 神宮の決定）

保存キーは増やさず、`HubSnapshot` に任意のキーを 2 つ足した。`v` は 3 のまま。古いセーブは、キーが無くてもそのまま読める（selftest `circuit-compat.selftest.ts`）。

| フィールド | 型 | 既定・正規化 | 書くもの |
|---|---|---|---|
| `airSupportCooldownSec` | `number`（任意） | 欠落・数でない・0 以下は **付けない**（読むと 0、`readAirSupportCooldownSec`） | Explore の航空支援（使った瞬間に 200 を書く）と、帰還の直接保存（`applyCircuitHubSide`。出撃中に減った残りを書き、0 になったら消す）。拠点にいるあいだは減らない |
| `bulletinUnlocked` | `true`（任意） | 欠落・`true` 以外は **付けない**（読むと false、`readBulletinUnlocked`）。20×20 の真盤（`fully_awakened`）が `circuits` にあれば正規化で `true` を付ける | 正規化（本作のクリア） |

- `circuits[].effectKey`: 2×2〜19×19 の導通した回路（効果値 > 0）に、正規化（`assignMissingEffectKeys`、`createHubSave` も通る）で一度だけ付ける。偽盤は通常行動、真盤は小隊行動の値。付いたキーは引き直さない。ただし盤の種類に合わないキー（Restore で偽盤が真盤になった回路の通常行動のキー）は、次の正規化で一度だけ小隊行動から選び直す（`keyMatchesBoard`）。値の一覧は `shared` `circuit-actions.ts` の `FALSE_BOARD_EFFECT_KEYS`・`TRUE_BOARD_EFFECT_KEYS`。
- 偽の 1×1（`makeFalseOneByOne`）は、隊長（`fleet[0]`）に回路が 1 枚も無いときだけ、格納庫の装備画面と Explore の出撃準備で付ける（`ensureCaptainFalseOneByOne`、Q2）。付いている回路は動かさない。
- 5-3 の途中保存（`estg.sortieCheckpoint`）は HubSave とは別のキーで、変えていない。途中保存の `World` に入る `circuitPlay` は、読み直すときに霧の配列（`fogOpen`）を作り直す。`circuitPlay` の無い古い途中保存もそのまま読める。

### 12.10 初クリアのキー（#272、2026-10-12 神宮の Go・S1〜S3）

保存キーは増やさず、`HubSnapshot` に任意のキーを 1 つ足した。`v` は 3 のまま。

| フィールド | 型 | 既定・正規化 | 書くもの |
|---|---|---|---|
| `firstInvadeClear` | `{ boardSeed: number \| null; at?: string }`（任意） | 欠落・`null`・`false` は **付けない**（未クリア）。それ以外の値（壊れた形・`true` など）はクリア済みとして `{ boardSeed: null }` に直す（再付与を防ぐ）。`boardSeed` は uint32、`at` は ISO 文字列（40 字まで） | Invade（`hub-persist.ts` `persistFrontSessionWithClear`）。盤が sectorCleared に**変わった**操作の保存でだけ、`recordFirstInvadeClear` で記録する |

- S2: キーの無いセーブは未クリア。盤の様子（保存済みの盤が掃討済み・出撃の帰還の `invadeSector`・intel の `sectorCleared`・`frontProgress` の開いたマス・`bulletinUnlocked`）からは推測しない。読み込んだ時点で掃討済みの盤は数えず、次に盤を掃討したときに記録する（#271 の照合結果を取り込み）。
- 記録と同じスナップショットで、未修復の「4」の 1×1 を倉庫に 1 枚入れる（`circuitId` `true-1x1`、`circuitBoard.puzzleId` `true-1x1-four`、`restoreState` `unrestored`、`origin` `picked_up`、`equippedTo` null、`locked` なし）。キーがあれば何もしない（二度目の掃討・読み直し・二重の保存・古い写しの適用でも増えない。「4」を売っても再付与しない）。すでに「4」を持つセーブ（テスト用の直った形を含む）には 2 枚目を入れない。
- `true-1x1-four` の盤は 1×1・数字 4（`resolveTrueBoardClues`）。Restore で 4 辺の閉ループにすると Fully Awakened ＋ Perfect で刻印ロックになり、そこで初めて真の 1×1（枠 +1・`wing_mobility` など）として数える。
- S1: 真盤の率（`resolvePerfectCircuitInjectRate`）は、このキーが無いあいだ 0。`?perfectRate=` の指定だけは効く（デバッグ用）。
- 5-3 の途中保存（`estg.sortieCheckpoint`）・回路・残骸（`lostMechs` の `kind: "wreck"`）は変えていない。selftest: `shared` `first-clear.selftest.ts`、`invade` `first-clear.selftest.ts`。

### 12.11 進むと開く（PR-B、2026-10-12 神宮の Go）

HubSave のキーは増やしていない（`v` は 3 のまま）。

- 公開プレビューの既定の切り替えは Explore のローカル設定 `estg.explore.debugCommandUnlockMode`（HubSave の外）。未設定・不正値は `release`、`"all_unlocked"` だけ全解放。
- 9 つの能力の倍率は出撃中だけの値で、HubSave に書かない。最大弾数の 0.5 倍で撃てない分は機体の `currentAmmo` に残して持ち帰る。最大活動量の 0.5 倍は `battery.capacity` に書かない。最大耐久は耐久（`durability`）の計算に入らない。
- 5-3 の途中保存（`estg.sortieCheckpoint`）: 書く中身（`World.circuitPlay`）に `ability`・`wingMove`・`ammoFloor` が増えた（キーは変えない）。PR-B より前の途中保存はこの 3 つが無く、読み直しで `backfillCircuitPlayState` が作る（倍率は保存済みの装備から、移動の命令は無し、撃てない分は最初の 1 歩で計算し直す）。`circuitPlay` 自体が無い途中保存も今までどおり読める。
- `hub.bulletinUnlocked` を格納庫に 1 行「掲示板が開いた」として出す（無いセーブは false で出さない）。
- 回路・残骸（`lostMechs` の `kind: "wreck"`）は変えていない。selftest: `explore` `releaseProgress.selftest.ts`（古い HubSave＝回路と残骸付きの往復と出撃、PR-B 前の途中保存の読み直し）、`trade` `hangar.selftest.ts`。

### 12.12 資材と旧キーの廃止（fix/hub-save-legacy-retire、2026-10-12 神宮 Q1 = C）

正式な資源は 弾薬 `inventory.ammo`・装甲パーツ `inventory.armor`・電力パーツ `inventory.power`・ジャンク `inventory.junk` の 4 つだけ。

1. **セーブから外したキー:** `materials`・`importedMaterials`・`ammoLoad`・`selectedMechId`・`selectedAmmoId`・`inventoryFieldDrops`。v3 の正規化は知っているキーだけを返すので、古いセーブは今までどおり読めて、次の保存でこのキーが消える。**変換はしない**（`materials` をジャンクに、`ammoLoad` を `inventory.ammo` に足すことはしない）。v1/v2 の読み込み（移行）はそのまま。上の「旧キーは残す」の記述（§12.5 の `ammoLoad` など）はこれで上書き。初期値の資材 250・デモの 200 は削除。
2. **Invade からの出撃:** `startingAmmo` は `inventory.ammo`（Trade からの出撃 F1 と同じ）。
3. **解体:** 今までの資材と同じ数のジャンクを受け取る（健在 40c／ジャンク 15、要修理 20c／10、大破 10c／5、第2世代は +10c／+5）。ログは「解体 id → +Xc / ジャンク +N」。古いログ「+Nm」も履歴に出る。
4. **表示:** 格納庫の所持欄・Sort の結果画面・帰還の成果は 4 資源だけ。「資材」と「搬入 n」は出さない。
5. **Sort→HUB の URL:** いつも `fromSort=1` を付け、`importMaterials` は付けない。Trade（と途中保存の完了判定 `sortie-checkpoint.ts`）は `fromSort`・`yieldBag`・`depositUnopenedContainers`・古い `importMaterials` のどれかで Sort からの帰還と読む。古い `importMaterials` の数は何も付与しない。二重受け取りの防止は `handoffId`。`importMaterials` だけの古い URL は完了の印も付けない（古い URL で 1 以上なら `yieldBag` も載っていたので、完了の判定は新旧で同じ）。
6. **shared から外したもの:** `importMaterialsIntoHub`・`importedMaterialsFromResult`・回路の資材の修理割引 `applyRepairDiscountToCost`。食料→弾薬の対応は残す。帰還報告の `inventoryDrops`・`recoveredInventoryDropIds` は読み捨てる。

互換テスト: shared `legacy-retire.selftest.ts`（1〜5・7〜10・12）、explore `selftest.ts`（6）、trade `legacy-retire.selftest.ts`（7〜9・11、古い履歴）。
