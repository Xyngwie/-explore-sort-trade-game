# 進行状況（STATUS）

作業を再開する側はまずこのファイル、開いている PR、`main` の最新デプロイ結果を読む。作業を止める側は止まる前にこのファイルを更新する。運用ルールは [`ORCHESTRATION.md`](./ORCHESTRATION.md) を参照。

## 最終更新

- 2026-09-28 01:42 JST / Cursor（Grok Bot）— ルート `npm test` の既存失敗（shared / sort / trade / restore）を修正（#136・本 PR）、#134 後の trade ビルド破損を #137 で修正

## 最後にデプロイ成功した main コミット

- `259b613` — fix(trade): restore Pages build after #134 (#137)（この STATUS 更新 PR 作成時点で最新の success。本 PR 自身のマージコミットのデプロイ結果は PR / Actions を参照）
- `Deploy Modules Preview` run 36334072660：success（2026-09-28 01:40 JST 開始）
- 直前の赤: #134 マージ `9b96158`（01:31 JST）と `624f49b`（#136）は `Build trade` の型エラーで failure → #137 で fix forward
- 確認コマンド: `gh run list --workflow "Deploy Modules Preview" --branch main --limit 5`

## 開いている PR

- なし（2026-09-28 01:42 JST 時点。#121 はクローズ済み）

## 進行中／次にやること

後片付け:

- 壊れた `.github/workflows/gemini-playtest.yml` の扱いを決める（削除候補）

バックログ:

- フルスクリーン PWA の殻と場面遷移の統一
- 回路で Explore コマンドを解放する仕組み: **基盤は実装済み**（[`EXPLORE_COMMAND_UNLOCK_V0.md`](./EXPLORE_COMMAND_UNLOCK_V0.md)。プレビューは全解放が既定＋DEBUG トグル）。次: 回路→コマンド対応表・レア度（Phase 3）、装備回路を trade→explore へ渡す任意フィールド（契約変更のため要承認）、僚機の移動を回路で解放（`wing_mobility`、次 PR 予定）
- 価格バランスの調整は、新機体など目標アイテムを追加した後に行う

## 既知の問題

- `.github/workflows/gemini-playtest.yml` の字下げが崩れており（`on:` 以下が段々に深くなっている）、`main` への push のたびに Actions でこの workflow が失敗表示になる。`Deploy Modules Preview` とは別 workflow で、デプロイには影響しない（例: `2ee3b27` では gemini-playtest が failure、Deploy Modules Preview は success）。
