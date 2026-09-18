# @estg/shared

共通契約パッケージ。モジュール実装より先にここを正とする。

| ファイル | 内容 |
|---|---|
| `constants.ts` | モジュールURL、セーブキー、ピース換算 |
| `catalog.ts` | 機体・弾薬 ID |
| `expedition.ts` | `PlayerExpeditionState` / 精製結果 / 変換ヘルパ |
| `handoff.ts` | URLクエリの build/parse（explore⇄sort⇄trade + M4/M5 キー契約） |
| `hub-save.ts` | 拠点セーブ v2（v1 から移行）の正規化・読み書き |
| `mech-fleet.ts` | 所有機体・耐久状態・修理/スクラップ純関数 |
| `sort-yield.ts` | 精製成果の汎用資材／特定パーツ ID・`YieldBag` |
| `geolocation.ts` | 位置取得・許可・粗いグリッド（ルール未実装） |
| `sector-density.ts` | Module 4 Chebyshev 密度プレースホルダ（純関数） |
| `circuit-board.ts` | Module 5 `CircuitBoardState` + `edgeState` encode/decode スタブ |

変更する場合は親ボット（参謀）の承認後に PR。

Module 4 / 5 のドラフト仕様: [`docs/INVADE_V0.md`](../../docs/INVADE_V0.md)、[`docs/RESTORE_V0.md`](../../docs/RESTORE_V0.md)。  
ハンドオフ KEY CONTRACT: [`docs/HANDOFF_M45_V0.md`](../../docs/HANDOFF_M45_V0.md)（UI ナビは未配線。`MODULE_URLS` / `ModuleKey` に invade・restore あり）。
