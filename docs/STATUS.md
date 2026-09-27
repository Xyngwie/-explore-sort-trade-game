# 進行状況（STATUS）

作業を再開する側はまずこのファイル、開いている PR、`main` の最新デプロイ結果を読む。作業を止める側は止まる前にこのファイルを更新する。運用ルールは [`ORCHESTRATION.md`](./ORCHESTRATION.md) を参照。

## 最終更新

- 2026-09-28 JST / Cursor（Grok Bot）

## 最後にデプロイ成功した main コミット

- `2ee3b27` — Merge pull request #130（fix/resource-handoff-anti-dup：Sort→Trade の一回限りハンドオフの重複取り込み防止）
- `Deploy Modules Preview` run 36293608344：success（2026-09-27 13:11 JST 開始）
- 確認コマンド: `gh run list --workflow "Deploy Modules Preview" --branch main --limit 5`

## 開いている PR

- #121 fix: restore Explore dot vector helper export — `math.ts` に `dot` を戻す PR。`df1689f` で `main` に `dot` が既に戻っているため不要。**クローズ候補**（`math.ts` の別位置に追加する差分のため、マージすると `dot` が二重定義になる恐れがある。マージしない）

## 進行中／次にやること

後片付け:

- 壊れた `.github/workflows/gemini-playtest.yml` の扱いを決める（削除候補）
- #121 のクローズ（クローズ候補）

バックログ:

- フルスクリーン PWA の殻と場面遷移の統一
- 回路で Explore コマンドを解放する仕組み: **基盤は実装済み**（[`EXPLORE_COMMAND_UNLOCK_V0.md`](./EXPLORE_COMMAND_UNLOCK_V0.md)。プレビューは全解放が既定＋DEBUG トグル）。次: 回路→コマンド対応表・レア度（Phase 3）、装備回路を trade→explore へ渡す任意フィールド（契約変更のため要承認）、僚機帯同の回路ゲート
- 価格バランスの調整は、新機体など目標アイテムを追加した後に行う

## 既知の問題

- ルート `npm test` は `main` の時点で shared / sort / trade / restore の selftest が失敗している（2026-09-28 確認。例: shared `BASIC_MATERIAL_IDS` が `sort-yield` から export されていない、sort `yieldBag scaled by craftMultiplier`、trade `hangar.selftest.ts:170`、restore `circuit.selftest.ts:579`）。typecheck と各モジュールのビルドは通る。explore の selftest は回路解放基盤 PR で古いアサーション（V カバー）を修正して緑。
- `.github/workflows/gemini-playtest.yml` の字下げが崩れており（`on:` 以下が段々に深くなっている）、`main` への push のたびに Actions でこの workflow が失敗表示になる。`Deploy Modules Preview` とは別 workflow で、デプロイには影響しない（例: `2ee3b27` では gemini-playtest が failure、Deploy Modules Preview は success）。
