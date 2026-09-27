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
- `fleet` は既知 `MechId` のみ、長さ ≤ `maxMechs`  
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
- `perfectMaxSize: number`（0〜64）。パーフェクト（Fully Awakened かつ locked）にできた最大の辺。欠落時（v1/v2 からの移行）は既存のパーフェクト回路の最大辺で初期化（U11）。保存値があればそのまま使う（売っても下がらない）。
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

