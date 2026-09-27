# 回路データモデル・保存契約・受け渡し 設計 v0

**ステータス:** **承認済み（2026-09-28、神宮）** / 実装: A（shared の保存契約 v3）済み、B〜G は未実装。起草は Cursor（Grok Bot）。契約変更（`HUB_SAVE_CONTRACT` の版上げ、URL キーの追加）を含む。実装は §8 の A〜G の順。§9 の U1〜U19 はすべて決定済み（U7 は神宮の決定、ほかは起草時の推奨どおり）。  
**対象:** [`STATUS.md`](./STATUS.md)「回路・部隊設計 v0 由来の仕様変更」の **項目1**（回路のデータモデル）・**項目2**（モジュール間の受け渡し形式の変更）・**項目14**（パーフェクト最大サイズの記録とジャンク作成サイズ上限）をまとめて設計する。  
**性質:** 本書は承認済みの設計。ゲームの決定事項の正本は [`CIRCUIT_SQUAD_DESIGN_V0.md`](./CIRCUIT_SQUAD_DESIGN_V0.md)（以下「設計メモ」）で、本書はそれを **変えない**。既存の契約文書・コードは本書では書き換えていない（各実装 PR で直す）。起草時に未決だった点は §9 で決定済み。

関連: [`CIRCUIT_SQUAD_DESIGN_V0.md`](./CIRCUIT_SQUAD_DESIGN_V0.md)、[`HUB_SAVE_CONTRACT.md`](./HUB_SAVE_CONTRACT.md)、[`MECH_FLEET.md`](./MECH_FLEET.md) §8、[`EXPLORE_COMMAND_UNLOCK_V0.md`](./EXPLORE_COMMAND_UNLOCK_V0.md) §3.1・§4、[`EXPLORE_IO_V2.md`](./EXPLORE_IO_V2.md) §3、[`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md)、[`TRADE_HANGAR_V0.md`](./TRADE_HANGAR_V0.md) §3・§3.4b、[`RESTORE_V0.md`](./RESTORE_V0.md) §5.4・§5.6、[`INVADE_V0.md`](./INVADE_V0.md) §8.7〜§8.9

> 表記: 「**確認済み**」はこの PR 作成時点（`main` = `1889cc5`）のコード・文書を読んで確かめたこと。「**推測**」は読んだ範囲からの見立てで、実装前に再確認が要るもの。「**案**」は起草時の提案で、承認により本書の設計として確定したもの。

---

## 0. ひとことで

- 回路は **1 枚ずつのレコード** として HubSave に持ち、**どの機体に付いているか（または倉庫か）**、**入手元（白／中古）**、**成果状態（未 Restore を含む 4 値）** を持たせる。サイズは盤の `cols`（＝`rows`）、評価値は盤から **毎回計算** する（保存しない）。
- HubSave は **`v: 3` に上げ、保存キーも `wreckline.hubSave.v3` に分ける**。旧キー（中身 v1/v2）は読み込み元として使い、消さずにバックアップとして残す。
- trade→explore に **機体ごとの装備回路** を渡す任意キー `mechCircuits` を足す。既存キーは変えない。
- 落とし物（置き去り僚機の回路を含む）は HubSave の **`fieldDrops`**（Invade の盤のマスに紐づく）に記録する。Explore は結果確定時に「失った機体・回収した落とし物」を HubSave に反映する（§9 U9 で決定）。
- パーフェクト最大サイズは HubSave の **`perfectMaxSize`** に持ち、ジャンク作成は **2×2〜`min(20, max(2, perfectMaxSize+1))`** の正方形から選ぶ（20×20 が天井、U12）。

---

## 1. 現状（確認済み）

### 1.1 保存（`HUB_SAVE_CONTRACT`）

| 項目 | 現状 | 場所 |
|---|---|---|
| 保存キー | `wreckline.hubSave.v1`（中身は `v: 2`） | `packages/shared/src/constants.ts` `HUB_SAVE_STORAGE_KEY`、`docs/HUB_SAVE_CONTRACT.md` §2・§9 |
| 版 | `createHubSave` は常に `v: 2`。`parseHubSave` は `v: 1`／`v: 2` だけ受け付け、**それ以外は `null`** | `packages/shared/src/hub-save.ts` |
| 読めないとき | 呼び出し側（例 `trade/src/hangar.ts` `createInitialHangar`、`invade/src/hub-persist.ts` `readHub`）は `INITIAL_HUB` で続行し、次の自動セーブで **上書き** する | 同上 |
| 回路 | `HubSnapshot.circuits: HubCircuitRecord[]`。`HubCircuitRecord = { circuitId, circuitBoard, outcome, updatedAt?, lastEditorName?, locked? }`。v2 に加算、版は据え置き | `hub-save.ts`、`HUB_SAVE_CONTRACT.md` §10 |
| 件数上限 | `HUB_LIMITS.maxCircuits = 8`。`normalizeCircuits` が新しい順に 8 件で切り詰める。ジャンク作成も `slice(0, HUB_LIMITS.maxCircuits)` | `hub-save.ts`、`trade/src/junk-circuit-craft-ui.ts` |
| 装着・所有・落下 | **項目なし**（「装着」の概念がない） | 設計メモ §9.1 #14 |
| パーフェクト最大サイズ | **記録なし**。パーフェクトは回路ごとの `locked`／`perfect` だけ | 設計メモ §9.2 C17 |
| 前線の進捗 | `HubSnapshot.frontProgress = { seed, aoiHalf?, opened[], flagged[], focus, hitMine?, updatedAt? }`（形は変えない方針） | `hub-save.ts`、`INVADE_V0.md` §8.9 |
| HubSave を書くモジュール | trade（`hangar.ts`、`junk-circuit-craft-ui.ts`、`four-resource-trade-ui.ts`、`wallet-summary.ts`）、invade（`hub-persist.ts`、`forced-combat.ts`）、explore（`game/forcedBackWipe.ts`）。restore は読むだけ（`session.ts` `lookupHubCircuitLock`） | grep で確認 |

- **hub パッケージは存在しない**。HUB（Module 3）は `packages/trade`（確認済み）。

### 1.2 回路の盤・成果状態・評価値

- 盤は `CircuitBoardState = { v: 1, cols, rows, edgeState, outcome?, puzzleId?, lastEditorName?, locked?, perfect? }`。`edgeState` は 1 辺 2 ビット（0 空／1 線／2 ×）を base64url に詰めたもの（`shared/src/circuit-board.ts`）。**中古の初期マーク（エッジや×）はこの `edgeState` にそのまま表せる**。
- 成果状態は `CircuitOutcome = "fully_awakened" | "bypass" | "offline"` の 3 値。**「未 Restore」を表す値はない**。ジャンク作成（`junk-circuit-craft-ui.ts`）も検証用真盤の授与（`hangar.ts` `grantVerifyTrueCircuit`）も `outcome: "offline"` で作っている。つまり今は「未 Restore」と「Restore した結果 Offline」が区別できない。
- 評価値は `computeCircuitEffectForBoard(board)`（`shared/src/circuit-clues.ts`）で盤から計算する。手がかりは `puzzleId`（ジャンク作成では `circuitId` と同じ）と盤サイズから `generateFlawedClues` で **決定的に再生成** する（検証用盤は固定の手がかり）。細則は `computeCircuitEffectValue`（`shared/src/circuit-effect.ts`）。売却（`trade/src/hangar.ts` `sellCircuit`）はこの計算で評価値を出し、成果状態は見ない。
- Restore の成果: `restore/src/puzzle.ts` `deriveStubOutcome` は「単一の閉ループ（`isLoopClosed` → `isCircuitSingleLoopClosed`）かつ数字 100%」で `fully_awakened`。通常プレイでは Fully Awakened ＝パーフェクト（`isPerfectCircuitClearance`）と一致する。ただしデバッグの成果上書き（`outcomeOverride`）で食い違う経路はある。
- 旧来の回路ボーナス: `aggregateCircuitBonuses(hub.circuits)`（`shared/src/circuit-bonuses.ts`）が **所持している全回路** の成果状態を集計し、trade が出撃 URL の `circuitBonuses` に載せる（`hangar.ts` `buildDeployUrl`）。explore は `durabilityBuffer` を摩耗に、`craftMultiplier` を sort への受け渡しに使う（`explore/src/game/world.ts` `bootstrapFromSearch`、`game/outcome.ts`）。

### 1.3 受け渡し（URL キー）

- キー一覧の正本は `HANDOFF_QUERY_KEYS`（`shared/src/constants.ts`）。trade→explore は `deployableMechs`・`startingAmmo`・`deployedInstanceIds`・`mechDurability`・`circuitBonuses`。invade→explore は `sectorX`・`sectorY`・`density`・`intelFlags`・`engage`・`enemyCells`。explore→trade（摩耗）は `returnKind`・`mechWear`。
- **装備回路を渡すフィールドはない**。explore の `World.commandUnlock.equippedCircuits` は出撃で 1 本の `string[]` で、常に `[]`（`explore/src/game/commandUnlock.ts` `defaultCommandUnlockState`、`EXPLORE_COMMAND_UNLOCK_V0.md` §4）。本番の対応表 `CIRCUIT_COMMAND_UNLOCKS` は空。
- 表のキーは「不透明な文字列」で、後から circuitId・成果状態・専用の回路種別のどれでも引けるようにしてある（`commandUnlock.ts` `CircuitCommandUnlockTable` のコメント）。
- explore の隊長は `deployedInstanceIds[0]`、僚機は `[1]`・`[2]`（`world.ts` `createWorld`。ユニット ID は `leader`・`wing-a`・`wing-b`、`Unit.instanceId` に所有機の ID）。
- 置き去り: `explore/src/game/sim.ts` `resolveBoardingLiftOff` が離昇時に搭乗円外の僚機を `world.leftBehind: LeftBehindEntry[]`（`{ id, name, reason }`、`game/leftBehind.ts`）に入れる。**結果画面の表示だけ** で、Hub への出力には含めない（`EXPLORE_COMMAND_UNLOCK_V0.md` §3.1）。`LeftBehindEntry` には所有機の `instanceId` が入っていない（ユニット ID のみ）。
- explore の結果画面には「Sort へ」（サルベージ）と「格納庫へ」（摩耗 URL）の **別々のボタン** があり、摩耗は「格納庫へ」を押したときだけ trade に届く（`explore/src/main.ts` `renderDom`）。「再出撃」ではどちらも届かない。

### 1.4 旧素材

- `HubSnapshot.materials`（数値。旧来の資材）は今も修理（`MECH_FLEET_RULES.repairMaterials = 30`）などで使われている（`shared/src/mech-fleet.ts`、`trade/src/hangar.ts`）。
- 旧・型付き素材 ID（`mat_scrap`・`mat_circuit` など）は #134 で型から消え、読み込み時に `compactYieldBag` が四資源（`ammo`・`armor`・`power`・`junk`）以外を **黙って捨てる**（`shared/src/sort-yield.ts`、`shared/src/selftest.ts` の `parseYieldBagCompact("nope:1;armor:4;mat_scrap:9;ghost:9")` → `{ armor: 4 }`）。
- 旧 `wreckline.hubM45Stash.v0` の回路は trade 起動時に HubSave へ移す処理がある（`hangar.ts` `createInitialHangar`）。

---

## 2. 回路データモデル

### 2.1 回路レコード

```ts
/** 成果状態。未 Restore を独立した値にする（今の CircuitOutcome に 1 値足したもの）。 */
type CircuitRestoreState =
  | "unrestored"      // 未 Restore（作成・購入・ドロップ・拾った直後）
  | "fully_awakened"  // パーフェクト。効果あり。作成サイズ上限の更新条件
  | "bypass"          // 効果あり（ループなしなら評価値 0）
  | "offline";        // Restore したが効果なし

/** 入手元。白回路か中古かはここから決まる。 */
type CircuitOrigin =
  | "crafted"     // ジャンクから作る（HUB）→ 白回路
  | "bought"      // 買う（HUB）→ 中古
  | "enemy_drop"  // 敵ドロップ（Explore）→ 中古
  | "picked_up"   // 拾う（Explore）→ 中古
  | "legacy";     // v2 以前から移した回路（入手元が分からない）

type HubCircuitRecordV3 = {
  circuitId: string;                 // 既存どおり（CIRCUIT_ID_RE）
  circuitBoard: CircuitBoardState;   // 既存どおり。初期マークも edgeState に入る
  restoreState: CircuitRestoreState; // 旧 outcome を置き換え
  origin: CircuitOrigin;
  /** 装着先の OwnedMech.instanceId。null = 倉庫（未装着）。 */
  equippedTo: string | null;
  acquiredAt?: string;               // ISO
  updatedAt?: string;                // 既存どおり
  lastEditorName?: string;           // 刻印。既存どおり
  locked?: boolean;                  // パーフェクトロック。既存どおり
  /** 予約。回路→コマンド／ステータスの対応表が決まったらその行のキーを入れる。欠落時は未設定。 */
  effectKey?: string;
};
```

| 設計メモの要素 | 本書での持ち方 | 理由 |
|---|---|---|
| 機体ごとの装着 | 回路側の `equippedTo`（機体 ID） | 装着の正本を 1 か所にする。機体を失った・解体したときに「その機体に付いていた回路」を引くのが 1 回の絞り込みで済む。機体側（`OwnedMech`）は変えない |
| 所有（倉庫） | `hub.circuits` に入っている＝所有。`equippedTo: null` が倉庫 | 未装着は無制限（設計メモ §2 旧 §8.2-9）なので件数上限なし |
| 所有権を失った回路（落とし物） | `hub.circuits` から **外して** `hub.fieldDrops` に移す（§5） | 「落ちた回路は所有権を失い、部隊上限から外れる」（設計メモ §5） |
| 中古の初期マーク | `circuitBoard.edgeState` にそのまま入れる。初期マークかどうかの印は持たない | 初期マークは正解とは限らず、消したり書き直したりできる（設計メモ §2.1）。区別がルール上要らない。生成は項目13 |
| 白回路／中古 | `origin` から決まる（`crafted` だけ白） | 回収した自分の落とし物は `origin` を含めて元のまま戻す（§5.3） |
| サイズ（N×N） | `circuitBoard.cols`（＝`rows`）。別フィールドにしない | 二重管理を避ける。今の生成経路（6×6・4×4・8×8・2×2）はすべて正方形（確認済みの範囲） |
| 成果状態 | `restoreState`（4 値） | 未 Restore と Offline を区別する（§1.2 の問題） |
| 評価値 | **保存しない**。`computeCircuitEffectForBoard` で毎回計算 | 売却と同じ計算を正本にする。ただし手がかり生成の互換が前提（§9 U17） |

- `circuitBoard.outcome`（盤側の成果状態の写し）は restore との URL 往復（`encodeCircuitBoardCompact`）で使っているので残す。`restoreState` が `unrestored` のときは盤側を空にする（案）。
- 今の `HubCircuitRecord.outcome` は v3 では `restoreState` に置き換える。trade・restore の呼び出し箇所は多いが、`RestoreToTradePayload.outcome`（URL の `circuitOutcome`）は 3 値のまま変えない（Restore の結果に「未 Restore」はないため）。
- 将来の属性（レアリティ、コモンの枠拡張など）は、決まったときに **任意フィールドとして加算** し、欠落時の既定値を決める。そうすれば版上げは要らない（§3.4）。

### 2.2 効果の計算（換算が未決でも壊れない形）

```ts
/** 盤の評価値（満たした数字の合計。細則は computeCircuitEffectValue）。 */
circuitEffectValue(rec) = computeCircuitEffectForBoard(rec.circuitBoard, { perfect: rec.circuitBoard.perfect ?? rec.locked }).effect
/** 効果として使う値。効果が出るのは Fully Awakened と Bypass だけ。 */
circuitActiveEffect(rec) = (rec.restoreState === "fully_awakened" || rec.restoreState === "bypass") ? circuitEffectValue(rec) : 0
```

- 評価値→ステータス／コマンド解放の **換算は未決**（設計メモ §8.1）。データとして持つのは「回路ごとの `restoreState`・評価値・（将来）`effectKey`」という **事実だけ** にし、換算は別の純関数（例 `circuitEffectToBonuses(...)`）に閉じ込める。換算が決まったら関数だけ差し替える。
- 受け渡し（§4）も同じ考えで、集計済みボーナスではなく **回路ごとの事実** を渡す。

### 2.3 機体ごとの枠と部隊の上限

| 判定 | 式（案） | 備考 |
|---|---|---|
| 機体の回路枠 | `mechSlotCapacity(mech, hub) = 1 + （装着中のコモンの枠拡張の合計）` | 基本枠 1（設計メモ §2）。枠拡張の値は対応表と一緒に未決なので、**当面は常に 1** を返す |
| 部隊の回路上限 | `squadEquipCap(hub)` | 装着中の数だけ数える（旧 §8.2-9）。段位で増える（§3、項目3）。開始 0（§4、項目8）。値の出どころは項目3で決まる。**それまでの扱いは §9 U3** |
| 装着できるか | `countEquipped(hub, mech) < mechSlotCapacity` かつ `countEquippedAll(hub) < squadEquipCap` | 付け替えは HUB のみ・無料（設計メモ §2）。出撃中は変えない |
| 機体数 | 当面 3（`HUB_LIMITS.maxMechs = 3`、変えない） | 設計メモ §4.1 |

- 装着・取り外しは shared の純関数（例 `equipCircuit(hub, circuitId, mechInstanceId)`・`unequipCircuit(hub, circuitId)`）にし、UI（trade）はそれを呼ぶだけにする。
- 読み込み時の整合（§6.3）: `equippedTo` が存在しない機体を指していたら倉庫へ戻す。枠を超えていたら超えた分を倉庫へ戻す。

---

## 3. 保存契約（`HUB_SAVE_CONTRACT`）の変更案

### 3.1 v3 の形

```ts
type HubSnapshotV3 = HubSnapshot（v2 の全フィールド、変更なし）& {
  circuits: HubCircuitRecordV3[];   // 件数上限なし（maxCircuits の切り詰めを廃止）
  /** パーフェクト（Fully Awakened）で Restore できた最大サイズ N。0 = 未達成。§7 */
  perfectMaxSize: number;
  /** 所有権を失って戦場に残っている回路。§5 */
  fieldDrops: FieldCircuitDrop[];
  /** 反映済みの出撃 ID（直近数件）。Explore からの反映を 1 回だけにするため。§5.4 */
  appliedSortieIds?: string[];
};

type HubSaveV3 = { v: 3; savedAt: string; hub: HubSnapshotV3 };
```

- `credits`・`materials`・`fleet`・`ammoLoad`・`inventory`・`frontProgress`・`importedMaterials`・`unopenedContainers`・`selectedMechId`・`selectedAmmoId` は **変えない**。`frontProgress` の形も変えない（`INVADE_V0.md` §8.9 の方針どおり。落とし物は別フィールド）。
- `OwnedMech` も変えない（装着は回路側に持つ）。

### 3.2 版の上げ方

| 項目 | 案 |
|---|---|
| ペイロード版 | **`v: 3`**。`createHubSave` は v3 を書く。`parseHubSave` は v1・v2・v3 を受け付け、正規化後は常に v3 |
| 保存キー | **`wreckline.hubSave.v3` に分ける**（`HUB_SAVE_STORAGE_KEY` を変更）。旧キー `wreckline.hubSave.v1` は読み込み元として残す |
| 読み込み順 | ① 新キーを読む → ② なければ旧キー（中身 v1/v2）を読んで §6 の移行をする → ③ 新キーに書く。**旧キーは消さず、書き換えもしない**（バックアップ） |
| 「初期値に戻す」 | 新キーを消す（または初期値で上書き）。旧キーも消すかどうかは UI に明記（`HUB_SAVE_CONTRACT.md` §4 の Reset と同じ扱い）。消さないと次回起動で旧キーから再移行されるので、**Reset では両方消す** のが案 |
| 文書 | 実装 PR で `HUB_SAVE_CONTRACT.md` に「§12 回路の装着・落とし物・パーフェクト最大サイズ（v3）」を追記し、`MECH_FLEET.md` §8.1 の版の表も直す（本 PR では触らない） |

**加算で済ませず版を上げる理由（確認済みの挙動から）:**

1. 今のコードは `normalizeCircuits` が **8 件で切り詰め**、しかもレコードを既知のフィールドだけで組み直す。v2 のまま `equippedTo` などを足すと、古いビルドのページが一度保存しただけで装着情報が消え、9 件目以降の回路も消える。
2. `outcome` が必須（不正なら捨てる）なので、`unrestored` を足すと古いビルドはそのレコードを捨てる。
3. 装着制・所有の意味が変わるので、中身を見ずに読める「加算」ではない（`HANDOFF_M45_V0.md` §4 でも「HubSave v3 版上げ」は別判断とされていた）。

**保存キーまで分ける理由:** 同じキーで `v: 3` を書くと、古いビルドのページ（開きっぱなしのタブやキャッシュ）が `parseHubSave` で `null` → `INITIAL_HUB` で続行 → 自動セーブで **セーブ全体を初期値で上書き** する（§1.1）。キーを分ければ、古いビルドは旧キーを読み書きするだけで、新しいセーブは壊れない。モジュールは同じオリジン（`MODULE_URLS` がすべて `xyngwie.github.io/-explore-sort-trade-game/` 配下）で同じ `localStorage` を共有するので、この事故は起こりうる（推測。実際に古いタブが残る頻度は未確認）。

### 3.3 `HUB_LIMITS` とヘルパ

- `HUB_LIMITS.maxCircuits` は **使わなくする**（切り詰め廃止）。ただし trade（`junk-circuit-craft-ui.ts`）が参照しているので、**shared の PR では定数を `@deprecated` として残し**、trade の PR で参照を外してから消す（#134 → #137 のように shared だけ変えて trade のビルドが壊れるのを避ける）。
- 既存ヘルパの扱い: `upsertCircuitIntoHub` は引数の形を保ち、既存レコードの `equippedTo`・`origin`・`acquiredAt` を **引き継ぐ**（restore→trade の取込で装着が外れないように）。新規レコードは `origin` を引数で受け、既定は `legacy`（案）。`removeCircuitFromHub` はそのまま。
- 追加するヘルパ（shared、案）: `equipCircuit`／`unequipCircuit`、`circuitEffectValue`／`circuitActiveEffect`、`circuitSize`、`recordPerfectSize`、`craftMaxSize`、`addFieldDrops`／`recoverFieldDrops`、`applySortieReport`（§5.4）。

### 3.4 これから先の加算ルール

v3 以降に回路へ属性を足すときは、v2 と同じく **任意フィールド＋欠落時の既定値** で加算し、版は上げない。版を上げるのは、古いビルドが読むとデータを失う変更（必須化・意味の変更・切り詰め規則の変更）のときだけにする。

---

## 4. trade → explore：装備回路の受け渡し

`EXPLORE_COMMAND_UNLOCK_V0.md` §4 で保留になっている「装備回路の受け渡しフィールド」を、機体ごとの形で設計する。

### 4.1 キーと形

- 追加キー: **`mechCircuits`**（任意・後方互換）。`HANDOFF_QUERY_KEYS.tradeToExplore` に足す。既存キー（`deployableMechs`・`startingAmmo`・`deployedInstanceIds`・`mechDurability`・`circuitBonuses`）は変えない。
- ペイロード型（`TradeToExplorePayload` に加算）:

```ts
type MechCircuitEntry = {
  circuitId: string;
  restoreState: CircuitRestoreState; // 未 Restore / Offline も送る（表示用）。効果判定は explore 側で FA・Bypass だけ
  effect: number;                    // 出撃時点の評価値（circuitEffectValue）
  effectKey?: string;                // 予約（対応表が決まったら）
};
type TradeToExplorePayload = 既存 & {
  /** 出撃する機体ごとの装着回路。キーは deployedInstanceIds の要素。 */
  mechCircuits?: Record<string /* instanceId */, MechCircuitEntry[]>;
};
```

- URL 上の圧縮形（案）: `instanceId~circuitId*状態*評価値[*effectKey],circuitId*…;instanceId~…`。状態は `fa`／`by`／`off`／`un`。
  - 区切りに `~` `*` `,` `;` を使うのは、`circuitId` の許容文字（`CIRCUIT_ID_RE = /^[a-zA-Z0-9_.:-]{1,64}$/`）に `.` と `:` が含まれるため（確認済み）。`instanceId` は今は `owned_<機種>_<base36>_<n>`／`migrated_<機種>_<n>` 形式（`mech-fleet.ts`）で、これらの記号を含まない。builder 側で念のため除外する。
  - 例: `?deployedInstanceIds=owned_a,owned_b&mechCircuits=owned_a~junk_craft_x*fa*8;owned_b~c_2*by*3`
- 載せるのは **`deployedInstanceIds` に含まれる機体の装着回路だけ**。倉庫の回路は送らない。

### 4.2 explore 側の使い方（実装は別 PR）

- `World.commandUnlock.equippedCircuits: string[]`（出撃で 1 本）を、**ユニットごと** の一覧（例 `equippedByUnit: Record<unitId, string[]>`）に置き換える。ユニットと機体の対応は既存の `Unit.instanceId`（隊長＝`deployedInstanceIds[0]`）。
- 判定に使うのは `restoreState` が `fa`／`by` の回路だけ（設計メモ §2.1「Restore を通すまで効果なし」）。
- 隊長のコマンドは **隊長機の回路**、僚機の方針・移動（`wing_mobility`）は **その僚機の回路** で判定（設計メモ §2 旧 §8.2-1）。`isWingmanMobilityUnlocked(wingmanId, …)` は既に僚機 ID を取る（C11）ので、引く一覧を変えるだけ。小隊方針を解放済みの僚機にだけかける件（C20）は同じ入力で実装できる。
- 背負い時の合算（設計メモ §6、項目4）は「背負った側の一覧 ∪ 背負われた側の一覧」で表せる。
- `mechCircuits` がない URL（古い trade、直接起動）では今と同じく全ユニット `[]`。

### 4.3 `circuitBonuses`（旧来の所持集計ボーナス）の扱い

- 所持だけで効くボーナスは廃止（設計メモ §2 旧 §8.2-7）。一方、評価値の換算は未決なので、代わりの効果はまだない。
- キーと parser は **互換のため残す**。trade が何を載せるかは §9 U5（案: 換算が決まるまで「装着中の回路だけ」を今の表で集計して載せる）。
- 影響（確認済み）: `circuitBonuses.craft` は explore 経由で sort の `craftMultiplier` になる（`explore/src/game/outcome.ts` `sortHandoffUrl`）。集計対象を変えると sort の倍率も変わる。

---

## 5. invade → explore：落とし物の記録

### 5.1 何を記録するか

設計メモ §5 の決定:

- 背負えなかった大破機は機体を失い、**回路はやられた場所に確定で落ちて出撃をまたいで残る**。Invade の盤面に「どのマスで何を落としたか」を記録する。
- 置き去りの僚機も同じ扱い（旧 §8.2-4）。救助撤退でも回路はその場に落ちる（§7）。
- 落ちた回路は所有権を失い、部隊上限から外れる。
- **回収した自分の落とし物の回路は元の状態のまま戻す**（旧 §8.4-3）。
- 置き去りは運び出せなかった残骸と同じ扱い。機体そのものは落とし物として残らない（回路だけが落ちる）。

### 5.2 形

```ts
type FieldCircuitDrop = {
  dropId: string;
  /** どの前線盤か（frontProgress.seed）。盤が変わったときの扱いは §9 U8。 */
  frontSeed: number;
  /** 落ちたマス（Invade の盤座標。frontProgress と同じ FrontCellCoord）。 */
  cell: { sx: number; sy: number };
  /** 落ちた回路。所有していたときのレコードをそのまま（equippedTo だけ null）。 */
  circuit: HubCircuitRecordV3;
  cause: "wreck_not_carried" | "left_behind" | "rescue_abort";
  fromMechInstanceId?: string;
  droppedAt: string; // ISO
};
```

- 置き場所は **HubSave のトップレベル `fieldDrops`**。`frontProgress` の中には入れない（形を変えない方針のため）。
- 位置は **マス単位だけ** 記録し、Explore 内の座標は持たない。出し方（参謀案：マスのどこかに目立つ印付きで出す）は設計メモ §8.1 で未決のまま。
- 回路レコードを **丸ごと** 持つので、回収時に盤・`restoreState`・`origin`・刻印・`locked` がすべて元のまま戻る。

### 5.3 流れ

| 場面 | 誰が | 何をする |
|---|---|---|
| 出撃前 | invade | 今までどおり `sectorX`・`sectorY`（出撃するマス）を explore に渡す。**新しい URL キーは足さない**（§9 U19 で決定）。落とし物の中身は HubSave にあり、explore は `fieldDrops` を `frontSeed`＝現在の `frontProgress.seed` かつ `cell`＝出撃マスで絞って出す |
| 出撃中 | explore | 落とし物を拾ったら「回収した `dropId`」を覚える。背負えなかった大破機・置き去りの僚機・救助撤退で失う機体の `instanceId` を覚える（どの場合に失うかは項目4・5・6 が決める） |
| 結果確定 | explore | §5.4 の出撃報告を作って HubSave に反映する |
| 反映 | shared の純関数 | 失った機体を `fleet` から外し、その機体に `equippedTo` していた回路を `circuits` から外して `fieldDrops` に入れる（`cell` は出撃マス）。回収した `dropId` の回路は `equippedTo: null` で `circuits` に戻す（倉庫。自動では装着しない、案） |
| HUB | trade | 反映結果を表示する（失った機体・落とした回路・回収した回路） |
| 前線 | invade | 盤で落とし物のあるマスに印を出す（UI の加算。`frontProgress` の形は変えない） |

- Invade を通らない出撃（`cell` が null）で落ちた回路は **記録せずに失う**。救済はなく、結果画面で失ったことを明示する（§9 U7）。
- 置き去り: `LeftBehindEntry` に所有機の `instanceId` を足す（今はユニット ID だけ）。これで §5.4 の報告の `lostMechInstanceIds` に入れられる。`EXPLORE_COMMAND_UNLOCK_V0.md` §3.1 の「Hub への出力には含めない」は、項目6の実装時にこの設計へ置き換わる（契約変更点）。
- 敵ドロップ・拾った回路（中古）も同じ報告に `acquiredCircuits`（新しいレコード。`origin` は `enemy_drop`／`picked_up`、`restoreState` は `unrestored`、初期マークは項目13）として載せられる。頻度とサイズは経済タスク送り（設計メモ §8.1）で、本書では決めない。

### 5.4 出撃報告と反映経路

```ts
type SortieCircuitReport = {
  sortieId: string;                  // explore が出撃ごとに作る
  cell: { sx: number; sy: number } | null; // 出撃マス。invade を通らない出撃では null → 落ちた回路は失う（§9 U7）
  frontSeed: number | null;
  lostMechInstanceIds: string[];
  lostCause: Record<string, FieldCircuitDrop["cause"]>;
  recoveredDropIds: string[];
  acquiredCircuits: HubCircuitRecordV3[];
};
applySortieReport(hub, report): HubSnapshotV3  // 純関数。appliedSortieIds に sortieId があれば何もしない
```

- **決定: explore が結果確定時に HubSave へ直接反映する**（案 B、§9 U9）。理由: 摩耗 URL は「格納庫へ」を押したときしか届かず（§1.3）、「Sort へ」や「再出撃」を選ぶと機体の喪失・回路の落下が記録されない。喪失が記録されないと「負けたら Sort へ逃げる」で喪失を避けられてしまう。explore が HubSave を直接書く前例は既にある（`explore/src/game/forcedBackWipe.ts`）。
- 1 回だけ反映するために `appliedSortieIds`（直近 N 件）で重複を防ぐ。
- 注意（確認済み）: ローカル開発では explore（:5173）と trade（:5175）が別オリジンで `localStorage` を共有しない（`LOCAL_DEV_MODULE_URLS`）。`forcedBackWipe.ts` と同じ制約で、ローカルでは HUB に反映されない。
- 別案（案 A）: 摩耗 URL に `lostMechs`・`recoveredDrops`・`sectorX/Y` を足して trade が反映する。既存の URL 方式に揃うが、上の「ボタンの選び方で記録が消える」問題が残るので採らない（§9 U9）。

---

## 6. 旧セーブからの移行

### 6.1 変換表（v1/v2 → v3）

| 旧データ | v3 での扱い |
|---|---|
| `circuits[]`（最大 8 件） | 全件を移す。`restoreState` は旧 `outcome` をそのまま（`fully_awakened`／`bypass`／`offline`）。旧 `offline` は `unrestored` に読み替えず `offline` のまま（§9 U2 で決定。ルール上はどちらも効果なしで違いは表示だけ） |
| 　`origin` | `legacy`（入手元が記録されていない） |
| 　装着 | **全件 `equippedTo: null`（倉庫）**。v2 には装着の概念がない |
| 　`locked`／`lastEditorName`／盤 | そのまま |
| `maxCircuits = 8` の切り詰め | 廃止。以後は件数で切らない |
| 所持集計ボーナス（`circuitBonuses`） | 移行直後は何も装着していないので、装着制で数えると 0 になる。trade に「回路は装着制になりました。持っていた回路は倉庫に移しました」の案内を 1 回出す（案） |
| `perfectMaxSize`（新規） | 旧 `circuits` のうち **`outcome === "fully_awakened"` かつ `locked`（パーフェクト）** の盤の最大サイズで初期化。なければ 0（§9 U11） |
| `fieldDrops`（新規） | `[]`（v2 に落とし物はない） |
| `materials`（旧資材の数値） | **そのまま**。変換しない（修理などで現役。換算は経済の話で本書の範囲外） |
| 旧・型付き素材 ID（`mat_*`・`part_*`） | 今と同じく読み込み時に捨てる（#134 以降の挙動、§1.4）。回路（例 `mat_circuit`「旧・回路素体」）には **変換しない**（変換は仕様にない設計になるため） |
| `hubM45Stash.v0` の回路 | 今の trade の移行処理を残す。移した回路は `origin: legacy`・倉庫 |
| `fleet`・`frontProgress`・その他 | そのまま |

### 6.2 安全に読み込めない場合

| 状況 | 今の挙動（確認済み） | 案 |
|---|---|---|
| JSON が壊れている／`v` が不明 | `null` → `INITIAL_HUB` で続行し、次の自動セーブで上書き | 上書きする前に元の文字列を `wreckline.hubSave.corrupt.<ISO>` に退避し、trade に「セーブを読めなかったので退避した」と出す |
| `v` が 4 以上（新しいビルドのセーブを古いビルドが読んだ） | 同上（上書き） | 新キー方式なら古いビルドは旧キーしか読まないので起きにくい。v3 以降のビルドでは「新しい版のセーブ」として **書き込みを止める**（読み取り専用で起動）案 |
| 回路 1 件だけ壊れている（盤が読めない等） | その 1 件を黙って捨てる（`normalizeCircuits`） | 同じく捨てるが、件数を trade のログに出す。旧キーは消さないので元データは残る |
| `equippedTo` が存在しない機体 | —（新規） | 倉庫へ戻す |
| 1 機の装着数が枠を超える／部隊上限を超える | —（新規） | 超えた分を倉庫へ戻す（`updatedAt` が新しいものを残す、案） |
| `circuitId` の重複 | 先に出た方を残す（`normalizeCircuits`） | 変えない |
| `fieldDrops` の `frontSeed` が今の盤と違う | —（新規） | §9 U8 |

- 移行は **読み込みのたびに冪等**（同じ v2 から何度移しても同じ v3 になる）にする。ID を振り直さない。
- テスト（実装 PR）: v1・v2（回路 0 件／8 件／パーフェクトあり／壊れた回路あり）→ v3 の往復、新キーがあれば旧キーを読まない、Reset 後に旧キーから再移行しない、新ビルドが旧キーの中身を書き換えない（新キー方式の確認）。

---

## 7. パーフェクト最大サイズとジャンク作成サイズ（項目14）

### 7.1 記録

- `hub.perfectMaxSize: number`（0 = 未達成）。
- 更新するのは restore→trade の取込（`trade/src/hangar.ts` の `parseRestoreToTradeSearch` 経路）で、成果が **Fully Awakened（パーフェクト）** のときだけ: `perfectMaxSize = max(perfectMaxSize, N)`。Bypass・Offline では上げない（設計メモ §2.1 旧 §8.4-2）。
- N は回路の辺の長さ（`circuitBoard.cols`。正方形のみ作れる。非正方形の既存盤は §9 U13）。
- 上限は下がらない（回路を売っても・落としても記録は残る）。
- 拾った・買った回路は上限より大きくてよく、それをパーフェクトにすると上限が上がる（設計メモ §2.1）。

### 7.2 ジャンク作成

| 項目 | 案（数値はすべて設計メモ §2.2 のまま） |
|---|---|
| 選べるサイズ | 2×2 〜 `craftMaxSize(hub) = min(20, max(2, perfectMaxSize + 1))` の正方形（最初は 2×2 だけ） |
| コスト | N×N で **ジャンク 2N 個＋2^N クレジット**（2×2＝4 個＋4c 〜 6×6＝12 個＋64c） |
| 作る回路 | `createEmptyCircuitBoard(N, N, circuitId)`（白回路・初期マークなし）、`restoreState: "unrestored"`、`origin: "crafted"`、`equippedTo: null` |
| 置き換える現行 | `trade/src/junk-circuit-craft-ui.ts`（`JUNK_COST = 4`・クレジット消費なし・常に 4×4・`outcome: "offline"`・`maxCircuits` で切り詰め） |
| コスト式の置き場所 | trade（売値の `circuit-sell-prices.ts` と同じく trade の定数）。`craftMaxSize` は HubSave に依存するので shared |
| 上の天井 | **20×20**（§9 U12、2026-09-28 決定）。Restore が扱える最大サイズ＝`shared` の `RESTORE_MAX_SIDE = 20`（`circuit-board.ts`）。真盤の生成も 2〜20 辺（`SIZED_TRUE_MAX_SIDE = RESTORE_MAX_SIDE`）、2×2〜20×20 を selftest で保証。`craftMaxSize(hub, ceiling = 20)`、`perfectMaxSize` も 20 で頭打ち。保存・URL の読み込みは古いセーブを落とさないよう 64 まで受け付ける（`HUB_LIMITS.maxCircuitSide`）。trade の作成画面への反映は実装 B |

- Restore は Hub から渡された盤をその盤のサイズで開く（設計メモ §9.2 C16）ので、2×2・3×3 の作成は項目12（新規生成の盤サイズ可変化。別の作業が進行中）を待たずに動くはず（推測。2×2・3×3 での手がかり生成が動くことは設計メモ C16 で確認済み）。

---

## 8. 実装の分割案

契約（shared）を先に 1 本で入れ、各モジュールはそれに乗せる。各 PR は 1〜2 パッケージに留める。

| # | PR | 触るパッケージ | STATUS 項目 | 内容 | 前提 |
|---|---|---|---|---|---|
| A | 保存契約 v3 と受け渡しキー | `shared`（＋`docs/HUB_SAVE_CONTRACT.md`・`HANDOFF` 系の追記） | 1・2・14 | `HubSaveV3`・新キーと読み込み順・v1/v2→v3 移行・壊れたセーブの退避・切り詰め廃止（`maxCircuits` は deprecated で残す）・§2〜§5・§7 の純関数・`mechCircuits` の build/parse・`HANDOFF_QUERY_KEYS` 追加・selftest | 本書の承認（済） |
| B | ジャンク作成サイズとコスト | `trade` | 14 | サイズ選択（2×2〜`craftMaxSize`）、コスト 2N＋2^N、`unrestored`／`crafted`、restore 取込で `perfectMaxSize` 更新、`maxCircuits` 参照の削除 | A |
| C | 倉庫と付け替え | `trade` | 1（＋7 の付け替え） | 倉庫一覧・機体ごとの装着 UI（HUB のみ・無料）、装着中の回路の売却・Restore の扱い（U14）、`circuitBonuses` の集計対象（U5）、移行の案内 | A |
| D | 出撃 URL に装着回路 | `trade` | 2 | `buildDeployUrl` に `mechCircuits` を載せる | A（C があると実データが入る） |
| E | explore の機体ごと判定 | `explore` | 1・2 | `equippedByUnit`、隊長／僚機ごとの判定、FA・Bypass だけ有効。小隊方針の対象外表示（C20）を同時にやるかは別判断 | A（D がなくても `[]` で動く） |
| F | 落とし物の記録と回収 | `explore`（＋`shared` は A に入っている純関数を使うだけ） | 2・6 | `LeftBehindEntry` に `instanceId`、結果確定時の `applySortieReport`、落とし物の出現と回収 | A、U7〜U9 の決定。背負い（4）・救助撤退（5）の喪失はそれぞれの PR で報告に足す |
| G | 前線の落とし物表示 | `invade` | 6 | 落とし物のあるマスに印（UI の加算）、盤の再生成時の扱い（U8） | A、F |

- 担当: どれも実装は Cursor レーン、PR の切り方・順番と STATUS の更新はオーケストレーター（Codex）、契約（A）のマージ判断は神宮（`ORCHESTRATION.md` §1.3）。A はほかの PR と同時に `hub-save.ts` を触るもの（例: 項目12・13 の作業）がないことを確かめてから着手する。
- 順番: A → B・C・D・E（並行可）→ F → G。
- 並行作業との関係: 項目12（Restore の盤面サイズ可変化）は #150 で完了済み（`resolveCluesForCircuitBoard` が sized true 盤の手がかりも引くようになった）。今後、手がかり生成（`generateFlawedClues` など）を変える PR は既存回路の評価値を変えないこと（U17 の互換テストを A で置く）。
- 各 PR の確認: ルートの `npm test` と全パッケージのビルド（shared を変える A では trade・explore・invade・restore・sort のビルドまで。#137 の再発防止）。

---

## 9. 決定事項（起草時の未決事項。2026-09-28 に神宮が承認）

U7 は神宮の決定。ほかは起草時の推奨どおりに決定。

| # | 事項 | 決定 | 理由 |
|---|---|---|---|
| U1 | 保存キーを分けるか | 新キー `wreckline.hubSave.v3` に分け、旧キーは残す | 同じキーで `v: 3` を書くと、古いタブがセーブ全体を初期値で上書きしうる（§3.2） |
| U2 | 旧 `offline` 回路を移行時に `unrestored` と見なすか | 見なさない。`offline` のまま | 推測で状態を変えない。どちらも効果なしで違いは表示だけ |
| U3 | 部隊の回路上限（装着数）を項目3（段位）・項目8（開始 0）が入るまでどうするか | 部隊上限は判定せず、機体ごとの枠（基本 1）だけで判定 | 暫定の固定値は仕様にない数値。すぐ開始 0 にすると項目3 がない間は装着できなくなる |
| U4 | コモンの枠拡張・レアリティの持ち方 | データは `effectKey` の予約だけ置き、枠は常に 1。対応表が決まったら任意フィールドとして加算 | 対応表と一緒に決めるため |
| U5 | 旧来の `circuitBonuses`（成果状態ごとの固定ボーナス）を換算が決まるまでどうするか | 装着中の回路だけを今の表で集計して続ける | 装着制に沿い、今のボーナスの形も残る。換算が決まったら差し替え |
| U6 | 未 Restore の中古回路の初期マークが偶然閉ループを作ると、評価値（＝売値）が上がる | 初期マークの生成（項目13）で閉ループを作らない | 売値の規則（25c＋評価値×3c、成果状態を見ない）を変えずに済む |
| U7 | Invade を通らない出撃（trade から直接・`focus = null` の quick-battle）で落ちた回路 | **失う。救済はない。結果画面で失ったことを明示する** | 神宮の理由: Invade を通らない出撃はスタート地点に敵が出ない安全地帯なので、そこから先で失うのは自己責任。設計メモ §5「持ち帰れないものは持ち帰れない」とも一致 |
| U8 | 前線の盤が変わったとき（「盤を再生成」、段位で盤が変わる）の落とし物 | 盤（`frontSeed`）に紐づけ、盤が変わったら消える（再生成の確認文に明記） | 段位（項目3）の設計で盤の扱いが決まったら見直す |
| U9 | 喪失・落下・回収の反映経路 | explore が結果確定時に HubSave へ直接反映（`sortieId` で 1 回だけ） | 摩耗 URL 方式はボタンの選び方で記録が消える（§5.4）。ローカル開発で反映されない制約は `forcedBackWipe.ts` と同じ |
| U10 | パーフェクト最大サイズの更新条件 | `fully_awakened` かつパーフェクト（`locked`） | 通常プレイでは同じ。デバッグの成果上書きで上がるのを防ぐ |
| U11 | 移行時の `perfectMaxSize` の初期値 | 既存のパーフェクト回路の最大サイズ | 既に達成した人が後退しない。検証用の「既に完璧」盤（2×2）を受け取っていると 2 になる点は許容 |
| U12 | 作成サイズの天井 | Restore が扱える最大サイズで頭打ち＝**20×20**（2026-09-28 神宮の決定） | Restore の最大も 20×20。`RESTORE_MAX_SIDE = 20`・`craftMaxSize` の既定の天井は実装済み、trade の作成画面は実装 B |
| U13 | 非正方形の既存盤のサイズ | `min(cols, rows)` | 今の生成経路は正方形のみなので実害は小さい |
| U14 | 装着中の回路を売る・Restore に出す | 売却は自動で外して売る（確認あり）。Restore は装着したまま可 | どちらも HUB 内の操作 |
| U15 | 隊長機の指定 | 今どおり `deployedInstanceIds` の先頭 | 選ぶ UI は項目7で検討 |
| U16 | 機体を解体したときの装着回路 | 倉庫へ戻す | HUB 内の操作なので落とし物にはしない |
| U17 | 評価値を保存するか | 保存せず毎回計算。手がかり生成の互換テストを置く | 手がかり生成を変える PR は既存 `puzzleId` の手がかり（＝既存回路の評価値）を変えないことをテストで固定する |
| U18 | 回収した落とし物を自動で装着し直すか | 倉庫に戻す | 元の機体は失われている |
| U19 | invade→explore で落とし物をどう渡すか | URL キーは足さず、explore が HubSave の `fieldDrops` を出撃マスで絞って読む | 回収時に元の状態で戻すには結局 HubSave のレコードが要り、URL に載せても二重になる |

本書で決めないもの（既存の未決のまま・別タスク）: 評価値の換算と回路→コマンドの対応表・レアリティ（設計メモ §8.1）、回路の買値、敵ドロップ・拾う回路の頻度とサイズ（経済タスク）、落とし物の出し方（マス内の印）、誰が背負えるか、段位の上がり方。
