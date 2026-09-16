# Module 2 → Module 3 仮アダプタ仕様（v0）

日付: 2026-09-15  
対象: Athanor（M2）→ BASE HUB（M3）  
方針: 薄いアダプタだけでループを通す。見た目・3資源の本格分岐は後回し。

---

## 1. ゴール

精製完了後、M2の成果が M3 の `materials` / `importedMaterials` に入り、売却→配備→弾薬の流れに乗ること。

**非ゴール（v0）:** 食料／部品／電力の別在庫、ロスのペナルティUI、アプリ統合（単一URL）、Module 1 接続。

---

## 2. 仮マッピング（雑でよい）

M2 出力（`CraftingPuzzleResult` / `applyPuzzleResult` 後の `PlayerExpeditionState`）:

| フィールド | 扱い（v0） |
|---|---|
| `yieldFood` | 合算に含める |
| `yieldMaterial` | 合算に含める |
| `yieldEnergy` | 合算に含める |
| `craftMultiplier` | 合算に掛ける（任意だが推奨） |
| `scrapLossCount` | v0では無視（ログに出してもよい） |
| `finalQualityRank` | v0では無視 |

**換算式（推奨）:**

```ts
raw = yieldFood + yieldMaterial + yieldEnergy
importedMaterials = Math.max(0, Math.floor(raw * craftMultiplier))
```

M3 受け取り:

| フィールド | 操作 |
|---|---|
| `importedMaterials` | 上記の値をセット（IN · Module 2 表示用） |
| `materials` | **加算**する（既存デモ初期値250は、初回import時にどうするか下記） |

**初回デモ値の扱い（どちらか一方を採用し、READMEに一文）:**

- **A（推奨）:** `importFromModule2` 成功時、`materials = materials + imported`（250のデモ在庫は残す）  
- **B:** 初回だけ `materials = imported` に置き換え、デモ250は捨てる  

v0は **A** でよい。

---

## 3. 輸送キー（別URLのまま繋ぐ）

両アプリが別 `grok.me` のあいだは、ブラウザ `localStorage` を共有できない（オリジンが違う）。  
v0の現実解は次のいずれか。

### 案1 — URLクエリで渡す（いちばん簡単・推奨）

1. M2 結果画面に「格納庫へ渡す」ボタン  
2. M3 のURLを開き、クエリを付ける:

```
https://mist-river-velvet-drum.grok.me/?importMaterials=123&craftMultiplier=1.05
```

（本番URLは神宮のM3リンクに合わせる）

3. M3起動時にクエリを読み、`importFromModule2` を一度呼び、履歴汚染を避けるため `replaceState` でクエリを消す

### 案2 — 手動コピペ（フォールバック）

M2が表示する JSON / 数値をコピー → M3に「貼り付けて取込」欄。URLがまだ固定できないとき用。

### 案3 — 同一オリジン統合（後で）

1アプリにルート `/workshop` `/hub` を同居させ、メモリ or `localStorage` で渡す。本命だが v0 では必須にしない。

**v0採用: 案1（＋必要なら案2）**

共有ペイロード型:

```ts
export type Module2To3Payload = {
  v: 1;
  importedMaterials: number;
  craftMultiplier: number;
  yieldFood: number;
  yieldMaterial: number;
  yieldEnergy: number;
  scrapLossCount: number;
  at: string; // ISO time, optional
};
```

URLでは最低限 `importMaterials`（と任意で `craftMultiplier`）だけでも可。フルは `payload` を base64url(JSON) でもよいが、v0は数値クエリで十分。

---

## 4. M3 に足すもの（必須）

ファイル目安: `src/lib/hub-store.ts`, `src/lib/economy.ts`, `src/components/base-hub.tsx`

### 4.1 `importFromModule2`

```ts
importFromModule2(payload: {
  importedMaterials: number;
  craftMultiplier?: number;
}): boolean
```

挙動:

1. `n = floor(importedMaterials)`。`n <= 0` なら false  
2. `importedMaterials` 状態を `n` にセット（表示用。上書きでよい）  
3. `materials += n`（案A）  
4. ログに例: `Import · Module 2 · +{n} u`  
5. true

### 4.2 起動時ハイドレート

`base-hub` マウント時（または `hub-store` 初期化時）:

- `URLSearchParams` から `importMaterials` を読む  
- あれば `importFromModule2` → クエリ削除  
- 無ければ何もしない（従来のデモ250のまま）

### 4.3 UI

- Module bus の `importedMaterials` が 0 以外なら「awaiting refine」を「received」等に変える  
- 任意: 「取込済み」トースト／Commsログ

---

## 5. M2 に足すもの（必須）

ファイル目安: `ResultPhase` / `Workshop` 完了後

1. 精製完了後、すでに呼んでいる `applyPuzzleResult` はそのまま  
2. 換算式で `importedMaterials` を計算  
3. ボタン **「格納庫へ渡す」**:
   - `HUB_URL`（定数。神宮の M3 grok.me）へ  
   - `?importMaterials={n}&craftMultiplier={m}` で `window.location.assign` または `window.open`  
4. ボタン横に数値プレビュー（部品換算 n）を出し、失敗時に分かるようにする

`HUB_URL` は1か所の定数に置く。

---

## 6. 受け入れ条件（これでOK）

1. M2で精製完了 →「格納庫へ渡す」→ M3が開く  
2. M3の `importedMaterials` が 0 より大きい  
3. `materials` が増えている（売却できる）  
4. 既存の売却→機体→弾薬フローが壊れていない  
5. クエリ無しでM3を開くと、従来どおり動く（デモ初期値）

---

## 7. Grok Build 向けコピペ指示

### → Athanor（Module 2）に貼る文

```
【改修】Module 3（BASE HUB）へ精製結果を渡す仮アダプタを足してください。

換算:
  importedMaterials = floor( (yieldFood + yieldMaterial + yieldEnergy) * craftMultiplier )

精製結果画面に「格納庫へ渡す」ボタンを追加。
押すと HUB_URL（定数。とりあえず https://mist-river-velvet-drum.grok.me ）を
  ?importMaterials={n}&craftMultiplier={m}
付きで開く。

applyPuzzleResult は現状どおり残す。食料/部品/電力の別送はしない。
定数 HUB_URL は1か所にまとめる。
```

### → BASE HUB（Module 3）に貼る文

```
【改修】Module 2 からの仮受取を実装してください。

hub-store に importFromModule2({ importedMaterials }) を追加:
  - importedMaterials をセット
  - materials に加算
  - ログに Import · Module 2 · +N u

起動時に URL の ?importMaterials= を読み、あれば importFromModule2 を1回呼び、
その後クエリを消す。

クエリ無しの通常起動は今まで通り（初期 materials 250 など）で壊さないこと。
Module bus の importedMaterials 表示が 0 以外なら received と分かるように。
```

---

## 8. 次（このあとでよい）

- M1 → M2（`salvagedContainers` / `puzzleInputFromExpedition`）も同じ「URL or 統合」パターン  
- M3 → M1（`deployableMechs` / `startingAmmo`）  
- いずれ単一アプリ化して `localStorage` / メモリバスに置換
