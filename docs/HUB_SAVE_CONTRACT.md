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
| `materials` | number | 所持資材 |
| `fleet` | `MechId[]` | 配備済み機体（最大3） |
| `ammoLoad` | `Record<AmmoId, number>` | 弾種別所持 |
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
- `fleet` は既知 `MechId` のみ、長さ ≤ `maxMechs`（**2026-10-03 撤廃を決定**。`maxMechs` と読み込み時の切り詰めを消す。実装は未着手、[`STATUS.md`](./STATUS.md) 項目15）  
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

- `circuits[]` の各要素（`HubCircuitRecord`）に `restoreState`（`unrestored`／`fully_awakened`／`bypass`／`offline`）、`origin`（`crafted`／`bought`／`enemy_drop`／`picked_up`／`legacy`）、`equippedTo`（`OwnedMech.instanceId` または `null`＝倉庫）、任意の `acquiredAt`・`effectKey`（予約）。
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

`HubSaveV3`（`v: 3`・キー `wreckline.hubSave.v3`）のまま、任意フィールドを加算した。版もキーも変えていない。ここではコード（main `d6ca6ff` に携行弾の修正（explore、#208）と携行弾の修正（trade、#209）を入れた後）がしていることを書く。反映経路（U9）は **2026-10-03 に神宮が「Explore が出撃終了時に HubSave へ直接書く」と決定、実装は別 PR**（[`CIRCUIT_DATA_MODEL_V0.md`](./CIRCUIT_DATA_MODEL_V0.md) §5.5）。下の帰還 URL の記述は、その PR までの動き。

#### 機体ごと（`fleet[]` の `OwnedMech`。`shared` `mech-fleet.ts`）

| フィールド | 型・範囲 | 既定・正規化 | PR |
|---|---|---|---|
| `currentAmmo?` | 整数 0〜28（`MECH_AMMO_BASE_CAPACITY = 28`）。`instanceId` ごとの携行弾 | **保存上の欠落は `undefined` のまま**（旧セーブの機体・`createOwnedMech` で `currentAmmo` を渡さずに作った機体。一度も出撃・帰還していない機体）。値があれば `normalizeCurrentAmmo` で切り捨て・0〜28 に収める（数でなければ 0）。**未設定の機体は出撃時に満タン（28）として扱う（暫定ルール、12.7）**。旧来の `startingAmmo`／`ammoLoad` から機体ごとに配る本ルールは神宮が経済タスクで決める | #201・携行弾の修正 |
| `battery` | `{ capacity: number; activity: number }`。`capacity` は 1 以上の整数、`activity` は 0〜`capacity` の整数 | 欠落・不正は `capacity 300`／`activity 300`（`MECH_BATTERY_DEFAULT_*`）。`normalizeBattery` で切り捨て・範囲内に収める。新しく作る機体も 300／300 | #204 |

- HUB の `ammoLoad`（弾種別の所持）は **共有在庫のまま**。`currentAmmo` は `ammoLoad` に入れない。
- trade は帰還の反映時に、帰還 URL の `mechCurrentAmmo`・`mechBattery` を該当する機体の `currentAmmo`・`battery` に書き戻す（携行弾の修正（trade、#209）。`applyReturnedMechState`。0 も 0 として書く。報告にない機体は変えない）。`sortieId` が既に `appliedSortieIds` にある帰還は従来どおり無視するので、古い URL を開き直しても新しい値を上書きしない。書き戻した値は次の出撃 URL（`buildTradeToExplorePayloadFromFleet`）の `mechCurrentAmmo`・`mechBattery` でそのまま送られる。
- trade の旧 typed-repair（`repairTyped`）は機体を作り直すので、`currentAmmo` は未設定に、`battery` は 300／300 に戻る（旧コードは触らない方針。STATUS のバックログ）。

#### HubSnapshot のトップレベル（`shared` `hub-save.ts`）

| フィールド | 型 | 既定・正規化 | 書くもの | PR |
|---|---|---|---|---|
| `inventoryFieldDrops` | `FieldInventoryDrop[]`：`{ dropId, frontSeed, cell, inventory: YieldBag, cause, droppedAt }` | 欠落は `[]`。`dropId` は `/^[a-zA-Z0-9_.:-]{1,160}$/`、`frontSeed` は uint32、`cell` は `FrontCellCoord`、`cause` は `FIELD_DROP_CAUSES` 以外なら `wreck_not_carried`、`droppedAt` が不正なら 1970-01-01。読めない要素・同じ `dropId` は 1 件ずつ捨てる。回路の `fieldDrops` とは別 | `applySortieReport`（帰還報告の `inventoryDrops`）。回収（`recoveredInventoryDropIds`）すると `inventory` に足して一覧から外す | #199 |
| `lostMechs` | `LostMechReturnState[]`：`{ instanceId, currentAmmo: number \| undefined, battery, circuitIds: string[] }` | 欠落は `[]`。`instanceId` が空・重複、`battery.capacity` が 1 未満・数でない、`currentAmmo` が数でない行は 1 件ずつ捨てる。`currentAmmo` は切り捨て・0 以上（**上限 28 の丸めはしない**）。`circuitIds` は重複と空を除く。件数の上限はない | `applySortieReport`（帰還報告の `lostMechs`）。新しいものを先頭に足す | #206 |

`applySortieReport`（`circuit-inventory.ts`）の追加の動き:

- `wreckedMechInstanceIds` の機体（`lostMechInstanceIds` に入っていないもの）は `fleet` に **残したまま** `durability 0`・`status "destroyed"` にする（#199）。
- `lostMechs` は、`fleet` にいて `lostMechInstanceIds`・`wreckedMechInstanceIds` に入っていない機体だけを受け付け、その機体を `fleet` から外して `hub.lostMechs` に記録する。`circuitIds` は `circuits` に実在する ID だけ残す。**回路の落とし物（`fieldDrops`）は作らない**。回路レコードは `circuits` に残り、装着先の機体が `fleet` にないので、正規化（12.3「`equippedTo` が存在しない機体 → 倉庫へ」）で倉庫（`equippedTo: null`）に戻る（#206）。
  - **決定（2026-10-03 神宮）・実装は未着手**: 置き去りの僚機の回路は落とし物（`fieldDrops`）にしない。回路は失われた機体（`lostMechs` の項目）に付いたままで、`circuitIds` も変えない。失われた機体が戻るのは、プレイヤーが World で見つけて回収したときだけ（回収の処理は Explore が持ち、今ある帰還の反映に乗せる）。自動で部隊に戻ることはない。回収したら `instanceId`・`currentAmmo`・`battery`・`circuitIds` をそのまま保ち、`lostMechs` から外す。再び現れて回収されなかった場合は、同じ `lostMechs` の項目を最新の状態で更新する。残骸化・敵化の条件は未定（バッテリーの活動量 0 はその条件ではない）。回収した機体は通常の部隊として出撃し、`lostMechs` の機体が直接出撃することはない。World での発見・回収の処理は未実装。
  - **足す予定の項目（2026-10-03 決定・未実装）**: 置き去りにした場所 `{ frontSeed, cell }`・`lostAt`・`lostSortieId`、部隊へ戻すための写し `catalogId`・`durability`・`durabilityMax`・`status`。Invade は `frontSeed` で絞って表示する。別の構造は作らない。`lostMechs` の機体は出撃の上限にも回路の上限にも数えない。
  - **既知の食い違い**: 上の正規化で回路が倉庫に戻る今の動きは、この決定（回路は失われた機体に付いたまま）と食い違う。`lostMechs[].circuitIds` には ID が残るので、同じ回路が倉庫にも失われた機体にもあるように見える。回収の実装（U9 の後）と一緒に直す（それまで未修正）。Invade を通らない出撃では、決定どおりなら置き去りの機体は `lostMechs` に残さず機体も回路も失うが、今は残している（これも既知の食い違い。[`CIRCUIT_DATA_MODEL_V0.md`](./CIRCUIT_DATA_MODEL_V0.md) §5.6）。
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
| `sortieId` | `explore_<16進>`（出撃機・帰還の種類・経過ミリ秒・回収数・携行弾から FNV-1a ハッシュ） | 載せる | あれば `applySortieReport` を呼ぶ（なければ従来どおり摩耗だけ反映） |
| `wreckedMechInstanceIds` | `id,id` | 載せる（帰還後の耐久が 0 以下の機体） | 大破で `fleet` に残す |
| `lostMechs` | JSON 配列（`LostMechReturnState`） | 載せる（離昇時の置き去りの僚機で、`instanceId` と受け取ったバッテリーがあるもの。回路 ID は出撃時に受け取った `mechCircuits` の全 ID） | `fleet` から外して `lostMechs` に記録 |
| `mechCurrentAmmo` | trade → explore と同じ形 | 載せる（出撃した全機体。未設定で出撃した機体も満タンからの残り） | 機体の `currentAmmo` に書き戻す（携行弾の修正・trade） |
| `mechBattery` | trade → explore と同じ形 | **載せない**（explore は今バッテリーを消費しない） | 載っていれば機体の `battery` に書き戻す（携行弾の修正・trade）。explore が載せるのは U9 の PR 以降の予定 |
| `inventoryDrops` | JSON 配列（`FieldInventoryDrop`） | 載せない（今の Explore には表せる一般インベントリの落とし物がない。#199 の PR 本文） | `inventoryFieldDrops` に追加 |
| `recoveredInventoryDropIds` | `id,id` | 載せない | `inventoryFieldDrops` から回収 |

- trade の帰還の反映では `cell: null`・`frontSeed: null`・`lostMechInstanceIds: []`・`recoveredDropIds: []`・`acquiredCircuits: []` を固定で渡す。回路の落とし物の作成・回収（実装 F の残り）はまだない。
- `HANDOFF_QUERY_KEYS.exploreToHubWear` は `returnKind`・`mechWear`・`mechCurrentAmmo` だけ。trade が取り込んだ後に URL から消すのはこの 3 つ（と他の受け渡しのキー）なので、`sortieId` などは URL に残る（`returnKind`・`mechWear` が消えるので再読み込みで再反映はされない）。`tradeToExplore` にも `mechBattery` は入っていない。
- この経路（帰還 URL を trade が読んで HubSave に反映）は、設計 §5.4・§9 U9 の「explore が結果確定時に HubSave へ直接反映」と異なる。**2026-10-03 に神宮が設計どおり（Explore が出撃終了時に直接書く）と決定。実装は携行弾の修正の後の別 PR**（trade の書き戻しもそちらへ移す。帰還 URL は互換のため読めるまま残してよい）。[`CIRCUIT_DATA_MODEL_V0.md`](./CIRCUIT_DATA_MODEL_V0.md) §5.5。

### 12.7 explore での使い方（#203・#206・携行弾の修正）

- `World.currentAmmo: Record<instanceId, number | undefined>` は出撃時（`createWorld`）に出撃機ごとに作る。`mechCurrentAmmo` に値がある機体はその値（0 なら撃てない）。**値がない機体は満タン `MECH_AMMO_BASE_CAPACITY`（28）にする**（携行弾の修正（explore、#208）。**暫定ルール（2026-10-03 参謀の決定。神宮の経済タスクでの決定待ち）**。設計は [`MECH_FLEET.md`](./MECH_FLEET.md) §4.1）。`startingAmmo` は `World.ammoStock`（HUB の共有在庫の写し）にだけ入り、射撃では減らない。
- 射撃は撃った機体の `currentAmmo` だけを 1 減らす。`currentAmmo` が 0 以下の機体は撃たない（`sim.ts` `tryFire`）。修正前（#203〜携行弾の修正）は、trade が `currentAmmo` を設定しないため出撃 URL に `mechCurrentAmmo` が載らず、未設定の機体が撃てなかった（2026-10-03 に手元で確認。explore の selftest で、d6ca6ff の trade が出す出撃 URL そのものと shared の URL 生成の両方から、隊長機・僚機が射程内の敵を撃てることを固定した）。
- `World.mechBattery` は `mechBattery` の写しで、今は `lostMechs` の記録にだけ使う。`World.circuitIdsByUnit` は `mechCircuits` の全回路 ID（状態を問わない）をユニットごとに持ち、`lostMechs.circuitIds` に使う。効果の判定は従来どおり `equippedByUnit`（FA・Bypass だけ）。
