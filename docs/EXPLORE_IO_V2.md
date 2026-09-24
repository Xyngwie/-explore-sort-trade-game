# Explore I/O v2（Module 1 入出力の再接続）

**ステータス:** 採用方針（2026-09-17）・契約型は `packages/shared`。**wear I/O wire**（trade↔explore URL 往復＋HubSave 適用）は `feature/wear-io-wire`。explore Behavior v0 で ids 受取＋フラット摩耗（振る舞い正本は `EXPLORE_BEHAVIOR_V0.md`）。イベント積み上げ摩耗は後続  
**目的:** ハンガーの**所有インスタンス**と出撃ループを繋ぐ。健在機だけ出せるようにし、帰還で**機体ごとの摩耗**を拠点に返す。

関連: `docs/MECH_FLEET.md`、`packages/shared` の `mech-fleet.ts` / `expedition.ts` / `handoff.ts`、現行最小出撃 `packages/explore`。

> **Module 2（sort）メモ（本 PR では実装しない）:** 修理資材／パーツ ID を sort 成果から返す話は後続。本仕様は Module 1 の入出力のみ。

---

## 1. ひとことで

**出撃 IN は「健在な instanceId 列」、OUT は「回収コンテナ＋機体ごとの耐久／状態」。件数だけの `deployableMechs` は互換の影。**

---

## 2. 現行（v1）との違い

| | v1（現行） | v2（本仕様） |
|---|---|---|
| trade→explore | `deployableMechs`（件数）+ `startingAmmo` | **`deployedInstanceIds`（健在のみ）** + `startingAmmo`（件数は派生） |
| 配備可否 | 件数があれば出せる想定 | `operational`（健在）のみ。`needs_repair` / `destroyed` は選択不可 |
| explore→sort | 回収缶・ピース・生還フラグ | **加算可:** 任意 `craftMultiplier`（Hub `circuitBonuses.craft` の転送）。サルベージ主経路は不変 |
| explore→hub | 摩耗なし（件数ハンドオフのまま） | **`returnKind` + 機体ごとの wear 報告** |
| 拠点の適用 | ウェアは後続／非ゴール扱いだった | hub が `OwnedMech` に耐久を書き戻す |

`docs/MECH_FLEET.md` §5 / §9 の「instanceId ラウンドトリップは非ゴール」は、**本仕様で Module 1 分を取り下げる**（修理 UI・sort 部品 ID は引き続き非ゴール）。

---

## 3. 入力（trade → explore）

### 3.1 ペイロード

```ts
type TradeToExplorePayload = {
  /** 互換: 配備機数。v2 では通常 deployedInstanceIds.length と一致 */
  deployableMechs: number;
  startingAmmo: number;
  /** v2: 出撃に出す所有インスタンス ID（健在のみ） */
  deployedInstanceIds?: string[];
  /** v2 additive: 配備時点の耐久（explore が durabilityAfter を正しく算出） */
  deployedDurability?: Array<{ instanceId: string; durability: number }>;
  /** additive: hub circuit bonuses (durabilityBuffer applied on wear) */
  circuitBonuses?: { craftMultiplier: number; repairDiscount: number; durabilityBuffer: number };
};
```

URL（仮・既存クエリに加算）:

```text
?deployableMechs=2&startingAmmo=28&deployedInstanceIds=owned_a,owned_b&mechDurability=owned_a:100;owned_b:100&circuitBonuses=craft:1.100;repair:0.200;dur:10
```

`circuitBonuses` は HubSave.circuits の outcome 集計（[`RESTORE_V0.md`](./RESTORE_V0.md) §5.4.1）。explore は `dur` を帰還摩耗から差し引く。

- `deployedInstanceIds` 省略時は v1 互換（件数のみ）。explore 最小実装は件数フォールバック可。
- 送信側（hub）は **必ず `canDeploy` で濾した ID だけ**を載せる。

### 3.2 運用ルール

| 状態 (`MechStatus`) | 出撃選択 |
|---|---|
| `operational` 健在 | 可 |
| `needs_repair` 要修理 | **不可** |
| `destroyed` 大破 | **不可** |

ヘルパ（shared）:

- `selectDeployableInstanceIds(fleet)` — 健在 ID 一覧
- `filterToDeployableIds(fleet, requestedIds)` — 要求 ID から健在だけ残す（要修理・大破・未知 ID を落とす）
- `buildTradeToExplorePayloadFromFleet(...)` — 件数＋ ID を揃えて作る

分隊サイズ: 既存どおり `wingmanCountFromMechs(deployableMechs)`（隊長 1 + 僚機 `N-1`、N≤3）。

---

## 4. 出力（explore 帰還）

### 4.1 サルベージ（explore → sort）— 維持

既存 `ExploreResult` / `ExploreToSortPayload`:

- `isExtracted`
- `salvagedContainers` / `totalStockPieces`
- `carrierCapacity` / `maxOperationTimeSec` / `ammoStock`

sort 側入力はこれまでどおり。本 PR では触らない。

### 4.2 機体摩耗（explore → hub）— 新規

```ts
type MechWearReport = {
  instanceId: string;
  durabilityBefore: number;
  durabilityAfter: number;
  statusAfter: MechStatus;
  wearApplied: number;
};

type ExploreSortieOutcome = ExploreResult & {
  returnKind: SortieReturnKind; // extract | abort | fail
  deployedInstanceIds: string[];
  mechWear: MechWearReport[];
};
```

拠点向けハンドオフ（URL はコンパクト形可）:

```ts
type ExploreToHubWearPayload = {
  returnKind: SortieReturnKind;
  mechWear: Array<{ instanceId: string; durabilityAfter: number }>;
};
```

例:

```text
?returnKind=extract&mechWear=owned_a:85;owned_b:40
```

hub は `durabilityAfter` を正として `syncMechStatus` 相当で `OwnedMech` を更新する（`applyWearReportsToFleet`）。

### 4.3 仮の摩耗ルール（出撃イベント）

当面は `MECH_FLEET_RULES` の帰還種別フラット減（`docs/MECH_FLEET.md` §5 と同じ）:

| `SortieReturnKind` | 意味（仮） | 耐久減 |
|---|---|---|
| `extract` | 生還・回収成功 | 15 |
| `abort` | 途中撤退 | 20 |
| `fail` | 失敗・未生還相当 | 35 |

後続（最小 explore 実装時に足してよい）:

- 出撃中の危険イベントごとに追加ダメージを積み、帰還時に `durabilityAfter` へ反映
- 既に大破の機体はこれ以上減らさない（既存 `wearAfterSortie`）

ヘルパ: `buildWearReportsForSortie` / `applyWearReportsToFleet` / `createExploreSortieOutcome`。

---

## 5. 型・ハンドオフ対応表

| 概念 | シンボル | 場所 |
|---|---|---|
| 所有機体 | `OwnedMech` | `mech-fleet.ts` |
| 状態 | `MechStatus` | 同上 |
| 健在フィルタ | `canDeploy` / `filterToDeployableIds` | 同上 |
| 探索結果（サルベージ） | `ExploreResult` | `expedition.ts` |
| 出撃成果（サルベージ+摩耗） | `ExploreSortieOutcome` | `expedition.ts` |
| 摩耗1件 | `MechWearReport` | `mech-fleet.ts` |
| trade→explore | `TradeToExplorePayload`（+ `deployedInstanceIds`） | `handoff.ts` |
| explore→hub 摩耗 | `ExploreToHubWearPayload` | `handoff.ts` |
| explore→sort | `ExploreToSortPayload`（変更なし） | `handoff.ts` |

**版メモ:** ハンドオフ URL はクエリ追加のみ（破壊的リネームなし）。`deployedInstanceIds` / `mechWear` / `returnKind` が無ければ v1 パーサ経路。

---

## 6. 受け入れ（後続の最小 explore 実装時）

1. hub が要修理・大破を選んでも URL／ペイロードに乗らない（または explore 側で落とす）  
2. 健在 ID が `deployedInstanceIds` として explore に渡り、分隊数がそれと整合する  
3. 生還時: sort へ既存どおり缶・ピースが渡る **かつ** hub へ各機の `durabilityAfter` が渡る  
4. `fail` / `abort` でも摩耗報告が付き、拠点フリートの状態が 健在→要修理→大破 に遷移しうる  
5. `npm run test -w @estg/shared` が通る（本 PR の契約ヘルパ含む）  
6. sort のルール／成果物 ID は変更しない  

---

## 7. 明示的に後回し（非ゴール）

- Module 2（sort）からの修理資材・パーツ ID 成果  
- trade ハンガー UI・修理／解体ボタン実装  
- explore 本番ワールド（敵・部位破壊・個別イベント表の本バランス）  
- ジオ／都市度による摩耗補正  
- `ExploreResult` フィールドの破壊的リネーム  
- 同一オリジン化前の複雑なバス実装（まずは URL ハンドオフで足りる）

---

## 8. shared 実装メモ（本 PR）

| シンボル | 役割 |
|---|---|
| `MechWearReport` / `buildWearReportsForSortie` / `applyWearReportsToFleet` | 帰還摩耗の純データ |
| `filterToDeployableIds` / `selectDeployableInstanceIds` | 健在のみ配備 |
| `ExploreSortieOutcome` / `createExploreSortieOutcome` | サルベージ + 摩耗の統合成果 |
| `buildTradeToExploreUrl` / `parseTradeToExploreSearch` | `deployedInstanceIds` + `mechDurability`（後方互換） |
| `buildExploreToHubWearUrl` / `parseExploreToHubWearSearch` | 摩耗の帰路 |
| `resolveModuleBaseUrl` / `LOCAL_DEV_MODULE_URLS` | localhost では vite ポートへ（本番は MODULE_URLS） |

定数の単一ソースは引き続き `MECH_FLEET_RULES`。本ドキュメントの表はそれと揃えること。

---

## 9. 試し方（wear I/O wire）

```bash
npm install
npm run dev:trade    # http://localhost:5175/
npm run dev:explore  # http://localhost:5173/
```

1. trade: 「機体を受領」→ 健在を選択 →「探索へ」（URL に `deployedInstanceIds` と `mechDurability`）
2. explore: 出撃 → **撤退**（または EXTRACT 生還）→ 結果に MechWearReport 表 →「格納庫へ」（摩耗は chip）
3. trade: ログに `帰還ウェア …`、耐久バー／状態が更新され HubSave に残る（リロードで確認）
4. ライブ往復が難しい場合: trade の「シミュ帰還 extract/abort/fail」でも同じ適用経路を確認可

localhost では `resolveModuleBaseUrl` が explore↔trade を `:5173` / `:5175` に向ける（`.grok.me` は非 localhost）。
