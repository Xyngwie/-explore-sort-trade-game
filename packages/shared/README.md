# @estg/shared

共通契約パッケージ。モジュール実装より先にここを正とする。

| ファイル | 内容 |
|---|---|
| `constants.ts` | モジュールURL、セーブキー、ピース換算 |
| `catalog.ts` | 機体・弾薬 ID |
| `expedition.ts` | `PlayerExpeditionState` / 精製結果 / 変換ヘルパ |
| `handoff.ts` | URLクエリの build/parse（explore⇄sort⇄trade） |
| `hub-save.ts` | 拠点セーブ v1 の正規化・読み書き |

変更する場合は親ボット（参謀）の承認後に PR。
