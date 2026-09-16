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
