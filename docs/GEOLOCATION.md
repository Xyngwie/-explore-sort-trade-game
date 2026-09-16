# 位置情報（Phase 0）

**範囲:** 取得＋許可フローのみ。拠点ボーナス／マップシード／チェックインは後続。

## shared API

- `requestBrowserGeolocation()` → `GeoResult`
- `queryGeolocationPermission()` → prompt/granted/denied/unknown
- `coarsenFix(fix)` → 粗い lat/lon（既定 0.01° ≒ 1km）
- 拒否・未対応・タイムアウトは `ok: false` で返し、アプリは落とさない

## UI 推奨

1. ユーザー操作（ボタン）から取得を開始する  
2. 許可前に「ゲーム用に粗い位置だけ使う」と短く説明  
3. 拒否時は手動フォールバック（スキップ／後で聞く）を残す  
4. 生の高精度座標をログやURLに載せない（必要なら `coarsenFix` のみ）

## Build 向け最小指示（trade など）

```
【改修】位置情報の取得と許可フローだけ追加（ゲーム効果はまだ無し）。

- 「位置を取得」ボタンから navigator.geolocation を呼ぶ
- 許可／拒否／未対応／タイムアウトを画面に表示
- 成功時は緯度経度を粗く丸めて表示（約0.01度）
- 拒否してもアプリは継続できる
- 可能なら @estg/shared の geolocation API に合わせる
```

---

## 将来仕様（未実装）

Phase 0 の粗い位置（`coarsenFix`）を、**ゲーム用ID**に変換してからルールに使う。  
生の lat/lon を難易度や価格式に直接入れない。

### 共通パイプライン

```text
GeoFix
  → coarsenFix (grid)
  → resolveGeoContext (ゲーム用コンテキスト)
  → explore / trade が参照
```

拒否・未対応・タイムアウト時は **中立コンテキスト**（標準難易度・標準相場）にフォールバックし、周回を止めない。

### Explore（出撃）— 都市度 → 難易度

| 概念 | 意味 |
|---|---|
| `urbanScore` | 0（郊外／低密度）〜 1（都心／高密度）の仮スコア |
| 効果（案） | 都心ほど敵強度・出現・時計圧が上がる。郊外は易しめ |

仮の型:

```ts
type ExploreGeoModifiers = {
  urbanScore: number; // 0..1
  difficultyMul: number; // e.g. 0.85 .. 1.25
  enemyPressureMul: number;
  timePressureMul: number;
};
```

`urbanScore` の出し方は後で詰める（例: 粗いグリッドのルックアップ表、人口密度タイル、手置きの都心ポリゴン）。最初は東京近傍だけ手置き表でもよい。

### Trade（拠点）— 相場ブロック → 資材価格

| 概念 | 意味 |
|---|---|
| `marketBlockId` | 位置マスから決まる相場ブロックID |
| 効果（案） | ブロックごとに `materialUnitPrice` や買取補正が違う |

仮の型:

```ts
type TradeGeoModifiers = {
  marketBlockId: string; // e.g. "neutral" | "urban-core" | "suburb-a"
  materialSellMul: number; // 売値倍率
  materialBuyMul?: number;
};
```

同一ブロック内では価格を安定させ、ブロック跨ぎでだけ相場が変わる方が分かりやすい。

### セーブとの関係

- 永続化するなら **粗いグリッドキー or `marketBlockId` / 直近 `urbanScore`** まで（生座標は保存しない）
- 拠点セーブ（`HubSaveV1`）に足す場合は shared 契約変更として親承認のうえ版を検討

### やらないこと（当面）

- 住所・POIの精密逆ジオコーディング必須化
- 位置必須（拒否で遊べない）にすること
- URLハンドオフに生座標を載せること
