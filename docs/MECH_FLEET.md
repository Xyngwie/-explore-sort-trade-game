# 機体フリート循環（永続ハンガー）

**ステータス:** 採用方針（2026-09-17）・型とヘルパは `packages/shared`、trade UI は後続  
**目的:** Module 3（BASE HUB）で機体が「出撃のたびに買い直す消耗品」に見えないよう、**所有インスタンス**の耐久・修理・スクラップ循環を入れる。

関連: `docs/HUB_SAVE_CONTRACT.md`、`packages/shared` の `mech-fleet.ts` / `hub-save.ts`、explore の `deployableMechs` ハンドオフ。

---

## 1. ひとことで

**カタログ ID（`MechId`）は機種、ハンガーの各スロットは所有インスタンス（耐久と状態を持つ）。帰還で摩耗し、要修理は資材／クレジットで直し、大破や不要機は解体して少し戻す。**

---

## 2. ライフサイクル

```text
購入 / 受領
  → ハンガー登録（OwnedMech, 健在・耐久満タン）
  → 出撃（健在のみ配備可）
  → 帰還ウェア（耐久減 → 状態再計算）
  → 要修理なら修理（コスト支払い → 満タン健在）
  → またはスクラップ（艦隊から削除 → 少量の credits/materials）
```

UI（trade 最小ハンガー）は本 PR の範囲外。shared の純関数で状態遷移できるようにする。

---

## 3. 状態（Status）

| Enum (`MechStatus`) | 日本語 | 意味 | 出撃 |
|---|---|---|---|
| `operational` | 健在 | 耐久が閾値以上 | 可 |
| `needs_repair` | 要修理 | 耐久が残っているが閾値未満 | 不可 |
| `destroyed` | 大破 | 耐久 0 | 不可（修理不可・解体のみ） |

耐久から状態を再計算する（セーブ上の `status` と食い違う場合は耐久側を正とする）:

```text
durability <= 0                         → destroyed（大破）
1 .. operationalMinDurability-1         → needs_repair（要修理）
operationalMinDurability .. max         → operational（健在）
```

仮定数（`MECH_FLEET_RULES`）:

```text
defaultDurabilityMax       = 100
operationalMinDurability   = 41    # 41以上で健在
```

---

## 4. 所有インスタンス型

```ts
type OwnedMech = {
  instanceId: string;   // セーブ内で一意
  catalogId: MechId;    // mech_gen1 | mech_gen2
  status: MechStatus;
  durability: number;   // 0 .. durabilityMax
  durabilityMax: number;
};
```

`HubSnapshot.fleet` は **`OwnedMech[]`**（最大 `HUB_LIMITS.maxMechs` = 3）。  
旧 `MechId[]` はロード時にマイグレーションする（下記）。

---

## 5. 帰還ウェア（仮）

出撃に出した各インスタンスに、帰還種別で耐久を減らす:

| `SortieReturnKind` | 意味（仮） | 耐久減 |
|---|---|---|
| `extract` | 生還・回収成功 | 15 |
| `abort` | 途中撤退 | 20 |
| `fail` | 失敗・未生還相当 | 35 |

ヘルパ: `wearAfterSortie` / `wearFleetAfterSortie`。  
既に大破の機体はこれ以上減らさない。

explore 側は当面 `deployableMechs` 件数ハンドオフのままでよい。  
**どの instanceId が出たか**を trade←→explore で渡すのは後続（非ゴール）。

---

## 6. 修理コスト（仮）

- 対象: **要修理のみ**（大破は修理不可）
- 効果: 耐久を `durabilityMax` まで回復 → 健在
- コスト（固定・仮）:

```text
repairCredits   = 50
repairMaterials = 30
```

ヘルパ: `repairCost` / `canAffordRepair` / `applyRepair`（ウォレットと機体をともに返す。足りなければ `null`）。

---

## 7. スクラップ回収（仮）

解体でハンガーから削除し、状態に応じた少量を返す:

| 状態 | credits | materials |
|---|---:|---:|
| 健在 `operational` | 40 | 15 |
| 要修理 `needs_repair` | 20 | 10 |
| 大破 `destroyed` | 10 | 5 |

`mech_gen2` はボーナス `+10 credits / +5 materials`（仮）。

ヘルパ: `scrapYield` / `applyScrap`。

---

## 8. 拠点セーブとの交差

### 8.1 版

| | 内容 |
|---|---|
| ペイロード | **`HubSaveV2`（`v: 2`）** が現行。`createHubSave` は常に v2 を書く |
| ストレージキー | 当面 **`wreckline.hubSave.v1` のまま**（キー名は互換。中身の `v` で判別） |
| 読込 | `parseHubSave` は **`v: 1` と `v: 2` を受け付け**、正規化後は常に `HubSaveV2` |

### 8.2 v1 → v2 マイグレーション

v1 の `fleet: MechId[]`（文字列の機種 ID）:

```text
各 MechId → OwnedMech {
  instanceId: "migrated_<MechId>_<n>",
  catalogId: MechId,
  durability / max: 100,
  status: operational
}
```

混在配列（文字列とオブジェクト）も `normalizeFleet` が吸収する。  
`v !== 1 && v !== 2` は従来どおり無視して初期化。

### 8.3 セーブに残す／残さない

| 残す | 残さない（本仕様） |
|---|---|
| 各 `OwnedMech` 全フィールド | 出撃中の一時 HP・位置 |
| credits / materials / ammo 等既存 | 「どの機が今出撃中か」のランタイムのみ状態 |

修理・解体のたびに既存どおり hub 自動セーブ想定（UI 実装時）。

---

## 9. explore / trade 改訂メモ

**trade（後続・最小ハンガー）**

- 艦隊リスト（状態・耐久バー）
- 修理ボタン（コスト表示、不足時 disabled）
- スクラップ確認
- 出撃コミット時は `canDeploy` な機だけ数え、既存 `deployableMechs` に載せる

**explore（当面）**

- ハンドオフは件数のまま（`deployableMechs` / `startingAmmo`）
- 帰還後のウェア適用は **trade に戻ったとき**、または同一アプリ化後の共有ストアで行う想定
- instanceId 付きラウンドトリップは非ゴール

**sort**

- 変更なし（資材搬入のみ）

---

## 10. 受け入れ（本 PR / 型レイヤ）

1. `OwnedMech` / `MechStatus` と純関数が `@estg/shared` から export される  
2. `wearAfterSortie` で閾値をまたぐと 健在→要修理→大破 になる  
3. `applyRepair` は要修理のみ成功し、コストを差し引く  
4. `applyScrap` で機体が消え、仮表どおりの回収がある  
5. v1 セーブ（`fleet: ["mech_gen1"]`）を読むと v2 + 所有インスタンスに正規化される  
6. `npm run test -w @estg/shared`（typecheck + selftest）が通る  
7. trade / explore の本格 UI は含まない

---

## 11. 明示的に後回し（非ゴール）

- trade ハンガー画面・修理/解体 UI  
- explore への `instanceId[]` ハンドオフ  
- 部位破壊・個別パーツ修理  
- 保険・自動修理スキル  
- 耐久以外のコンディション（熱・汚染など）  
- バランス本調整（上の数値はすべて仮）

---

## 12. shared 実装メモ

| シンボル | 役割 |
|---|---|
| `mech-fleet.ts` | 型・ルール定数・純関数 |
| `hub-save.ts` | `HubSnapshot.fleet: OwnedMech[]`、`HubSaveV2`、v1 読込移行 |
| `canDeploy` / `countDeployable` | 出撃可能判定・件数 |

定数の単一ソースはコード側 `MECH_FLEET_RULES`。本ドキュメントの表はそれと揃えること。
