# 進行状況（STATUS）

作業を再開する側はまずこのファイル、開いている PR、`main` の最新デプロイ結果を読む。作業を止める側は止まる前にこのファイルを更新する。運用ルールは [`ORCHESTRATION.md`](./ORCHESTRATION.md) を参照。

## 最終更新

- 2026-09-28 JST / Cursor（Grok Bot）— Explore `wing_mobility` ゲート追加。同日 01:42 JST にルート `npm test` の既存失敗を修正（#136 / #138）、#134 後の trade ビルド破損を #137 で修正

## 最後にデプロイ成功した main コミット

- `98dcf2e` — test(restore): align rule-guide selftest with #101 + STATUS update (#138)（この PR 作成時点で最新の success）
- `Deploy Modules Preview` run 36334183386：success（2026-09-28 01:41 JST 開始）
- 直近の赤: #134 マージ `9b96158`（01:31 JST）と `624f49b`（#136）は `Build trade` の型エラーで failure → #137（`259b613`）で fix forward
- 確認コマンド: `gh run list --workflow "Deploy Modules Preview" --branch main --limit 5`

## 開いている PR

- `wing_mobility` ゲート PR のみ（#121 はクローズ済み）

## 進行中／次にやること

後片付け:

- 壊れた `.github/workflows/gemini-playtest.yml` の扱いを決める（削除候補）

バックログ:

- フルスクリーン PWA の殻と場面遷移の統一
- 回路で Explore コマンドを解放する仕組み: **基盤は実装済み**（[`EXPLORE_COMMAND_UNLOCK_V0.md`](./EXPLORE_COMMAND_UNLOCK_V0.md)。プレビューは全解放が既定＋DEBUG トグル）。次: 回路→コマンド対応表・レア度（Phase 3）、装備回路を trade→explore へ渡す任意フィールド（契約変更のため要承認）。僚機の移動 `wing_mobility` はゲート実装済み（release・回路なしは静止＋自衛射撃）
- 価格バランスの調整は、新機体など目標アイテムを追加した後に行う

## 既知の問題

- explore selftest が約 1 割の確率で失敗する（main でも再現・既存）。`selftest.ts` の「captain auto-salvage」（L442 付近）と「unlimited carry」（L1048 付近）で、カバー配置が `Math.random()`（`coverObjects.ts`）のため、隊長がコンテナ上でカバーに吸われて回収半径から外れることがあると推定。再実行で通る。テストの決定化が必要（カバー挙動は変えない）。
- `.github/workflows/gemini-playtest.yml` の字下げが崩れており（`on:` 以下が段々に深くなっている）、`main` への push のたびに Actions でこの workflow が失敗表示になる。`Deploy Modules Preview` とは別 workflow で、デプロイには影響しない（例: `2ee3b27` では gemini-playtest が failure、Deploy Modules Preview は success）。
