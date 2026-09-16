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
