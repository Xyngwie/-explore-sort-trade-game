# 進行状況（STATUS）

作業を再開する側はまずこのファイル、開いている PR、`main` の最新デプロイ結果を読む。作業を止める側は止まる前にこのファイルを更新する。運用ルールは [`ORCHESTRATION.md`](./ORCHESTRATION.md) を参照。

## 最終更新

- 2026-09-28 JST / Cursor（Grok Bot）— 回路・部隊設計 v0 の決定事項メモ（`CIRCUIT_SQUAD_DESIGN_V0.md`）と仕様変更 9 項目を追加（文書のみ）。それ以前: 置き去り僚機の結果画面 1 行表示（#141）、explore selftest の flaky 決定化（#140）、Explore `wing_mobility` ゲート追加（#139）。同日 01:42 JST にルート `npm test` の既存失敗を修正（#136 / #138）、#134 後の trade ビルド破損を #137 で修正

## 最後にデプロイ成功した main コミット

- `31933d1` — feat(explore): result-screen line per left-behind wingman (#141)（この PR 作成時点で最新の success）
- `Deploy Modules Preview` run 36335478773：success（2026-09-28 02:03 JST 開始）
- 直近の赤: #134 マージ `9b96158`（01:31 JST）と `624f49b`（#136）は `Build trade` の型エラーで failure → #137（`259b613`）で fix forward
- 確認コマンド: `gh run list --workflow "Deploy Modules Preview" --branch main --limit 5`

## 開いている PR

- 回路・部隊設計 v0 文書 PR のみ（#121 はクローズ済み）

## 進行中／次にやること

後片付け:

- 壊れた `.github/workflows/gemini-playtest.yml` の扱いを決める（削除候補）

バックログ:

- フルスクリーン PWA の殻と場面遷移の統一
- 回路で Explore コマンドを解放する仕組み: **基盤は実装済み**（[`EXPLORE_COMMAND_UNLOCK_V0.md`](./EXPLORE_COMMAND_UNLOCK_V0.md)。プレビューは全解放が既定＋DEBUG トグル）。次: 回路→コマンド対応表・レア度（Phase 3）、装備回路を trade→explore へ渡す任意フィールド（契約変更のため要承認）。僚機の移動 `wing_mobility` はゲート実装済み（release・回路なしは静止＋自衛射撃）。離昇時に置き去りになった僚機は結果画面に 1 行表示（回路なし／搭乗円の外を区別。表示のみで救済・大破機持ち帰りは設計中）
- 価格バランスの調整は、新機体など目標アイテムを追加した後に行う
- trade に残る旧 typed-repair（`packages/trade/src/legacy-typed-repair.ts`）とレア売却 UI は、後の価格・経済タスクで移行か削除かをまとめて決める（それまでコードは触らない）

回路・部隊設計 v0 由来の仕様変更（[`CIRCUIT_SQUAD_DESIGN_V0.md`](./CIRCUIT_SQUAD_DESIGN_V0.md)。各項目は別タスク、未着手）:

1. 回路のデータモデル：機体ごとの枠、コモンの枠拡張、部隊の総数上限。
2. モジュール間の受け渡し形式の変更（契約変更）：装備回路を Explore へ渡す／落とし物の記録を Invade から Explore へ渡す。まとめて設計する。
3. Invade の段位：クリアで段と上限が上がる、盤面途中の撤退で一段下がる、段に応じた Explore の難易度。
4. Explore の背負い：積載2、速度低下、回路の合算、大破していない機体の背負いと降機。
5. Explore の隊長機大破：即失敗の廃止、撤退ボタン、背負われたときの手動操作、救助費用（所持金の半分）。
6. 落とし物の永続化と回収、上限超過時の選択（HUB）。
7. HUB：付け替え（HUB のみ・無料）、回路購入、初回クリア報酬のお金。
8. 開始状態：僚機0、上限0、1機目の機体は無料。
9. バランス検証：素の機体が敵に順番に何体勝てるか、2体同時ではどうなるかをシミュレーションで数値化する。

## 既知の問題

- ~~explore selftest が約 1 割の確率で失敗する~~ → **解消済み（2026-09-28, テスト側のみ）**。原因は、ランダムなカバー配置（`coverObjects.ts`）でコンテナ上の隊長がカバー中心へ吸着され回収半径から外れること（失敗 25/25 件で吸着範囲内にカバーあり）。`selftest.ts` で `Math.random` を固定シード（mulberry32）に差し替え、コンテナ上・直進テスト経路の近くのカバーをテスト内で除去（`clearCoverNear`）。本番コード・カバー挙動は無変更。同原因の潜在 flake（cargo 速度テスト）も同時に対処
- `.github/workflows/gemini-playtest.yml` の字下げが崩れており（`on:` 以下が段々に深くなっている）、`main` への push のたびに Actions でこの workflow が失敗表示になる。`Deploy Modules Preview` とは別 workflow で、デプロイには影響しない（例: `2ee3b27` では gemini-playtest が failure、Deploy Modules Preview は success）。
