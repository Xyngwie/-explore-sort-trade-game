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
- 回路で Explore コマンドを解放する仕組みの設計
- 価格バランスの調整は、新機体など目標アイテムを追加した後に行う

## 既知の問題

- `.github/workflows/gemini-playtest.yml` の字下げが崩れており（`on:` 以下が段々に深くなっている）、`main` への push のたびに Actions でこの workflow が失敗表示になる。`Deploy Modules Preview` とは別 workflow で、デプロイには影響しない（例: `2ee3b27` では gemini-playtest が failure、Deploy Modules Preview は success）。
