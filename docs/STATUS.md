## 全画面シェル PC 2 列 HUB（2026-11-01・暫定・draft）
- 幅 1200px 以上の PC で DOCK を 2 列（左＝母艦・小隊ツリー、右＝作戦室・未開封・物資市場、最大 1440px）。細部 8 点は暫定 ★ → [FULLSCREEN_SHELL_V0.md §15](FULLSCREEN_SHELL_V0.md)

## 全画面シェル PR6 各画面フィット（2026-11-01・神宮決定）
- PR6 各画面フィット（#342）：window スクロール前提の解消・記録パネル幅・Alpha Lab 帯のコンパクト化・ブリーフィングでタブ表示 → [FULLSCREEN_SHELL_V0.md §12](FULLSCREEN_SHELL_V0.md)
  - 細部決定：1. ハッシュ付きで開いた時の位置 = パネル内の目的位置へ自動スクロール（神宮決定 2026-11-01）／2. 記録パネルの幅 = シェル列幅基準（最大 960px −16px）（神宮決定 2026-11-01）／3. Alpha Lab 帯 = 閉時 1 行コンパクト帯（神宮決定 2026-11-01）／4. 結果画面のタブ = 非表示（神宮決定 2026-11-01）／5. explore のシェル HUD = ブリーフィングでも非表示（神宮決定 2026-11-01）／6. RESTORE の盤面高さ上限 = window.innerHeight 基準のまま（神宮決定 2026-11-01）
- 整理（#343）：タブ対応・1.2M・960px は決定済みと確認 → [FULLSCREEN_SHELL_V0.md §13](FULLSCREEN_SHELL_V0.md)
  - 1. スマホの短縮表示（12.3k／1.2M）に切り替える画面幅 = 600px 以下（神宮決定 2026-11-01）
  - 2. Alpha Lab 帯を開いたときの高さ上限 = 45dvh・帯の内側でスクロール（神宮決定 2026-11-01）

## 全画面シェル PR5 ジェスチャー（2026-11-01・神宮決定）
- Explore の地図だけ：ダブルタップで 1 倍↔2 倍、ピンチで 1〜2.5 倍、PC はホイール。拡大は表示だけでセーブ・チェックポイントは変わらない。4b・4c は後回し。神宮決定（細部 1〜8）：
  - 1. 拡大の範囲 = 1 倍〜2.5 倍。縮小（1 倍未満）はなし（神宮決定 2026-11-01）
  - 2. ダブルタップ = 1 倍 ↔ 2 倍の切り替え（1 倍より大きいときは 1 倍に戻す）。判定は 0.3 秒以内・30px 以内（神宮決定 2026-11-01）
  - 3. ダブルタップの各タップの扱い = 1 回目と 2 回目も今までどおり地図のタップとして働く（隊長の移動など）。待ち時間は足さない（神宮決定 2026-11-01）
  - 4. 拡大の中心 = 隊長を追う今のカメラの中心のまま。指の位置には寄せず、指でずらす操作はなし（神宮決定 2026-11-01）
  - 5. ピンチ中の 2 本目の指 = 地図のタップにしない（1 本目は普通のタップ）（神宮決定 2026-11-01）
  - 6. PC の操作 = マウスホイールで拡大・縮小（1 段 1.15 倍）。ダブルクリックもダブルタップと同じ（神宮決定 2026-11-01）
  - 7. 拡大率の保存 = 保存しない。再読み込み・次の出撃・再開で 1 倍に戻る（神宮決定 2026-11-01）
  - 8. 倍率の表示 = 出さない（倍率の文字やボタンなし）（神宮決定 2026-11-01）
- テスト：`mapZoom.selftest.ts`（範囲・ピンチ・ダブルタップ・チェックポイント不変・旧チェックポイント）、`verify-map-gestures.cjs`（PC/スマホ：ダブルタップ・ピンチ/ホイール・地図の外では拡大しない・チェックポイントのカメラは 720×420）。
## 全画面シェル PR4 HUB ツリー（2026-11-01・神宮決定）
- DOCK に母艦ツリー（第1小隊・予備格納庫・回路保管庫・物資市場）。タップで該当欄へスクロール、物資市場は Trade の売買カード（Q12）。PR3 の To-do (1)(2) を解消（Cr パレットは購入だけ、箱の購入は確認・長押しなし）。神宮決定（細部 1〜8）は `docs/FULLSCREEN_SHELL_V0.md` §10。
- テスト：`hub-tree.selftest.ts`（数・行き先・セーブ/チェックポイント不変・旧セーブ）、`verify-hub-tree.cjs`（PC/スマホ）、`verify-hud-palette.cjs` に To-do (1)(2) を追加。
## 全画面シェル PR3 機体ゲージ（2026-11-01・神宮決定）
- 青い外輪（装甲）・黄色い中心（電力）・赤い縦棒（弾薬）を 1 つのゲージにまとめ、HUB 機体カードと Explore 僚機カードに置いた。数字はタップで 1.5 秒。神宮決定（細部 1〜13 すべて★）を `docs/FULLSCREEN_SHELL_V0.md` §9 に記録。テスト：`verify-mech-gauge.cjs`（PC/スマホ：HUB 機体カードと出撃中の Explore 僚機カード、値が機体と一致、タップで 1.5 秒・カードを選ばない、セーブ/チェックポイント不変）。
- To-do（PR4 で見直す）：(1)(2) は PR4 で解消（§10）。
## 風紀委員 / 細部は番号と★推奨で聞き、仮実装する（2026-11-01）
- Who: inspector（風紀委員）
- What: 神宮に決めてほしい細部は、番号、選択肢、★推奨をセットで聞く。回答を待つあいだは ★の値で仮実装し、docs に「暫定」と書く。回答が ★ と違うときはその部分だけ直す。仮実装の PR は、回答がそろい、CI と確認スクリプトが緑になるまでマージしない。決まった内容は問いの番号と選んだ中身をセットで docs に残す
- Why: 神宮が、別チームの進め方をここに取り入れると言った（2026-11-01）。続けて、各 Automation の Instructions も同じ進め方に揃えるよう言った。起動は入れない
- Scope: `docs/AGENT_CANON.md`、`docs/automations/INSTRUCTIONS_INSPECTOR.md`、`docs/automations/INSTRUCTIONS_LEAD.md`、`docs/automations/INSTRUCTIONS_ARROW.md`、`docs/automations/INSTRUCTIONS_JAVELIN.md`、`docs/automations/INSTRUCTIONS_TOMAHAWK.md`、`docs/automations/README.md`。機能コードは変えていない。仮実装の `SPEC_DECISION` は出していない。Automations は起動していない。ダッシュボードの Instructions は、このファイルを貼り直すまで古いままである
- Status: この節

## 全画面シェル PR2b HUD 補給・売買パレット（2026-11-01）
- 神宮の決定（長押しの細部 1〜9 も含む）を `docs/FULLSCREEN_SHELL_V0.md` §8 に記録。HUD の 弾・装・電・Cr をタップするとボトムシートが開く。行は 弾・装・電・ジャンクの売買と箱の購入。ページは再読み込みしない。売却は毎回確認する（DOCK カードにも付けた）。導入中も使えて、explore と SORT 受け渡し中は無効。
- テスト：`resource-trade.selftest.ts`（段階・最大・旧 DOCK カードと同じ結果・箱の購入・セーブ/チェックポイント不変・#332）。`verify-hud-palette.cjs`（PC/スマホ：開く・1個・長押し・ずらして取消・確認・再読み込みなし・閉じる・受け渡し中は無効）、`verify-new-game-intro.cjs`、`verify-fullscreen-shell.cjs`、`verify-alpha-lab.cjs` はすべて PASS。
## 全画面シェル PR2 上部 HUD（2026-11-01）
- 神宮決定 1〜12（すべて★）を `docs/FULLSCREEN_SHELL_V0.md` §6 に記録。`#wl-shell-hud`：Cr・弾・装・電・箱、explore 以外で表示、箱タップ＝DOCK `#unopened-panel`。DOCK 所持バーから同 5 項目を削除（艦隊・出撃は残す）。
- テスト：`fullscreen-shell.selftest.ts`（並び・色・0・書式・タップ可否・セーブ/チェックポイント不変）、`trade/src/hud-match.selftest.ts`（旧バーとの値一致）。`verify-new-game-intro.cjs`・`verify-alpha-lab.cjs`・`verify-fullscreen-shell.cjs`（DOCK・SORT のタブ計算スタイル一致）PASS（後者はクレジットを HUD の `data-value` で確認）。
- 追加決定（神宮 11/01）：Alpha Lab 帯は現状維持（PR6 で見直し）／タブバーは各画面のボタンスタイルを上書きして全画面同じ見た目（実装）／スマホ 100 万以上は 1.2M。スマホ判定 600px 以下（神宮決定 2026-11-01、FULLSCREEN_SHELL_V0 §13-1）。

## 全画面1枚完結型UI（FULLSCREEN_SHELL）決定・PR1 外枠シェル（2026-10-31）
- 神宮決定 Q1〜Q12（すべて★）を `docs/FULLSCREEN_SHELL_V0.md` に記録。PR 分割 1 外枠シェル／2 HUD→2b パレット／3 計器／4 HUB ツリー→4b→4c／5 ジェスチャー／6 各画面フィット。
- PR1：100dvh 固定・ページ縦スクロール廃止（`#wl-shell-panel` 内のみスクロール）・touch-action・下部タブ（DOCK=trade, INVADE=invade, SORT=DOCK #unopened-panel, RESTORE=restore, SORTIE=explore／2026-11-01 神宮確定）。Q4 は explore でタブ非表示、Q11 は導入中 DOCK のみ。
- 検証：`npm test`（`fullscreen-shell.selftest.ts`：タブ規則＋セーブ・チェックポイント不変）、`scripts/verify-new-game-intro.cjs` PASS（PC 1280×900／スマホ 390×844）。
- 細部決定（神宮 2026-11-01、すべて★）：①SORT タブ→DOCK `#unopened-panel`（実装済）②RESTORE は回路未選択で開く ③導入中は DOCK のみ ④ブリーフィングでは表示・出撃開始で非表示（PR6 で実装）⑤最大幅 960px。

## Codex / 新規ゲーム導入（2026-10-31・Draft #332）
- Who: Codex（神宮直接指示。Automations起動なし）
- What: codex/new-game-onboarding。支給10コンテナ・機体/回路/資源/資金ゼロ、作成回路の初出撃条件、収穫ゼロ判定
- Why: TASK_ASSIGNMENT「新規ゲーム導入：コンテナ開封から機体・回路作成を経て初出撃」
- Scope: 新規ゲームのみ。既存価格/抽選/通常補給/旧セーブは変更しない。Draftまで、マージ・デプロイなし。
- Status: 起点cf0712326f7dd1e928a84b31ac8d8e02066b811a（#331含む）。Q1=Aで初期支給と購入分を別バッチに確定。共通初期値、無料補完防止、作成回路追跡、出庫/固定結果/受取/取消、初出撃nonceの確定とガードを実装。孤立した戦闘URLは所有セーブなしでデモ機を開始しない。Sortのpointer captureによるタップ不達を再現して補修（閾値/収穫/マッチは不変）。全workspaceテスト・型検査・全5ビルドPASS。PC/390pxで分割ゼロ収穫・出庫/付与/初出撃の失敗再試行・全履歴復元一致PASS。通常収穫184→920c、既存+7c取引212回を経て機体作成/修復/装備/有料弾薬から実際の初出撃まで到達（1,350件復元一致、無料配布・デモなし）。最終入口/実タップ/キーボード/スワイプ・通常購入分の取消/再受取防止・実IDB11ケース・隔離盾6プリセットPASS。検証記録はverification/new-game-intro.json、仕様はNEW_GAME_INTRO.md。最終head/CIはPR本文を参照。物理実機・公開版NOT_RUN。Draft監査待ち、マージ・デプロイなし。

## PR #331 監査修正（2026-10-29 / Codex）

追記：#331はcf0712326f7dd1e928a84b31ac8d8e02066b811aでmainにマージ済み。以下は提出時の記録。

確定済み操作Aの再試行で別タブの準備済みBを削除する問題を、Chromium実IndexedDBの2タブで再現。再試行をpending無変更とし、新規確定時だけ自身の候補を消去する。A確定→B準備→A再試行→B確定、全履歴復元一致、各操作一回、B確定後のpending消去をPASS。既存の応答欠落・競合・候補復旧等を含む実IDB11ケース、全workspaceテスト（型検査含む）、Trade本番ビルドPASS。最終headとCIは#331本文へ記録。物理実機・公開版NOT_RUN。Draftのまま、マージ・デプロイなし。

## PR #331 監査前の補強（Codex）

復元ログの正規化で疎配列・Date・Map・SetなどのJSONで保持できない値を拒否する。JSON書き出し前後で状態表現が変わる入力を保存前に検出するための補強。ゲーム仕様の変更なし。全workspaceのnpm test、shared型検査、1万件復元テストPASS。今回の差分でブラウザー検証は未再実施。マージ・デプロイは未実施。

# 進行状況（STATUS）

作業を再開する側はまずこのファイル、開いている PR、`main` の最新デプロイ結果を読む。作業を止める側は止まる前にこのファイルを更新する。運用ルールは [`ORCHESTRATION.md`](./ORCHESTRATION.md) を参照。

## Codex / 復元可能プレイログ（2026-10-27）
- Who: Codex / 神宮直接指示、Automationsは起動しない
- What: codex/reconstructable-play-log。新規ゲームからのIndexedDB正本・全履歴・JSON書出し・再試行
- Why: TASK_ASSIGNMENT「新規ゲーム開始から復元可能なプレイログを記録・書き出しする」
- Scope: 全モジュール保存接続と復元。既存セーブ移行/削除、完全戦闘リプレイ、ルール変更、マージ/デプロイなし
- Status: 起点main16ab1fdfaafd7808aafe1fe0f412ef56549849b6。保存経路をPLAY_LOG_DESIGN.mdへ整理。全5起動前アダプター、IDB正本/全履歴の原子確定、候補保持/同一結果再試行、seq/gameId/CAS/操作ID、タブ別引渡し、出撃開始/精算、旧履歴選択JSONを実装。全workspaceテスト・型検査・全5ビルドPASS。PC/390x844で全5画面実操作、実保存関数で学習/置き去り/盾を含む復元一致、Quota/abort/キャッシュ不一致/2タブ/準備済み候補/不正履歴/再読込をPASS。1,001件実IDB・10,001件純復元を計測（verification/play-log.json）。物理実機/公開版NOT_RUN。Draft、最終HEADとCIはPR本文、未マージ/未デプロイ
## Codex / Invade偵察操作改善（2026-10-27）

追記：#330はd9b597dでmainへマージ済み。以下は提出時の検証記録。#331へ最新mainを統合（コード競合なし）。
- Who: Codex / 神宮直接指示。Automationsは起動しない
- What: codex/invade-recon-input。300ms予告・マス境界パン・拠点視点・偵察アイコン・Ctrlクリック
- Why: TASK_ASSIGNMENT「Invade操作改善：300ms長押し予告・即時パン・偵察アイコン」
- Scope: Invade入力/表示/文書/検証。ゲーム条件・保存形式・他モジュールは変更しない。Draft、マージ/デプロイ禁止
- Status: 起点main 16ab1fdfaafd7808aafe1fe0f412ef56549849b6（公開デプロイ成功確認）。300ms予告/開始マス境界パン/拠点視点/Ctrl左/白スコープ・赤三角を実装。全workspaceテスト・Invade型検査/selftest/ビルドPASS。1280x900・390x844 Chromium入力列と最終表示/強制戦闘ロック中HQ復帰の回帰PASS。Draft #330、CIは最終HEADで確認。物理実機/公開版NOT_RUN。Draft、未マージ・未デプロイ

## Codex / 1×1作成と格納庫残骸売却（2026-10-25）
- Who: Codex / 実装担当（神宮直接指示、Automationsは起動しない）
- What: cursor/codex-one-cell-wreck-sale。1×1ジャンク作成・初クリア後のP1×1抽選・格納庫大破機400c売却
- Why: 神宮承認TASK_ASSIGNMENT「1×1回路の作成解放と、格納庫の残骸売却」
- Scope: 今回の追加決定のみ。基本ゲート/自律/機体付与/機体価格/2×2以上の条件は変更しない。Draft提出、マージ・デプロイなし
- Status: 起点main 9e558aa6c6de6c2972ac8f5d80a56d5a3dc3e2ab。Draft #328。1×1作成・Restore・保存/装備/売却とP抽選を実装。全workspaceテスト/型検査・全5ビルド、390x844作成/修復/売却/+7c経済/P複数生成をPASS。CORRECTIONを受領。400c売却/回路倉庫化/一回保存/重複拒否/資源付与なしを実装。Trade追加テストと390px確認/取消/実行/再読込PASS。新しい味方大破時の弾薬/電力ドロップと残量0を追加。実射撃/活動量切れ/途中再開/搭載解放と実15秒帰還→売却/解体の資源重複なしをテストPASS。新規敵残骸回収時に活動量300が復活する経路も0へ修正。旧残骸への資源移行は追加しない。神宮回答で装甲は残HP等価に確定し、HP67/120→67個の現地ドロップ/表示/途中保存を実装。Q2/Q3=B確定：装甲は装備盾へ上限なく加算（20/50+67→87/87）。本体装甲回復なし、装備盾なしでは地面に残す。全workspaceテスト/Explore型検査・ビルドと390x844で盾加算/本体HP不変/再読込をPASS。マージ/デプロイなし、物理実機/公開版NOT_RUN。最終HEAD/CIはPR本文

## Codex / Invade入力統一

追記：#329は074ec5aでmainへマージ済み。同コミットの公開デプロイ成功を確認。以下は提出時の履歴。
- Who: Codex / 神宮直接指示の実装担当（Automationsを起動しない）
- What: cursor/codex-invade-input。マウス左右/同時押し、中ドラッグ、ホイール、タッチ反転/長押し/スイープ/ピンチ/ダブルタップ
- Why: TASK_ASSIGNMENT「Invadeのマウス・スマホ操作の統一」
- Scope: 入力・表示変換・説明とテストのみ。#328回路/残骸とは分離。ゲーム条件・報酬・強制戦闘は維持。マージ・デプロイ禁止
- Status: 起点main 9e558aa6c6de6c2972ac8f5d80a56d5a3dc3e2ab。Draft #329。入力状態/周囲開放/ビュー変換と説明を実装。Invade型検査/既存追加テスト/本番ビルド・全workspaceテストPASS。1280x900/390x844で実マウス左右/左右先順/中ドラッグ/ホイール、CDPタッチ反転/長押し離し/パン/ピンチ/ダブル/取消/変換後当たり判定をPASS。詳細verification/invade-input.json、定数INVADE_V0.md末尾、最終HEAD/CIはPR本文。物理スマートフォン/公開版NOT_RUN。マージ・デプロイなし、監査待ち

## Grok Bot / 確認ラウンド完了を文書だけに残す（2026-10-26）
- Who: Grok Bot（文書記録）
- What: 「最近」= 直近 10 出撃を暫定のまま残す（2026-10-26 神宮）。確認ラウンド完了を `docs/AUTONOMOUS_LEARNING_V0.md` に書き、Issue #326 の 11 件とこの確認を `docs/spec-questions/autonomous-learning-326-decision.json` にまとめた。`in` は空
- Why: 神宮が、確認ラウンドの完了を文書に残すよう指示した。Issue へは出さない
- Scope: 文書のみ。実装コードは変えていない。`TASK_ASSIGNMENT` は出していない。実装隊長宛の `SPEC_DECISION` は出していない。Issue コメントも Slack も書いていない
- Status: draft https://github.com/Xyngwie/-explore-sort-trade-game/pull/327 。main には未反映。Deploy Modules Preview は文書だけのため **NOT_TRIGGERED**

## 風紀委員 / 一問ごとの SPEC_DECISION を止める（2026-10-26）
- Who: inspector（風紀委員）
- What: 質問の途中の確認は `docs/` にだけ書く。一問ごとに Issue と Slack へ `SPEC_DECISION` を出さない。まとめと、実装へ渡す決定のときだけ出す
- Why: 神宮が、仕様決定の記録だけでトークンを使い切ると言った（2026-10-26）。空の `SPEC_DECISION` は実装隊長を起こす
- Scope: `docs/AGENT_CANON.md`、`docs/automations/INSTRUCTIONS_INSPECTOR.md`、`docs/automations/README.md`。Issue コメントは足していない
- Status: この節。直近 10 出撃の幅は、先頭の節で暫定のまま残すと記録した（2026-10-26）

## 風紀委員 / 排除コンテナの +1 は暫定のまま（2026-10-26）
- Who: inspector（風紀委員）
- What: 排除で運び終えたコンテナは敵 1 機につき +1。上限は付けない。この点は暫定のまま残す。実装はしない
- Why: 神宮が確認した（2026-10-26）
- Scope: 文書のみ。記録の `SPEC_DECISION` は `in` 空。v0 の点数表は変えていない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md`。https://github.com/Xyngwie/-explore-sort-trade-game/issues/326#issuecomment-6401698794

## 風紀委員 / 小隊長の学習項目は未決のまま（2026-10-26）
- Who: inspector（風紀委員）
- What: 小隊長の完全自律の学習項目の中身は未決のまま残す。v0 のセルとは別に定義する。項目は作らない
- Why: 神宮が確認した（2026-10-26）
- Scope: 文書のみ。記録の `SPEC_DECISION` は `in` 空。今の学習 v0 は変えていない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md`。https://github.com/Xyngwie/-explore-sort-trade-game/issues/326#issuecomment-6401681358

## 風紀委員 / 小隊長回路の効果キーは未決のまま（2026-10-26）
- Who: inspector（風紀委員）
- What: 小隊長回路の効果キーは未決のまま残す。サイズ 10×10 と、完全・不完全が未定であることは維持。回路は作らない
- Why: 神宮が確認した（2026-10-26）
- Scope: 文書のみ。記録の `SPEC_DECISION` は `in` 空。今の 10/12 の開き方は変えていない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md`。https://github.com/Xyngwie/-explore-sort-trade-game/issues/326#issuecomment-6401662039

## 風紀委員 / 小隊長回路の完全・不完全は未定のまま（2026-10-26）
- Who: inspector（風紀委員）
- What: 小隊長回路が完全か不完全かは未定のまま残す。サイズ 10×10 は維持。効果キーは未決。回路は作らない
- Why: 神宮が確認した（2026-10-26）
- Scope: 文書のみ。記録の `SPEC_DECISION` は `in` 空。今の 10/12 の開き方は変えていない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` ほか。https://github.com/Xyngwie/-explore-sort-trade-game/issues/326#issuecomment-6401640014

## 風紀委員 / 小隊長回路のサイズは 10×10（2026-10-26）
- Who: inspector（風紀委員）
- What: 小隊長回路のサイズを 10×10 にする。完全か不完全か、効果キーは未定のまま。回路は作らない
- Why: 神宮が 10×10 にすると述べた（2026-10-26）
- Scope: 文書のみ。記録の `SPEC_DECISION` は `in` 空。今の 10/12 の開き方は変えていない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` ほか。https://github.com/Xyngwie/-explore-sort-trade-game/issues/326#issuecomment-6401614689

## 風紀委員 / 持ち帰り失敗の点は暫定のまま（2026-10-26）
- Who: inspector（風紀委員）
- What: コンテナや残骸を円まで持ち帰れなかったときの点 0 を暫定のまま残す
- Why: 神宮が確認した（2026-10-26）
- Scope: 文書のみ。記録の `SPEC_DECISION` は `in` 空。点数の実装は v0 に入っている。表の数は変えていない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` の点数に反映。https://github.com/Xyngwie/-explore-sort-trade-game/issues/326#issuecomment-6401580064

## 風紀委員 / 通常敵の撃破は暫定のまま（2026-10-26）
- Who: inspector（風紀委員）
- What: `normal` の撃破 +2 を暫定のまま残す
- Why: 神宮が確認した（2026-10-26）
- Scope: 文書のみ。記録の `SPEC_DECISION` は `in` 空。点数の実装は v0 に入っている。表の数は変えていない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` の点数表に反映。https://github.com/Xyngwie/-explore-sort-trade-game/issues/326#issuecomment-6401567765

## 風紀委員 / 回避と被弾の点数は暫定のまま（2026-10-26）
- Who: inspector（風紀委員）
- What: 敵の攻撃を回避した +1、当たった −1 を暫定のまま残す
- Why: 神宮が確認した（2026-10-26）
- Scope: 文書のみ。記録の `SPEC_DECISION` は `in` 空。点数の実装は v0 に入っている。表の数は変えていない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` の点数表に反映。https://github.com/Xyngwie/-explore-sort-trade-game/issues/326#issuecomment-6401552499

## 風紀委員 / 通常敵の命中と外れは暫定のまま（2026-10-26）
- Who: inspector（風紀委員）
- What: `normal` の命中 +1、外れ −1 を暫定のまま残す
- Why: 神宮が確認した（2026-10-26）
- Scope: 文書のみ。記録の `SPEC_DECISION` は `in` 空。点数の実装は v0 に入っている。表の数は変えていない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` の点数表に反映。https://github.com/Xyngwie/-explore-sort-trade-game/issues/326#issuecomment-6401533811

## 風紀委員 / 小テストの点数は暫定のまま（2026-10-26）
- Who: inspector（風紀委員）
- What: 通常コンテナの小テスト +1/−1、回路または残骸の小テスト +4/−2 を暫定のまま残す
- Why: 神宮が確認した（2026-10-26）
- Scope: 文書のみ。記録の `SPEC_DECISION` は `in` 空。点数の実装は v0 に入っている。表の数は変えていない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` の点数表に反映。https://github.com/Xyngwie/-explore-sort-trade-game/issues/326#issuecomment-6401516299

## 風紀委員 / 決定は次の質問の前に記録する（2026-10-26）
- Who: inspector（風紀委員）
- What: 神宮が決定を確認するたび `docs/` に書き、次の質問の前に、まだ無い分を Issue と Slack へ記録する。記録の `SPEC_DECISION` は `in` 空。`TASK_ASSIGNMENT` は出さない
- Why: 質問が続くと決定を忘れる、と神宮が言った（2026-10-26）
- Scope: `docs/AGENT_CANON.md`、`docs/automations/INSTRUCTIONS_INSPECTOR.md`、`docs/automations/README.md`。機能コードは変えていない
- Status: この節

## 風紀委員 / 2026-10-25 の決定を Issue #326 に記録（2026-10-25）
- Who: inspector（風紀委員）
- What: 点数、排除コンテナ、平均、三つの回路の決定を Issue #326 にまとめた。`SPEC_DECISION` の `in` は空。`TASK_ASSIGNMENT` は出していない
- Why: 神宮が、決定仕様を Slack と Issue に投稿するよう指示した
- Scope: 文書と Issue コメント 6394299212。機能コードは変えていない
- Status: https://github.com/Xyngwie/-explore-sort-trade-game/issues/326

## 風紀委員 / 生還・死亡・置き去りは暫定のまま（2026-10-25）
- Who: inspector（風紀委員）
- What: 生還 +100、死亡 −100、置き去り −80 を暫定のまま残す
- Why: 神宮が確認した（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない。点数の実装は v0 に入っている
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` の点数表に反映

## 風紀委員 / 敵区分の境界は後回し（2026-10-25）
- Who: inspector（風紀委員）
- What: 直近 10 出撃の平均で敵を `normal` 以外に分ける境界は、後回し。平均の式は残す。戦場の敵は v0 と同じく全部 `normal`
- Why: 神宮が後回しでよいと確認した（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` の「決定済み・未着手：敵の基本報酬を平均する幅」に反映

## 風紀委員 / Slack の壁打ちを指示の前に読む（2026-10-25）
- Who: inspector（風紀委員）
- What: 風紀委員は仕様の判断と `SPEC_DECISION` の前に `#webアプリ開発` を読む。指示を出すとき、神宮との会話を省略せずそこに書く。起動口は Issue コメントのまま
- Why: 神宮が、壁打ちの文脈が風紀委員の Automation に届いていないと指摘した（2026-10-25）
- Scope: `docs/automations/INSTRUCTIONS_INSPECTOR.md`、`docs/AGENT_CANON.md`、`docs/automations/README.md`。機能コードは変えていない
- Status: 正本は main の上記。Automation 画面に貼ってある Instructions は、このファイルを貼り直すまで古いまま。会話の写しの先頭は [#webアプリ開発 のスレッド](https://w1791055196-mgc673700.slack.com/archives/C0C6MHPFB1A/p1792893699150189)

## 風紀委員 / 敵評価の平均は 10 出撃の合計を 10 で割る（2026-10-25）
- Who: inspector（風紀委員）
- What: 直近 10 出撃について、各出撃で持ち帰った基本報酬 60 の合計を 10 で割る。該当が無い出撃は 0。分類の境界は未決
- Why: 神宮が確認した（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` の「決定済み・未着手：敵の基本報酬を平均する幅」に反映

## 風紀委員 / 1×1 完全の自律は装備した 1 機（2026-10-25）
- Who: inspector（風紀委員）
- What: 初クリアの 1×1 完全 1 枚で同時に自律するのは、それを装備した 1 機だけ
- Why: 神宮が確認した（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない。今のゲームの枚数と開き方は変えていない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` の「決定済み・未着手：三つの回路」に反映

## 風紀委員 / 1×1 完全は初クリアの 1 枚のまま（2026-10-25）
- Who: inspector（風紀委員）
- What: 1×1 完全の枚数は、初クリアで見つかる 1 枚のまま。部隊の各機体に装備できる数は用意しない
- Why: 神宮が、各機体分を持てるようにすることを否とした（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない。その 1 枚で同時に自律するのが装備機だけか部隊全体かは未決
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` の「決定済み・未着手：三つの回路」に反映

## 風紀委員 / 僚機の 1×1 不完全の 2 倍を残す（2026-10-25）
- Who: inspector（風紀委員）
- What: 僚機に付けた 1×1 不完全は、`release` のとき攻撃力・射程・視界の 2 倍を残す。隊長機には付かない
- Why: 神宮が確認した（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない。今のゲームの倍率は変えていない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` の「決定済み・未着手：三つの回路」に反映

## 風紀委員 / 1×1 不完全が開く五つの基本行動（2026-10-25）
- Who: inspector（風紀委員）
- What: 1×1 不完全が解放するマニュアル操作は、隊長の移動・射撃・回収・帰還要請・撤退。今、回路なしで使える五つの基本行動と同じ
- Why: 神宮が確認した（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない。今のゲームは回路なしでもこの五つが使えるまま。僚機の偽の 1×1 の 2 倍は未決
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` の「決定済み・未着手：三つの回路」に反映

## 風紀委員 / 隊長の 1×1 完全は移動命令と航空支援を残す（2026-10-25）
- Who: inspector（風紀委員）
- What: 隊長機の 1×1 完全は、僚機への移動の命令と航空支援を残す。そのうえに、その隊長機の自律が乗る
- Why: 神宮が確認した（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない。今のゲームの開き方は変えていない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` の「決定済み・未着手：三つの回路」に反映

## 風紀委員 / 三つの回路の役割（2026-10-25）
- Who: inspector（風紀委員）
- What: 1×1 不完全はマニュアル操作の解放。1×1 完全は装備した機体の自律。早期に全機体へ装備すると全員が自律行動になる。小隊長はサイズも完全・不完全も未定の小隊長回路。隊長機も僚機も同じキー
- Why: 神宮が回路の役割を整理した（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない。10/12 の開き方（偽の 1×1 はコマンドなし、隊長の「4」は移動命令と航空支援、僚機の「4」は自律）は維持。移動命令と航空支援を残すかは未決
- Status: `docs/AUTONOMOUS_LEARNING_V0.md`、`docs/CIRCUIT_SQUAD_DESIGN_V0.md`、`docs/EXPLORE_COMMAND_UNLOCK_V0.md`、`docs/IMPLEMENTATION_PLAN.md`、`docs/MECH_WORLD_BUILDING_DESIGN.md` §6 に反映

## 風紀委員 / 小隊長の指定キーは小隊長回路（2026-10-25）
- Who: inspector（風紀委員）
- What: 僚機を小隊長にするキーは、その機体に小隊長回路を装備すること。効果キー、盤、真偽、外したときの扱いは未決。v0 では回路を作らない
- Why: 神宮が、指定操作のキーを小隊長回路の装備にすると述べた（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない。隊長機が同じ回路を要るかは未確認
- Status: `docs/AUTONOMOUS_LEARNING_V0.md`、`docs/IMPLEMENTATION_PLAN.md`、`docs/MECH_WORLD_BUILDING_DESIGN.md` §6 に反映

## 風紀委員 / 小隊長の同時指定に上限はない（2026-10-25）
- Who: inspector（風紀委員）
- What: `instanceId` がある僚機を小隊長にする数に上限はない。全員指定はできる。全員指定の追加の意味は薄い。指定の操作は未決
- Why: 神宮が確認した（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない。人数による減点は足していない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md`、`docs/IMPLEMENTATION_PLAN.md`、`docs/MECH_WORLD_BUILDING_DESIGN.md` §6 に反映

## 風紀委員 / 別の小隊長は instanceId のある僚機（2026-10-25）
- Who: inspector（風紀委員）
- What: 隊長機とは別に小隊長へ指定できるのは、`instanceId` がある僚機。指定の操作と同時の機数は未決
- Why: 神宮が確認した（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない。完全自律の学習項目は未決のまま
- Status: `docs/AUTONOMOUS_LEARNING_V0.md`、`docs/IMPLEMENTATION_PLAN.md`、`docs/MECH_WORLD_BUILDING_DESIGN.md` §6 に反映

## 風紀委員 / 小隊長は完全自律した隊長機（2026-10-25）
- Who: inspector（風紀委員）
- What: 小隊長は隊長機と同じ機体。手動操作の隊長機が完全自律すると、役割は自立する小隊長になる。別の機体も別の小隊長として指定できる。指定できる範囲は未決。完全自律の学習項目は未決のまま
- Why: 神宮が確認した（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない
- Status: `docs/AUTONOMOUS_LEARNING_V0.md`、`docs/IMPLEMENTATION_PLAN.md`、`docs/MECH_WORLD_BUILDING_DESIGN.md` §6 に反映

## 風紀委員 / 隊長機の自律と小隊長の完全自律を分ける（2026-10-25）
- Who: inspector（風紀委員）
- What: 後回しの隊長機の自律は、手動操作を手放したあとに同じ帳簿で行動を選ぶこと。小隊長の完全自律は別で、専用の学習項目が要る。中身は未決
- Why: 神宮が、マニュアル操作の話なら残す、と確認し、完全自律は別項目だと分けた（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない。小隊長がどの機体かは未確認
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` と `docs/IMPLEMENTATION_PLAN.md` に反映

## 風紀委員 / 中隊功績の名前付き項目を一つにする（2026-10-25）
- Who: inspector（風紀委員）
- What: 中隊功績に今名前を付ける項目は、排除で運び終えたコンテナ（敵 1 機につき +1）だけ。枠は閉じず、別項目は名前が決まってから足す
- Why: 神宮が確認した（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない。排除コンテナの実装、敵評価の平均、隊長機の自律は未着手のまま
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` と `docs/IMPLEMENTATION_PLAN.md` に反映

## 風紀委員 / 敵評価の「最近」を直近 10 出撃にする（2026-10-25）
- Who: inspector（風紀委員）
- What: 持ち帰った基本報酬 60 を部隊で平均するときの「最近」を、直近 10 出撃にする。暫定
- Why: 神宮が確認した（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない。平均の計算、分類の境界、排除コンテナの +1 は未着手のまま
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` の「決定済み・未着手」に反映

## 風紀委員 / 基本報酬 60 の採点を残す（2026-10-25）
- Who: inspector（風紀委員）
- What: 通常コンテナの持ち帰り +8 に対し、回路または残骸を倒して円まで持ち帰った基本報酬 60（撃破 20 + 持ち帰り 40）を暫定のまま残す。置き去り機体の回収には 60 を付けない
- Why: 神宮がこの比率を適当と確認した（2026-10-25）
- Scope: 文書のみ。`SPEC_DECISION` は出していない。排除コンテナの +1 と敵評価の平均は未着手のまま
- Status: `docs/AUTONOMOUS_LEARNING_V0.md` の「決定済み・未着手」に反映

## 実装隊長 / Issue #324 誤 revert ブランチ整理（2026-10-24）
- Who: lead（実装隊長）
- What: arrow WORK_REPORT `907e985`（30b4896 revert）照合。技術内容は 640a667 一致だが、6385420381 CORRECTION は撤回後の誤送信（6385435539 HOLD）
- Why: main `2b60a82` が監査 PASS・デプロイ済。907e985 を main へ載せない
- Scope: コード変更なし。`cursor/arrow-mech-learning-v0` @ `907e985` は孤立（main 向け PR 禁止）
- Status: **v0 完了**。追加 TASK なし

## 風紀委員 / 僚機の自律学習 v0 PR #325 監査・マージ（2026-10-24）
- Who: inspector（風紀委員）
- What: PR #325（arrow / Issue #324）再監査・squash merge・Deploy Modules Preview 確認
- Why: lead からの PR_REPORT（head `30b4896`）に基づく最終監査
- Scope: `docs/AUTONOMOUS_LEARNING_V0.md`（dodged/struck 追記含む）照合。機能コードは変更しない
- Status: main **`2b60a82e63d4d289b5e225eb3daa56d65e2d26c8`**（squash merge #325）。Deploy Modules Preview run **40102747934** **SUCCESS**。プレビュー操作・神宮スマートフォン実機確認は **NOT_RUN**

## 風紀委員 / 僚機の自律学習 v0 回避の点数（2026-10-24）
- Who: inspector（風紀委員）
- What: 敵の攻撃を回避したら +1、当たったら −1。狙われた僚機の小テスト。新しい回避の動きは作らない
- Why: 神宮が戦闘の暫定点として追加した
- Scope: 文書の追加。実装は PR #325 に統合済み
- Status: `AUTONOMOUS_LEARNING_V0.md` に反映済み（main `5a08f90` 文書、実装 `2b60a82`）

## 風紀委員 / 僚機の自律学習 v0（2026-10-24）
- Who: inspector（風紀委員）
- What: 正式仕様 `docs/AUTONOMOUS_LEARNING_V0.md` と、`docs/IMPLEMENTATION_PLAN.md` のロードマップ（帳簿 → 選択 → 小テスト → 精算）
- Why: 神宮が大枠の実装を実装隊長へ渡すよう指示し、大きい項目なので文章の実装計画へ順序を残すよう指示した
- Scope: 文書のみ。機能コードは変更しない。隊長機の自律、中隊功績、敵評価の平均、点数表の差し替えは対象外
- Status: 仕様と計画は main `9869b839289294c014497fefa37d61b2367a3714`。Issue #324 コメント 6384970161 が実装隊長への `SPEC_DECISION`（PASS、unresolved 空）。Deploy Modules Preview は文書だけのため **NOT_TRIGGERED**。実装は実装隊長の `TASK_ASSIGNMENT` まで着手しない

## 風紀委員 / 貫通弾 piercing_round（2026-10-24）
- Who: inspector（風紀委員）
- What: PR #323（arrow / Issue #322）監査・マージ・Deploy Modules Preview 確認
- Why: lead からの PR_REPORT（PASS）に基づく最終監査
- Scope: `docs/PIERCING_ROUND_V0.md` 照合、13 ファイル ScopeLock 内、CI 再確認。機能コードは変更しない
- Status: main `f01b43f15281d1a5c8cbbd031a6cd96117e26ef6`（squash merge #323）。Deploy Modules Preview run **40078815487** **SUCCESS**。プレビュー操作・神宮スマートフォン実機確認は **NOT_RUN**（DM 依頼済み）

## Codex / 公開版検証準備・盾UX調査（2026-10-22）
- Who: Codex / 調査・実装担当
- What: cursor/codex-lab-public-tests。第三者手順15項目を先に作成、その後2件のUXを再現調査
- Why: 神宮の公開アルファ実験室第三者検証準備IMPLEMENTATION_ORDER
- Scope: 手順・再現済み問題のみ。独立修正は別Draft。マージ・デプロイしない
- Status: 2026-10-23、最新main（#321の3d64579）を取り込みSTATUSの競合を両方の記録を保持して解消。#319はd093141でマージ済み、同一コミットの公開デプロイ39777940991 SUCCESS。公開入口PASS。公開390x844の7プリセット切替で旧セッション残留は未再現、密集タップの設置盾優先を再現。詳細ALPHA_LAB_PUBLIC_REVIEW.md。手順はverification/alpha-lab-319-public-test-plan.json。新UX指摘は過去の購入/Offline指摘とは別件

## Codex / 密集タップ候補（2026-10-22）

追記（2026-10-23）：#321は3d64579でマージ済み。以下は提出時の履歴。
- Who: Codex / 実装担当
- What: cursor/codex-map-targets。重複する設置盾・地面盾・残骸・僚機の操作候補
- Why: 神宮の第三者検証準備・盾UX指摘切り分け命令。公開d093141で地面盾候補が設置盾に隠れる現象を再現
- Scope: 複数候補のみ選択UI。物理・保存・盾ルールは変更しない。手順/再現調査は独立Draft #320。旧セッション残留は未再現で修正なし
- Status: 最新main d093141起点、Draft #321提出。全workspaceテスト・型検査・5本番ビルド、旧318/319ブラウザーと新390x844操作PASS。単独壁・盾/明示剥離/移動・候補選択/取消・小数HP/ID/通常セーブ不変を確認。詳細verification/map-targets-20261022.json。最終head CIはPR本文。監査待ち、物理実機/修正後公開版NOT_RUN。マージ・デプロイなし

## Codex / 公開アルファ実験室（2026-10-22）

追記：#319はd093141でマージ済み、公開デプロイ39777940991 PASS。以下は提出時の履歴。
- Who: Codex / 実装担当
- What: cursor/codex-alpha-lab。#319自由編集UI・通常セーブの一方向コピー・証拠出力
- Why: 神宮提示IMPLEMENTATION_ORDER #319
- Scope: 実験用保存領域の編集のみ。既存6プリセット・通常ルールを維持。通常セーブへの書戻し・マージ・デプロイなし
- Status: #318は64d3f83でマージ済み。同コミットの公開デプロイ39764118392 PASS。最新mainから実装完了。全workspaceテスト/型検査・全5ビルド、旧#318全6プリセット/操作、追加390x844の自由編集/小数HP/個別機体/屹立撤去拾得/帰還再出撃/コピー承認取消/通常local-session不変/署名除外をPASS。詳細ALPHA_LAB.mdとverification/alpha-lab-319.json。最終head・CIはDraft PR本文参照。監査待ち、未マージ・未デプロイ。物理実機・公開版の新機能NOT_RUN

## Codex / 盾検証デバッグモード（2026-10-22）

追記：#318は64d3f83でマージ済み、公開デプロイ39764118392 PASS。以下は提出時の履歴。
- Who: Codex / 実装担当
- What: cursor/codex-shield-debug。専用保存領域・6プリセット・状態表示・証拠出力
- Why: 神宮提示SPEC_DECISION「盾システム検証用デバッグモード」
- Scope: 盾検証用環境のみ。通常の購入/装備/盾ルールは維持。マージ・デプロイは行わない
- Status: main f53788c（#317）、公開デプロイ39713446582 PASSを基準に実装完了。全workspaceテスト/型検査・全5本番ビルドPASS。390x844の全プリセット、盾実射撃/予備交換、剥離/建設途中再開、移動遮断/撤去/別拾得、帰還/HUB/再出撃、証拠出力/明示初期化、全5モジュールの通常local/session保存不変をPASS。詳細SHIELD_DEBUG_MODE.md、最終head/CIはDraft PR本文参照。監査待ち。物理実機・公開版の新機能NOT_RUN。未マージ・未デプロイ

## Codex / PR317第三者テストの再検証（2026-10-22）
- Who: Codex / 調査・検証担当
- What: cursor/codex-circuit-purchase-review。購入/Offline装備の公開版再現確認と証拠保存
- Why: 神宮からのrun-20261022-shield-5m-001レポート
- Scope: 原本・調査結果・再実行スクリプト・仕様質問のみ。ゲームコードと保存契約は変更しない
- Status: main f53788c（#317）を基準に公開390x844で購入取消/承認/Offline装備PASS。購入ハンドラ不良は未再現。装備上限と検証回路の種類の誤認を確認。詳細SHIELD_PLAYTEST_PR317_REVIEW.md。T1をspec-questions/shield-test-fixture.jsonへ提出し、追加テスト機能は判断待ち。物理実機NOT_RUN。本作業のマージ/デプロイNOT_TRIGGERED

## Codex / 実機テスト用の初期資金（2026-10-22）

追記：#317はf53788cでマージ済み。公開デプロイ39713446582 PASS。以下は提出時の履歴。
- Who: Codex / 実装担当
- What: cursor/codex-test-starting-credits。新規開始とシード読込の資金を5,000,000cへ変更
- Why: 神宮の実機テストの資金不足への対応指示
- Scope: 初期資金のみ。既存セーブ残高の上書きや自動再給付は追加しない
- Status: #316は00a4cb2でマージ済み。初期値変更済み。全workspace型検査/テスト・Trade本番ビルドPASS。390pxブラウザーで新規/初期化5,000,000c、既存123c/0cの保持（シード経路も同額に統一）とHUB表示PASS。Draft提出・監査待ち、最終head/CIはPR本文参照。未マージ・未デプロイ

## Codex / #316 盾関連統合確認（2026-10-21）
- Who: Codex / 実装担当
- What: cursor/codex-shield-integration-316。#307〜315の仕様/実装/テスト照合・操作統合検証・台帳更新
- Why: 神宮承認SPEC_DECISION R1=A
- Scope: 調査/検証/文書更新と現行mainで再現した不具合のみ修正。新機能・未承認仕様・マージ/デプロイは対象外
- Status: #315は7efe66cでマージ済み、公開デプロイ39610010826 PASS。R316-01（P盾不適格なのに屹立ボタンが見える）をローカル/公開版で再現し、限定CSSと可視性テストを修正。全workspace型検査/テスト・全5ビルド、ローカル8本の統合操作と修正後2本PASS。公開5モジュール起動/基本操作/P盾保存再開PASSだが、公開版の表示不具合は未更新のためFAILと分離。人的手動/物理実機はNOT_RUN。台帳・第三者手順・証拠をSHIELD_INTEGRATION_316.md等に更新。Draft提出・再監査待ち、最終head/CIはPR本文参照。未マージ・未デプロイ

## Codex / P盾回路・屹立 作業宣言（2026-10-20）
- Who: Codex / 実装担当
- What: cursor/codex-p-shield。#315 P盾回路・屹立の実装
- Why: 神宮の「314入りました。315準備お願いします」
- Scope: 神宮承認P1〜P10とIMPLEMENTATION_ORDERに従い実装・検証・Draft提出。マージ・デプロイは行わない
- Status: #315は7efe66cでマージ済み、Deploy Modules Preview 39610010826 PASS。以下は提出当時の履歴（現在の未実装/未マージの意味ではない）：#314は622fc43でマージ済み、Deploy Modules Preview 39414575710 PASS。屹立は概念のみ確定、P1〜P10をdocs/spec-questions/p-shield-315.jsonへ全文提出。JSON構文/ID/未選択状態を検証PASS。ゲームテストはNOT_RUN（コード変更なし）。IMPLEMENTATION_ORDER v1.0受領、未決定事項は解消。P盾/隊長・僚機操作/矩形物理/撤去/途中再開/帰還保存を実装。全workspaceテスト（型検査含む）・全5ビルドPASS。390pxで両作業の途中再読込、隊長/個別僚機、別2秒拾得、15秒帰還/再出撃復元、全終了経路/交換/盤面再生成、#309〜314の剥離/精算/保存回帰PASS。Draft提出・再監査待ち。最新head/CIはPR本文、詳細P_SHIELD_PLAN.md。公開版手動/物理端末NOT_RUN、未マージ・未デプロイ

## Codex / 盾回路 作業宣言（2026-10-20）
- Who: Codex / 実装担当
- What: cursor/codex-shield-circuit。#314の偽盤効果「盾」、装備制限、剥離権限、元機体効力と進捗保存
- Why: 神宮承認K1〜K6=A、A1 patch v2.0、互換性要件を解除したpatch v2.1を記載順に適用
- Scope: 新仕様の盾回路・剥離・保存・敵候補/待ち伏せ。P盾回路/屹立・新しい敵盾AI・旧開発セーブ移行・マージ/デプロイは行わない
- Status: #314は622fc43でマージ済み、Deploy Modules Preview 39414575710 PASS。以下は提出当時の履歴：#313は5c24b7bでマージ済み、Deploy Modules Preview 39399565386 PASS。#314実装完了、Draft提出・再監査待ち。旧進捗互換の保留はv2.1で解消。全workspaceテスト（型検査含む）・全5本番ビルドPASS。390pxの実射撃→端数盾剥離/途中再読込→拾得→15秒帰還、無回路拾得/コマンド制限、HUB重複拒否、#312マス保存/再出撃/盤面再生成、#313全帰還経路/置き去り/交換凍結再開PASS。詳細SHIELD_CIRCUIT_PLAN.md、最新CIはPR本文参照。未マージ・未デプロイ。公開版操作と物理実機はNOT_RUN

## Codex / 帰還時の盾処理 作業宣言（2026-10-20）
- Who: Codex / 実装担当
- What: cursor/codex-shield-return。帰還機の現地投棄と置き去り機の所持盾/交換残り時間保存
- Why: 神宮承認・風紀委員レビューのSPEC_DECISION v2.0。Q1=A/Q2=A/Q3=B、S1〜S6=A/A/A/B/B/A
- Scope: 終了経路・所有保存/復元・交換凍結・盤面再生成・旧セーブ/帰還精算の検証。HUB持ち帰り・新操作・盾回路・敵AI・サーバーは追加しない
- Status: main 825b2e8（#312）、公開デプロイ39389174830成功。承認JSONをdocs/spec-questions/shield-return-313-decision.jsonへ保存し、未決定事項は解消。Draft #313を提出。全workspaceテスト（型検査含む）・全5本番ビルドPASS。通常帰還/救助/両時間切れ/帰還失敗、交換残り凍結/再開、実Invade盤面再生成の390px操作をPASS。#312の帰還/再出撃/剥離/旧セーブ/保存拒否のブラウザー回帰もPASS。最新CIはPR本文へ記録。物理実機は承認方針どおり第三者による一括検証へ回す。詳細SHIELD_RETURN_PLAN.md。未マージ・未デプロイ、再監査前に進めない

## Codex / 出撃をまたぐ盾・剥離進捗保存 作業宣言（2026-10-20）
- Who: Codex / 実装担当
- What: cursor/codex-field-shield-persistence。次PRの帰還保存・再出撃復元を調査
- Why: 神宮の「311入りました。312お願いします」
- Scope: 地面盾・残骸進捗の帰還保存/再出撃復元、盤面再生成、直接出撃の共有盤面HQ入口。所持盾の帰還ルール・盾回路・新AI・サーバーは別工程
- Status: #312は825b2e8でマージ済み。以下は提出時の記録：#311は3a524fdでマージ済み、公開デプロイ39372330509成功。Q1=A同じ盤面の同じマス、直接出撃も共有盤面、差し替えQ2=AでHQ出発を確定。Draft #312を作成。全workspaceテスト・全5ビルド、新規390pxの帰還/結果再読込/再出撃/剥離再開/盾回収、直接HQ入口/未踏査/初回保存/保存拒否、Invade盤面再生成がPASS。#309〜311のブラウザー回帰もPASS。結果再読込後の再出撃でマス情報が欠落する問題を再現・修正。Q3=A確定：剥離開始済みの敵残骸だけ保存、未着手は従来どおり生成。現行実装と一致し確認事項は解消。実装head 896cceeのCI39387544302 PASS、最新headはPR本文参照。詳細FIELD_SHIELD_PERSISTENCE_PLAN.md。未マージ・未デプロイ、再監査待ち

## Codex / 盾の回収・装備 作業宣言（2026-10-20）
- Who: Codex / 実装担当
- What: cursor/codex-shield-pickup、Draft #311。地面盾タップ→一覧選択→2秒回収/装備、予備と破壊時の2秒交換
- Why: 神宮の#311指示とQ1=A、Q2=Aの明示確定
- Scope: 同じ出撃内の隊長操作・容量/予約・予備重量・投棄/死亡/積載・途中保存・実操作検証。出撃をまたぐ保存、手動予備装備選択、盾回路、新しい敵AI・サーバーは別工程
- Status: #311は3a524fdでマージ済み、公開デプロイ39372330509成功。以下は提出時の記録：Q2の確定仕様を本体へ接続済み。全workspaceテスト・全5ビルド、390pxの回収/予備/満載/投棄/距離外中断、実敵弾による破壊/2秒交換/再読込、剥離→回収/装備→帰還の操作がPASS。盾防御/ログUIブラウザー回帰もPASS。詳細SHIELD_PICKUP_PLAN.md、最新CIはPR本文参照。基準main 1ce0d49、#310公開デプロイ39257244173 PASS。#311はDraft・マージ保留・未デプロイで再監査待ち

## Codex / 残骸の装甲剥離 作業宣言（2026-10-19）
- Who: Codex / 実装担当
- What: cursor/codex-wreck-stripping、Draft #310。「残骸盾」から8秒の静止剥離で地面盾を生成
- Why: 神宮の「309入りました。310お願いします」
- Scope: 隊長専用の対象タップ、進捗/予約/途中保存、残骸と回路の消費、HP50の盾生成、未算定の学習記録と帰還精算。拾得/2秒装備/予備交換・盾回路・出撃をまたぐ地面盾/進捗永続化・サーバーは後続
- Status: #310は1ce0d49でマージ済み、公開デプロイ39257244173 PASS。以下は提出時の記録：追加監査で剥離/敵回収の矛盾データから空の大破機が残るケースを再現し、精算側と旧航空支援経路を修正。実射撃→剥離→15秒帰還→保存→結果再読込と未剥離比較対象の受領を390pxブラウザーでPASS。詳細WRECK_STRIPPING_RETURN_AUDIT.md。最新CIはPR本文参照。以下は初回提出時の記録：実装済み。Q1〜Q5補足を確定しWRECK_STRIPPING_PLAN.mdへ記録。全workspaceテスト・全5ビルド・390pxの実操作/途中再読込/盾生成がPASS。最終CI・既存盾/ログのブラウザー回帰結果はPR本文参照。#309はdfe0f33でマージ済み、公開デプロイ39239631337 PASS。#310は未マージ・未デプロイ、再監査待ち

## Codex / 盾防御コア 作業宣言（2026-10-18）
- Who: Codex / ユーザーの次作業指示
- What: feat/wreck-shield-core。弾120°/接近戦270°の盾防御、耐久・重量・途中保存、既存の積載/死亡との整合
- Why: #307保存基盤・#308ログUIの次の盾防御PR
- Scope: 防御コア。盾の剥離/回収/交換UI・戦場永続化・サーバーは後続。初期盾は付与しない。Q1=A軽減後、Q2/補足=A接近戦270°、Q3=A接近戦にも軽減、Q4=B盾でもEMP効果通過
- Status: #309はdfe0f33でマージ済み、公開デプロイ39239631337 PASS。以下は提出時の記録：Draft #309。防御コア・重量・途中保存と実被弾処理を実装。全npm test・全5ビルド・390pxブラウザーの6ケースPASS。SHIELD_DEFENSE_CORE.mdに追加確定事項と後続との境界を記録。CI結果はPR本文参照。基準main 7b1112a、#308公開デプロイ39170844642成功。再監査前にはマージしない

## Codex / ログUI 作業宣言（2026-10-18）
- Who: Codex / ユーザーの次作業指示
- What: feat/explore-log-panel。#306 Q129–161の修復ログコピー・文字選択・スクロール・未読UI
- Why: #307の永続修復記録を操作可能なログとして表示する
- Scope: Exploreログパネルと入力ガード、ブラウザー検証。盾・サーバー・戦闘仕様は変更しない
- Status: #308は7b1112aでマージ済み。以下は提出時の検証記録。修復ログコピー・標準選択・初回入力ガード・未読/追従・100msリサイズアンカーを実装。全npm test・全5ビルド・390pxブラウザーの独立UI/実ゲーム検証PASS。詳細EXPLORE_LOG_UI.md、CI結果はPR本文へ。#307公開デプロイ39165844665成功。未マージで再監査待ち

## Codex / 識別子・保存基盤 作業宣言（2026-10-18）
- Who: Codex / ユーザーのGOに基づく実装
- What: feat/field-object-identities。#306の新旧仕様対応表、残骸・盾の識別子と保存・修復基盤
- Why: 盾実装の前提となるQ111–127のデータ契約を先に実装する
- Scope: sharedの加算的保存フィールド、純粋なID割当/修復、永続修復記録とテスト。盾の防御・剥離・回収UI・通信サーバーは後続。既存機体/回路IDを変更しない
- Status: #307はdc1438cでマージ済み。以下は提出時の検証記録。新旧対応表・ID割当/修復・HubSave v3加算保存・永続修復記録を実装。全npm test・全5ビルド・390pxブラウザーの実localStorage修復/再読込/書込拒否がPASS。CI結果はPR本文参照。main 1a9d234（#306）、#305公開デプロイ39080853295成功。未マージ・未デプロイで再監査待ち

## Codex / explore-playtest-fixes-20261018 作業宣言
- Who: Codex / 実行隊長。ユーザー提供計画に従い入力・帰還誘導の実装を分担し、衝突・回避と統合を担当
- What: fix/explore-playtest-20261018。クリック移動の終了・手動優先、回避成否、帰還時の指示優先順位
- Why: run-20261018-explore-001の3指摘を現行mainで再現し修正する
- Scope: #304維持、既存衝突・移動能力・明示的個別指示を維持。盾・学習AI・帰還時間・置き去り規則は変更しない
- Status: draft #305。3件の再現・修正を統合、新規回帰3ファイルと390px幅ブラウザーで入力取消・再開・帰還集合・個別hold維持を確認。基準main bdc45c3（#304）、公開デプロイ39075704092成功。詳細はEXPLORE_PLAYTEST_FIXES_20261018.md。全npm test・全5ビルドPASS。CI確認後、draftのまま風紀委員の再監査待ちにする。未マージ・未デプロイ。

## Codex / carried-aim 作業宣言（2026-10-17）
- Who: Codex / ユーザー直接指示
- What: feat/carried-aim。搭載機の独立照準・旋回と、積載完了時の荷物投下
- Why: EXPLORE_FACING_AIM_V0 §5・§8の次のPRをdraftまで進める
- Scope: 搭載機は自身の正面3°・90°/秒。荷物は運ぶ側へ移さず地面へ。装備回路・弾薬・活動量は維持。機体の積載2・容量・速度表を維持。盾そのものは後続PRで実装
- Status: draft #304。実装・全npm test・Explore本番ビルド・390px幅ブラウザーの実際の8秒積載と荷物投下・途中再開がPASS。最新CI確認待ち、未マージ・未デプロイ。Q1=Aで確定。搭載機は敵を狙わない間は最後の向きを保つ。main #303はマージ・デプロイ39044761270成功、配信アセット一致を確認済み

## Codex / projectile-hit-all 作業宣言（2026-10-17）
- Who: Codex / ユーザー直接指示
- What: feat/projectile-hit-all。弾の全機体衝突、障害物の射撃・移動遮断、吸い込み廃止、誤射判断・学習用記録
- Why: #301/#302の引き継ぎと、この会話の追加確定事項を実装する
- Scope: AR±2°/SMG±5°/MMR±0.5°/LMG±4°、散弾各±2°。誤射判断は直接弾道が味方を横切る場合。回数は非表示・報酬影響なしで精算後も保存。MMR到達距離は有効射程×1.3。カバーは外縁、障害物内部への侵入禁止。盾・貫通・ML学習そのものは対象外
- Status: draft #303、2e4dc58への再監査F1〜F9を修正済み。7e2b7daへの再監査G1/G2・任意G3を修正済み。D1/D2の追加決定に従い命中後の回路・カバー軽減を復元した。D1/D2の単独・重複・上限・キャンプ併用を実弾命中テストで検証。全npm test、Exploreビルド、390px幅ブラウザーの手動カバー・再開・記録保存がPASS。C1〜C6は2026-10-17の新しい明示決定として採用。実装とローカル検証が完了し、CI確認待ち。全workspaceのnpm test、Exploreの本番ビルド、390px幅ブラウザーで手動V/ボタン切替の維持・外縁停止・離脱・地形とカバー状態の再開・誤射表示とログ・非表示履歴の精算保存と重複防止を確認。マージ・デプロイは未実施。mainは#302（文書のみ）、公開コードは#300（デプロイ39009472456成功）。

## 最終更新

- Codex / 状況同期 — 敵PR2〜PR5は #287（`5ad87ad`）でmainへマージ済み。Deploy Modules Preview run 38467907668 は success。公開の全5モジュールのHTTP応答とExplore配信アセットへの反映を確認。初クリア・release関連の5項目は #272・#273 で既に完了しており、新規の未実装タスクとして扱わない。今回の回路購入は別のdraft PRで実装。tradeの型チェック・既存テスト・購入テスト・本番ビルドとブラウザーの購入／取消／保存失敗を確認。マージ・公開は未実施。

- 2026-10-13 JST / Cursor（Grok Bot）— 敵 PR2〜PR5 の仕様（2026-10-13 18:11 神宮、文書のみ）。引き継ぎ用の Issue #285 と `CIRCUIT_SQUAD_DESIGN_V0.md` §11.4 に書いた。要点: 機体の性能はどれも同じ（世代の差と E5 の「型番が上がる」は取り下げ）。強さはマスの数字 n で決まる（回路 1＋floor(n/3) 枚、一辺 2＋floor(n/3)）。動き方は 4 種類で、視界は 220。D2 は残りの活動量と同じ数の電力パーツ。D3 = B、D4 = A、Z1 = A、Z2 = B、Z3 = A、Z4 = B、Z5 = A。PR2 は回路で動く敵、PR3 は残骸と落とし物、PR4 は持ち帰りの大破機、PR5 はゾンビ（`feat/recall-strays`）。
- 2026-10-12 JST / Cursor（Grok Bot）— 敵の決定の追加（23:54 神宮、文書のみ・PR2 に入れる）。B3 = A: 見た目では敵の行動は分からない。D1 = B: 倒した敵は残っていた弾を全部落とす（出てくるときの弾はランダムで、たいていは少なく、ときどき満タン。活動量も同じ。はぐれ機体の AI は互いを食い合い、コンテナをくすねて補給している）。D2 = B: 電力パーツは残りの活動量から式で直接決める。敵の活動量は動くと少しずつ減り、追いかけた途端に電池切れで残骸になることはない。式・減り方・分布の数字は PR2 の前に決める（`CIRCUIT_SQUAD_DESIGN_V0.md` §11.2）。
- 2026-10-12 JST / Cursor（Grok Bot）— 敵の PR1（feat/enemy-id-stats、神宮 10/12 19:52 Go、細部は 23:48 決定）。敵 1 機ごとに 型番（全部 `mech_gen1`）・耐久（今の HP のまま）・偽盤の回路（1 枚・2×2・効果の種類はランダム・効果値 0）を持たせた（行動は変えない。PR2）。見えている敵をタップすると、敵の上と「戦術／戦報」欄の先頭に「所属不明」が 3 秒（隊長は今までどおり動く。戦報の「敵1」はそのまま）。回路の中身は画面に出さない（途中保存には入る）。古い途中保存は読み込むときに補う。B3・D1〜D4・Z1〜Z5 の意味を確定し、選択肢と推奨を `CIRCUIT_SQUAD_DESIGN_V0.md` §11.2 に書いた（どれも未決）。決定済み: マスの数字が 0、または Invade を通らない出撃ではゾンビは出ない。僚機の頭上の赤字（#283）がスマホ幅で地図の端の表示の下に隠れる件は A = 変えない（23:48 神宮）。
- 2026-10-12 JST / Cursor（Grok Bot）— 僚機の頭上の赤字（feat/explore-status-badges、神宮 10/12 19:52 Go、細部は 21:29 決定）。生きている僚機の名前の上（「？」があればその上）に、状態がある間ずっと赤い縁取りの文字（画面上 11px、PC もスマホも、地図のズームに関係なく）。順番は［弾切れ｜残弾減少］・装甲低下・活動量低下・積載上限、複数は「・」でつなぐ。弾切れは撃てる弾が 0、残弾減少は撃てる弾が最大弾数（出撃中の上限）の 50% 未満で、同じ枠にどちらか 1 つ（0 のときは弾切れ）。活動量低下は出撃中の最大値（倍率込み）の 50% 未満。ちょうど 50% は出さない。隊長には出さない（今の情報欄のまま）。大破した僚機は状態の代わりに回路の効果の種類と効果値を出す（大きさは出さない。細部 8 つは 21:47 神宮の決定ですべて A: 付けた順・回路なしは何も出さない・偽盤と真盤は同じ見た目・色は状態と同じ赤・値は効果値の整数・効果の種類が無い回路は出さない・隊長の残骸には出さない・前の出撃の置き去りの残骸には出さない）。「デモ物資」の名前はそのまま（7 = A）。PR-B の移動の E2E は移動先の座標を「移動」のあとで計算するよう直した。前の 1 回の失敗の原因は確かめられていない（公開プレビューのスマホ幅で 10 回とも成功、カメラは動いていなかった）。
- 2026-10-12 JST / Cursor（Grok Bot）— 世界観と敵の計画（docs/world-and-enemy-plan、文書のみ。神宮 10/12 19:52 Go・21:47 の決定）。世界観: 外殻は高度約 10km（約 2km から変更）、酸素は約 3 分の 1・約 −50℃ で生身では外に出られない、与圧服は無く、作れるのはかろうじて気密を保つ球形の機体だけ（`PRODUCT_VISION.md` §2.1）。敵の決定 E1 = C・E2 = B・E3 = A・E4 = A・E5 = B・E6 = A・E7（E1 で扱う）・F1 = B・B1（B2 は不要）、帰還要請でゾンビ（数は Invade の盤のマスの数字）を記録し、5 本の PR の計画を書いた（`CIRCUIT_SQUAD_DESIGN_V0.md` §11）。未決: B3・D1〜D4・Z1〜Z5（意味は推測、確認待ち）。進行: #279・#280・#281 はマージ済み、PR-C（feat/explore-status-badges、僚機の頭上の赤字）は細部が決まり、この PR のあとに仕上げる。次は敵の PR1 `feat/enemy-id-stats`。
- 2026-10-12 JST / Cursor（Grok Bot）— 移動の 3 タップと操作パネル（fix/explore-move-tap-panel、神宮 10/12 19:52 Go）。僚機のパレットの「移動」はすぐ地図の地点の指定に入る（「地点選択」を削除。僚機 → 移動 → 地図 の 3 タップ。取り消しは今までどおり、カードか別の命令ボタン。古い途中保存の「地点選択」の途中も読める）。T42: 地図の右下の半透明の操作パネル（`#kb-overlay`）の枠がタップを吸い、PC 幅でもスマホ幅でもその下の僚機・残骸をタップできなかった。枠は `pointer-events: none`、中のボタン（隠す・キー）だけ `auto`。資材と旧キーの廃止は #280（`cd21ce4`）でマージ、Deploy Modules Preview run 38241074993 は success。
- 2026-10-12 JST / Cursor（Grok Bot）— 資材と旧キーの廃止（fix/hub-save-legacy-retire、神宮 10/12 19:52 Go、Q1 = C）。HubSave から `materials`・`importedMaterials`・`ammoLoad`・`selectedMechId`・`selectedAmmoId`・`inventoryFieldDrops` を外した（変換なし。古いセーブは読めて、次の保存でキーが消える。初期の資材 250・デモの 200 は削除）。Invade からの出撃の `startingAmmo` は `inventory.ammo`。解体は今までの資材と同じ数のジャンク（健在 15・要修理 10・大破 5、第2世代 +5）。所持欄・Sort の結果・帰還の成果は 4 資源だけ（「資材」「搬入 n」は出さない。古い履歴は出る）。Sort→HUB の URL はいつも `fromSort=1`（古い `importMaterials` も Sort からの帰還として読み、数は付与しない。二重受け取りの防止は `handoffId`）。回路の資材の修理割引を削除（食料→弾薬はそのまま）。詳細は `HUB_SAVE_CONTRACT.md` §12.12、`SORT_YIELD_V2.md`。互換テスト 12 本。#279 の記録は下。
- 2026-10-12 JST / Cursor（Grok Bot）— 救出パレットの PC 幅確認（fix/rescue-palette-desktop、神宮 10/12 18:30 Go）。4-2 は #278（`0c314ff`）でマージ、Deploy Modules Preview run 38216726444 は success。**fix/rescue-palette-desktop:** 4-2 の公開プレビューで PC 幅だけ救出が終わらなかったのはテストの作りが原因（前の場面の待機地点 `wingHold` が残り、搭乗円を消す編集のあと僚機が待機地点へ歩いていたため、タップが外れ、待ち時間も足りなかった）。ゲームの不具合ではない。パレットは「回収」の対象タップが外れても回収の選択を続ける（パレットも開いたまま）ようにし、外したときのやり直しを 3 タップから 1 タップにした。 **決定（2026-10-12 18:30 神宮、参謀経由）:** Q2 = A: 隊長機の残骸を積んだまま搭乗円なしで時間切れになったら、今の強制救助（救助費＝所持金の ¾）のまま。Q3 = A: 隊長機の残骸を積んでいる間の撤退も、費用のかかる救助撤退のまま。Q4 = A: 効果キーの無い古い回路は今のとおり（19 個から）決め直す。Q1（資材）= C: バーから消し、Sort・屑からも作らない（次の PR。fix/rescue-palette-desktop では触らない）。
- 2026-10-12 JST / Cursor（Grok Bot）— 項目4-2 僚機の回収と隊長の残骸（feat/explore-carry-wingman-rescue、神宮 10/12 15:05 Go）。4-1 は #277（`0b561bf`）でマージ、Deploy Modules Preview run 38213721511 は success。C1: 偽盤の回路効果に「回収」（`recover`）を足した（`FALSE_BOARD_EFFECT_KEYS` の最後、19 個。保存済みの effectKey は引き直さないので、今の回路の効果は変わらない。これから効果が決まる回路だけが「回収」を引ける）。回収を持つ僚機は隊長の「4」が無くてもパレット「僚機 → 回収 → 対象をタップ」が使え（「移動」は「4」があるときだけ）、距離の制限なしで自分で行って 8 秒で積む。搭乗円が無ければその場で待ち、出たらそこへ向かう。N2/C2/C3: 僚機が隊長機の残骸を積むと、その僚機を地図タップで動かせ、航空支援と帰還要請が戻り、離昇は通常の帰還（救助費なし、「帰還成功（隊長の残骸を回収）」）。積んでいる残骸の回路は効き、積んでいない残骸の回路は効かない。C1f は文書だけ。10/7 の「僚機が積むには `wing_mobility`＋`wing_recover`」は C1 で上書き（EXPLORE_COMMAND_UNLOCK_V0）。互換テスト: shared `circuit-actions.selftest`（C1e）、explore `rescue.selftest.ts`（旧チェックポイントの補完）。未決: 隊長の残骸を積んだまま搭乗円なしで時間切れになったときは今の強制救助（救助費 ¾）のまま。
- 2026-10-12 JST / Cursor（Grok Bot）— 項目4-1 積載と速度（feat/explore-carry-load、神宮 10/12 15:05 Go）。積載はコンテナ 1・残骸 2、上限 2（C4、コンテナにもかかる。`cargo_slots` で増える）、残骸の回路は積載に数えない（C3）。速度は積載 0〜6 で 120／75／60／45／30／15／0（隊長も僚機も、積載 0 の僚機も 120＝10/7 の神宮の回答）× 解放の能力の倍率（C5）。旧「×0.45 まで遅くなるだけ」の計算は置き換えた。隊長の残骸回収の 3 つの不具合を修正（手ぶらで取れない・距離を見ない・残骸だけ一瞬）: 回収半径の中で、コンテナも残骸も 8 秒。積載した機体が大破すると積荷をその場に落とし、拾い直せる（C6）。地図に「積載中 残骸」、僚機カードと隊長の HUD に「積載 n/2・速度 N」（C7・C8）。F1: Explore の作戦概要の「実弾」は倉庫の弾（`inventory.ammo`）で、出撃 URL の `startingAmmo` も倉庫の弾をいつも送る（古い URL も読める）。F3: デモの「機体を受領」の機体は実弾・装甲（耐久）・電力（バッテリー）を満タンで来る（弾は倉庫から引かずに付ける）。F2（所持欄の「資材」）は使い道があるため外していない（下の未決）。途中保存の積載（`circuitPlay.carry`・`wreckChannel`）は古い途中保存の `carried` から作り直す。#276（`9bb57b6`）の Deploy Modules Preview 38186950240 は success。
- 2026-10-12 JST / Cursor（Grok Bot）— 格納庫のお金の続き（fix/hangar-money-followups、神宮 10/12 09:03 Go・E1〜E3）。E1 = B: 購入・作成した機体は携行弾 0 で来て、出撃前に在庫から積む（M3。足りなければ出撃ボタンの近くに 1 行＝M8）。購入で弾の合計は増えない。E2 = A: 足りないときの通知の場所は今のまま。E3 = B: 上の所持欄に「装甲パーツ」。所持欄の在庫数の不具合を修正: 「弾薬」が旧 `ammoLoad`（弾種別・初期 55）の合計を出していて、Sort の弾・売買・積み込み（どれも `inventory.ammo` を動かす）が反映されなかった。「電力パーツ」は欄に無く、資源取引の表にしか出ていなかった。今は 弾薬＝`inventory.ammo`・装甲パーツ＝`inventory.armor`・電力パーツ＝`inventory.power`（trade `holdingPills`）。所持欄を描いたあとに並べ替えていた `wallet-summary.ts` は欄に触らない（値の書き換えは保存の読み方の誤りで元から動いていなかった）。`ammoLoad` はセーブに残し、書き換えない。A2 の既定 4 つを `HUB_SAVE_CONTRACT.md` §12.5 に列挙。#275（`702dd64`）の Deploy Modules Preview 38183735630 は success。
- 2026-10-12 JST / Cursor（Grok Bot）— 機体のお金（#266、feat/money-mech-economy、神宮 10/12 08:06 Go）。格納庫に「新品購入 2000c」「新規機体作成 装甲パーツ300 と 500c」（最大耐久×3＋500c）、大破機に「残骸復活 装甲パーツN と 500c」（最大耐久×2＋500c。回路は付いたまま・耐久満タン・復活すると回路をまた数える〔Q4〕。#270 の航空支援の残骸も復活できる）、耐久が減った機体に「通常修理 装甲パーツN」（足りない耐久の分、クレジットなし。旧 50c＋資材 30 はやめた）。足りなくてもボタンは押せて、通知に「装甲パーツが足りない」など（`MECH_FLEET.md` の「不足時 disabled」を直した）。回路の修理割引はかけず「修理 −X%」の表示も外した。旧「修理（クラシック）」「型付き修理」のボタンは外した。復活した機体の携行弾は変えず出撃前の補充（M3）で積む。新しい保存キーは無い。A1 = A（付け替えで動いた弾は開発用コンソールに記録だけ）、A2 = A（技術上の既定 4 つはそのまま）を `HUB_SAVE_CONTRACT.md` §12.5 に記録。#274（`dfa4b80`）の Deploy Modules Preview 38182004633 は success。
- 2026-10-12 JST / Cursor（Grok Bot）— 回路の付け替えで弾薬を倉庫へ戻して積み直す（fix/circuit-ammo-activity-refill、神宮 10/12 07:32 Go・M1〜M8）。MMR の弾数（28 → 6 → 1 と減る）と活動量の上限（回路の上乗せが帰還で保存されて重なる）の不具合を修正。回路の装備・付け替え・取り外し（売却・偽 1×1・装着の整合も、大破機も）で携行弾を「弾薬」在庫（`inventory.ammo`）へ戻し、新しい上限（28 × 銃の回路、MMR 6・LMG 56）まで積み直す。帰還と出撃前に在庫から自動で補充し、足りなければ出撃ボタンの近く・結果画面に 1 行（「弾薬が足りません：僚機A 12/28」）。解体した機体の弾は在庫へ。出撃中の弾の上限を超える分は捨てずに持ち帰る。活動量の上乗せは出撃中だけで保存しない。壊れたセーブは 1 回だけ直す（新しい任意キー `ammoBatteryRepaired`）。決定とキーは `HUB_SAVE_CONTRACT.md` §12.5「携行弾の配り方」。PR-B（#273）は `6bb8a8f`・Deploy Modules Preview 38180668471 success。
- 2026-10-12 JST / Cursor（Grok Bot）— 進むと開くの PR-B（#273、神宮 10/12 Go、未決 P1〜P4 は 07:21 決定）。公開プレビューの既定を `release` に（未設定・不正値も `release`、DEBUG の全解放は残す）。`release` だけの 9 つの能力の倍率（攻撃力・最大弾数・弾速・射撃間隔・最大耐久・最大活動量・射程・視界・移動速度。付けた 1×1 が「4」で 1 倍、効果値 0 か 1×1 なしで 0.5 倍〔P4: 仮〕、射撃間隔は ÷0.5。値は `releaseAbility.ts` の `RELEASE_ABILITY_SCALE` だけ）。Q3a は 0.5 倍の上に ×2 で 1 倍（隊長にはかけない）。Q4 は今のまま。P3: 最大弾数の上限を越えた分は持ち帰り、最大活動量の 0.5 倍は出撃中だけ。N1 + P1: 自律していない僚機は、隊長の「4」で、地図で僚機の近く（約 24px）か僚機のカードをタップ → 地図の下の段のパレット「移動」→「地点選択」→地図をタップ。「全僚機」ボタン。選んだ僚機とカードに枠、移動先に印。ほかのタップは隊長の移動。P2: 移動中も射程内は撃ち、追わない。N2（隊長が残骸のあと航空支援を出さない）、N3（移動の命令は使える）。格納庫に「掲示板が開いた」（#269 の文言）。MMR の弾数・活動量の上限が出撃ごとに重なる既存の不具合はこの PR では直していない。PR-A（#272）は `832d52e`・CI 38175805023・Deploy Modules Preview 38175944892 success。
- 2026-10-12 JST / Cursor（Grok Bot）— 初クリアの PR-A（#272、神宮 10/12 Go・S1〜S3）。Invade の盤を初めて掃討しきった操作（盤が sectorCleared に変わった保存）で、HubSave の任意キー `firstInvadeClear`（`{ boardSeed, at }`）を記録し、同じ保存で未修復の「4」の 1×1（`circuitId` `true-1x1`、`puzzleId` `true-1x1-four`、数字 4 が 1 つ）を倉庫へ入れる。S2: キーの無いセーブは未クリア。盤の様子からは推測しない（読み込んだ時点で掃討済みの盤は数えない。次に掃討したときに発見）。発見は 1 回きり（二度目の掃討・読み直し・二重の保存では増えない。「4」を売っても再付与しない）。Invade のクリアの帯に 1 行「盤の奥で、小さな回路を1枚見つけた」（発見した盤だけ。効き目の説明なし。帯のほかの文言は変えていない）。`makeTrueOneByOne` は未修復で作る（直った形は `makeRestoredTrueOneByOne`、テスト用）。S3: Restore は 1×1 を開ける（数字 4・4 辺の閉ループで Perfect → 刻印ロック）。直してから装備する（直す前は真の 1×1 として数えない）。S1: `resolvePerfectCircuitInjectRate` は初クリアまで 0%、そのあと従来の率（公開プレビュー 1%）。ジャンクからの回路作成にも抽選を入れた（当たりは未修復の真盤）。`?perfectRate=` の指定だけは初クリア前でも効く（デバッグ用）。購入・拾い物・敵のドロップはまだ回路を作る経路が無く、作るときはこの率を使う。公開プレビューの既定は `all_unlocked` のまま（`release` への切り替えは PR-B）。#271（風紀委員の文書案）の有用な部分（既存の印はどれも初回クリアではない）を取り込み、#271 は閉じる。#270 の記録を追加（下）。
- 2026-10-12 JST / Cursor（Grok Bot）— 回路の効果（#270、Issue #269）を神宮の決定（10/11〜12、Q1〜Q5・Q3a〜Q3c）に合わせて仕上げた。Q1: 公開プレビューの既定は `all_unlocked` のまま（未設定・不正値も `all_unlocked`、DEBUG は残す。`release` への切り替えは初クリアの PR）。`all_unlocked` でも 2×2 以上の回路の効果と指定行動のボタンは働く。Q2: 新しい隊長は偽の 1×1（数字 0）で始まり、「4」は初クリアで初めて手に入る（古いセーブは隊長に回路が無いときだけ付ける）。Q3: 回路がなくても隊長は移動・射撃・回収・帰還・撤退ができる（`captainOneByOne` のロックを外した）。偽の 1×1 で開くコマンドはない。隊長の「4」で `wing_mobility`、僚機の「4」でその僚機が自律。Q3b: 隊長の「4」で航空支援（600c・200 秒、値は元から一致）。Q4: 格納庫の大破機の回路は修理まで数えない（「4」でも開かない）。Q5: 新しい効果は装着中の回路だけで数える（#270 の集計のまま）。偽の 1×1 を付けた僚機の 2 倍は `release` だけ（Q3c）。1×1 の効果値の倍率は初クリアの PR。技術確認: 航空支援の代金の書き込みが断られたら打たない、救助費用（½・¾）は代金を引いたあとの所持金で計算（二重引きなし）、Restore で真盤になった回路の合わない `effectKey` を選び直す、途中保存の霧の配列を読み直しで作り直す。#266（お金まわり）は採用済み・未着手。#248（`409c4b7`）のデプロイ run 37854085456 は success（下の記録のとおり）。
- 2026-10-10 JST / Cursor（風紀委員）— 項目5-3（戻るの無効化と途中保存）を #267（`5256085`）でマージした。Deploy Modules Preview run 38008393878 は success（build と deploy）。プレビューの操作はしていない。
- 2026-10-10 JST / Cursor（アロー）— 項目5-3（戻るの無効化と途中保存）を draft で実装。main には入っていない。Deploy Modules Preview は走っていない。プレビューの操作はしていない。
- 2026-10-09 JST / Cursor（風紀委員）— まっさらな Cloud Agent が読む正本を [`AGENT_CANON.md`](./AGENT_CANON.md) に、Cursor Automations へ貼る Instructions を [`automations/`](./automations/) に置いた（文書のみ）。リレーの起動口は GitHub Issue コメントの JSON。Slack は写しで、チャットや Slack に置いただけでは次のエージェントは起動しない。#248（`409c4b7`）の Deploy Modules Preview run 37854085456 は success。プレビューの操作はしていない。
- 2026-10-09 JST / Cursor（Grok Bot）— 項目5-2b の続き。隊長が生きている時間切れで持ち帰ったコンテナ（半径の中の未回収と、半径の中のキャンプの置場）は、explore→sort の `forcedRescueRecovered` で Sort が通常の帰還と同じく精製でき、未開封のまま倉庫へ入る。印の無い古い URL と古いセーブはそのまま読める。`extracted` は立てないので摩耗は 20 のまま。救助撤退と隊長が大破した時間切れは印を付けず、積荷は倉庫に入らない。
- 2026-10-08 JST / Cursor（アロー）— 項目5-2b（時間切れの強制救助、隊長が無事なあいだは撤退ボタンを出さない）を実装。draft のまま。マージしていない。この変更の Deploy Modules Preview はまだ走っていない。最後にデプロイ成功した main は #245（`fd892c8`）のまま。#246 と #247 は文書だけで、デプロイは走っていない。プレビューの操作はしていない。
- 2026-10-08 JST / Cursor（風紀委員）— 項目5の正式仕様を [`ITEM5_FORMAL_SPEC.md`](./ITEM5_FORMAL_SPEC.md) に書いた（文書のみ）。次の実装は 5-2b。隊長が無事なあいだの撤退ボタンを隠し、確認を「今 X c → Y c」と「やめる」にし、時間切れの強制救助を入れる。生きている時間切れの摩耗 20 は `abort` に乗せ、半径の中のコンテナは持ち帰る。5-3 と真盤は決定済みのまま、この実装には入れない。設計メモ §7.1 と食い違うときは正式仕様を優先する。
- 2026-10-08 JST / Cursor（Grok Bot）— 項目5-2（隊長機大破で即失敗にせず救助撤退）を実装。隊長機が大破しても出撃は続き、移動・射撃・新しい帰還要請はできず、僚機への命令は使える。上部の帯「隊長機大破 — 撤退できます（救助費用：所持金の半分）」。救助撤退は確認（「撤退」／「取りやめ」）のあと。全滅はその場で自動。救助費用は floor(所持金 / 2) で、0c は 0c。Explore はお金を持たず、帰還の `rescueFee` を Hub が `sortieId` ごとに 1 回だけ引く。生きている僚機は置き去り。積荷とキャンプの置場は失う。大破より前の搭乗円は残り、隊長の残骸が円の中で離昇すれば無料の通常の帰還（見出し「帰還成功（隊長の残骸を回収）」）。結果画面は「救助撤退」「救助費用 ○○c」、失ったもの、残骸の行、場所。隊長が無事なときの撤退は今のまま（制限は 5-2b）。Trade の開発用シミュの表示は 帰還・撤退・失敗（識別子は変えない）。#245 をマージ。Deploy Modules Preview run 37764876807 は success（build と deploy）。プレビューの操作はしていない。
- 2026-10-08 JST / Cursor（Grok Bot）— 項目5-1b③（invade・trade: 残骸の印と格納庫の数）を実装。Invade の盤で残骸のあるマスに右下の錆色の点（`#a8604a`）の印「残骸」、凡例の見本「残骸」、ツールチップ「残骸 （ID）」／「残骸 n 機: （ID）, …」、マスを選ぶと出撃バーに「残骸 n 機：出撃して離陸すれば回収」。格納庫の出撃欄は「置き去り n 機（Invade の盤に表示）」と「残骸 n 機（Invade の盤に表示）」を別の行に出し、0 機の行は出さない。置き去りの印・ツールチップ・行・数は `kind` が `"wreck"` でない行だけを数える（`kind` の無い古い行は置き去りのまま）。#243 のデプロイを記録
- 2026-10-07 JST / Cursor（Grok Bot）— 項目5-1b②（explore: 撃破した場所に残骸が残り、搭乗円で回収できる）を実装。撃破された機体（隊長も）は撃破した場所に灰色の「残骸 僚機A」として残る。離昇のとき搭乗円の中なら大破のまま回路ごと持ち帰る（W2 B・W7 A）。外なら Invade を通った出撃は `lostMechs` の残骸（`kind: "wreck"`・`pos`・マス）になり、次に同じマスへ出撃すると同じ座標に現れる（カバー物と重なるときだけ外へずらす。保存の座標は変えない）。Invade を通らない出撃は回路ごと失う（W4 A）。結果画面は「僚機A は大破（残骸と回路は撃破した場所に残る）」。#242 のデプロイを記録。格納庫の数とマスの印は③まで「置き去り」に含めて出る（→ ③で分けた）
- 2026-10-07 JST / Cursor（Grok Bot）— 項目5-1b①（shared: 撃破された機体を回路ごと残骸として記録する）を実装。`lostMechs` の行に `kind`（置き去り／残骸）と `pos`（Explore の座標）を足し、残骸は回路を付けたまま `fleet` から外れる。回路だけの落とし物はもう作らない（摩耗だけで耐久 0 の機体は回路付きの `destroyed`）。古いセーブの回路だけの落とし物（`wreck_not_carried`）は読み込みで倉庫へ戻す。Invade が別の盤を開くと残骸は回路ごと消える。2026-10-07 22:04〜23:18 の神宮の項目5 の決定（5-1b・5-2・5-2b・5-3・お金の S1〜S3）を記録（設計メモ §7.1）。#241 のデプロイを記録
- 2026-10-07 JST / Cursor（Grok Bot）— 項目5-1（出撃中に撃破された機体を帰還で大破として反映する）を実装。`Unit.alive=false` で終わった機体（隊長も）は、帰還・撤退・失敗のどの終わり方でも HUB で `destroyed` になり、回路は今の大破機の扱い（Invade の出撃マスに落ちる／通らない出撃では失う）。帰還種別ごとの一律摩耗は生き残った機体だけで、値は変えない。隊長撃破の即失敗は今どおり（救助撤退は 5-2）。表示は今ある大破の表示をそのまま使う（新しい文言なし）。神宮の残骸の定義（10/7 21:51〜21:56）と、項目5の細部1 = A（項目5では背負わない）・細部11 = A を記録
- 2026-10-07 JST / Cursor（Grok Bot）— 「4」の 1×1 の回路の確定（17:06 神宮: 主人公の 1×1 はこれ、初クリアで発見する回路と同じ、付けると `wing_mobility` が解放、最初の周回は実質単機でバランス感覚をつかむ意図）と、初クリアまで真盤 0%（21:49 神宮）を記録（文書のみ）。To-do を 2 つ追加。最後にデプロイ成功した main コミットを #238 に更新
- 2026-10-07 JST / Cursor（Grok Bot）— 世界観を追記（#239・文書のみ。`PRODUCT_VISION.md` §2.1.5: 1×1 の回路・閾値の瞬間・宇宙規模の戦争は範囲外・解放はアイコン。16:45・16:48 神宮）
- 2026-10-07 JST / Cursor（Grok Bot）— 用語を「帰還」に統一（下の「用語」。画面・ログ・ヘルプ・キー一覧・文書。X の行動と搭乗円は「帰還要請」、局面は「帰還」。英語の識別子・保存データ・URL は変えない）。離昇のログは「帰還成功／帰還失敗」（「生還」はそのまま）。英語の表示「EXTRACT」をやめて日本語だけに（Explore の HUD・ヘルプ、Trade の「探索帰還」）。Trade の撤退の表示は「中断」→「撤退」。キャンプ未解放のときはキャンプの表示を出さない（時間切れの帯は「時間切れ」だけ）。「？」は太字 16px。2026-10-07 16:35 の神宮の決定。この PR のデプロイ記録は次の PR で入れる
- 2026-10-07 JST / Cursor（Grok Bot）— C20-b（一部の僚機だけ解放済みの小隊方針で、従えない僚機が「？」で反応する）を実装。命令ごとに 50/50 で止まる（その場で待機・射程内だけ撃つ・次の命令／帰還要請／散開捜索で解除）か無視。ログは出さない（「対象外」ログは捨てた）。待機中のマップのラベルは「僚機A·待機」。これで C20 は完了
- 2026-10-07 JST / Cursor（Grok Bot）— C20-a（未解放のコマンドを画面に出さない）を実装。方針「未解放のコマンドは見せない。主人公はどんな回路があるか知らず、何ができるようになるかも知らない（10/7 8:07 神宮）」。帯同・哨戒・遊撃・回収・召還は僚機ごとに `wing_mobility` が前提、小隊単位の判定は生きている僚機だけ。「？」の反応は C20-b で続ける
- 2026-10-07 JST / Cursor（Grok Bot）— 2026-10-07 7:36 の神宮の回答を記録（文書のみ）: 初回クリアのお金の報酬はなし（1×1 の白回路の発見だけ。1×1 はこの 1 枚だけの例外）、積載 0 は 120・標準の積載上限は 2 のまま（上限 2 は暫定）、僚機は ~~1000c~~ 2000c、修理費はそのまま、レア度とチャーム型回路は後回し、充電はバッテリーの消費と一緒に後回し（実装の予定順から外した）、回路なしのベースライン（隊長は移動・攻撃・回収・帰還、僚機は攻撃だけ。今の実装との差は項目16）。最後にデプロイ成功した main コミットを #234（`c197b4a`）に更新。U14 は #234 で実装済みなのをコードで確認
- 2026-10-07 JST / Cursor（Grok Bot）— U14（装着中の回路の売却: 確認に「装備: <機体ID> から外して売却します」、保有回路一覧に「装備: <機体ID>」、外して売る処理を明示。売値・perfectMaxSize・置き去り機の扱い・通知は従来どおり）を実装
- 2026-10-07 JST / Cursor（Grok Bot）— 2026-10-06〜07 の神宮の決定（段位・背負い・お金まわり・アルファ版の方針）を記録し、古い記述を直した（文書のみ）。F・G は完了（#228・#230・#231）。2026-10-03 深夜〜10-04 の #224〜#231 は、神宮が動かしたクラウドエージェントが神宮の承認のもとで行った（署名と刻印名の入力修正 #227、背負えなかった大破機の回路の落とし物 #228、Invade の落とし物の印＝G #230、Explore での落とし物の拾得＝F の残り #231。#224〜#226 は文書のみ）。U8 は「盤を作り直したら落とし物も移す」（#221 で実装済み）。U14 はほぼ実装済み（残りは売却の確認に「装着中」と出すこと）、C20・項目5 は仕様決定済み・実装待ち。実装の予定順を追加
- 2026-10-05 JST / Cursor（Grok Bot）— U5 の方針変更を記録（文書のみ。2026-10-05 0:07 神宮の判断）: 回路ボーナスは装着中に限定しない。将来のチャーム型回路に備え、回路の種類ごとに効き方を決められる前提とし、今の集計（置き去り機の回路を除く所持回路）を維持。装着中だけで集計する #229 は不採用でクローズ。最後にデプロイ成功した main コミットを #231（`11a2b20`）に更新し、#222・#227・#228・#230・#231 のデプロイ記録を反映
- 2026-10-04 JST / Cursor（ジャベリン）— 出撃マスの落とし物を Explore で拾い、倉庫へ戻す（回路データモデル F の回収）。Explore は出撃開始時の HubSave を `fieldDropsAt` で今の `frontSeed` と出撃マスだけに絞って降下地点の近傍に出し、離昇時に搭乗円の内側なら回収（`recoveredDropIds`）。直接保存と帰還 URL の両方で `applyExploreReturnToHub` が `recoverFieldDrops` を通して倉庫（`equippedTo: null`）に戻す。既に持っている `circuitId` は場に残り、拾ったと出さない。結果画面には倉庫へ戻した回路だけを出す
- 2026-10-04 JST / Cursor（Grok Bot）— 背負えなかった大破機の回路を、Invade を通った出撃では出撃マスの `fieldDrops`（`wreck_not_carried`）にし、通らない出撃では失う（U7）。機体は `destroyed` で格納庫に残す（#199）。置き去りの僚機が大破していても回路は `lostMechs` の機体に付けたまま。結果画面に落ちたか失われたかを出す。Explore での拾得と Invade の落とし物の印は別（#228）
- 2026-10-04 JST / Cursor（Grok Bot）— 署名（格納庫）と最終編集者名（Restore）で、コピーした複数行が1行目しか入らない・変換中の文字が確定して濁点を付けられない、を直した。`maxlength` を外し、変換中は欄の値を書き換えない。改行を含む貼り付けは行を捨てずに繋げる。手元のブラウザで確認済み。PR のビルドチェックは成功。神宮が「直った」と確認（2026-10-04）
- 2026-10-03 JST / Cursor（Grok Bot）— 格納庫の出撃パネルに置き去り数を表示し、回路ボーナス（修理割引・作成倍率・耐久バッファ）から置き去り機の回路を外す（trade・Invade からの出撃とも）。回収の 3 本目（#221）のデプロイ記録を反映
- 2026-10-03 JST / Cursor（Grok Bot）— 置き去りの機体の回収の 3 本目（invade: 置き去り機のいるマスに印・ツールチップ・出撃バーの 1 行、盤の作り直しで同じ座標へ移す、場所のない古い行は開始地点へ）と、#220 のデプロイ記録を反映
- 2026-10-03 JST / Cursor（Grok Bot）— 置き去りの機体の回路を HUB の回路一覧・数から外す（売却・付け替え不可、回収で戻る）と、回収の 2 本目（#218）のデプロイ記録を反映。`SORT_V2_RULES.md` に旧仕様の注記
- 2026-10-03 JST / Cursor（Grok Bot）— 置き去りの機体の回収の 2 本目（explore: Invade を通った出撃の置き去りを場所付きで記録・同じマスで再出現・離昇時に搭乗円の内側なら回収、Invade を通らない出撃の置き去りは機体と回路を失う＝#206 の残り、Invade からの出撃も部隊を連れて出る）と、回収の 1 本目（#215）のデプロイ記録を反映
- 2026-10-03 JST / Cursor（Grok Bot）— 置き去りの機体の回収の 1 本目（shared: `lostMechs` に場所・時刻・写し、`recoveredLostMechInstanceIds` で `fleet` に戻す、回路の二重化を修正）と文書の残り（「最大 3」の記述、最後のデプロイ記録）を反映
- 2026-10-03 JST / Cursor（Grok Bot）— 項目15（機体数上限3の撤廃・格納庫で出撃機を最大3機まで選ぶ・再出撃も同じ選択を読む）を反映（計画の 5）
- 2026-10-03 JST / Cursor（Grok Bot）— U9（Explore の直接保存・再出撃を HubSave から組み直す）を反映。撤退の修正（#211）は解消済みとして記録済み
- 2026-10-03 JST / Cursor（Grok Bot）— 携行弾の修正（#208 explore・#209 trade）のマージとプレビュー確認を反映。契約文書（`HUB_SAVE_CONTRACT.md` §12.5〜12.7・`CIRCUIT_DATA_MODEL_V0.md` §5.5〜5.6）と同じ PR で、2026-10-03 の神宮・参謀の決定（置き去りの僚機・部隊と出撃・U9）を記録（文書のみ）
- 2026-10-03 JST / Cursor（Grok Bot）— 2026-09-28 以降に main へ入った PR（#160〜#206）に合わせて STATUS を同期（文書のみ）。回路データモデル A〜G の進み具合、最後にデプロイ成功した main コミット、開いている PR、次にやることを更新。`AGENT_CLAIMS.md` の完了済み宣言（#191）を完了扱いに更新。判断できなかった点は「未確認」と書いた
- 前々回: 2026-09-28 JST / Cursor（Grok Bot）— Restore のスマホ対応（#159）まで。それ以前の経緯は `eaad1ad` 時点の `docs/STATUS.md` を参照

## 用語

- 用語：2026-10-07 14:15 神宮、『抽出』を『帰還』（X は帰還要請）に統一。それより前の記録の『抽出』は帰還要請のこと。
- 用語（R1・2026-10-07 神宮）: 古い言葉の代わりに、局面は「帰還」、X の行動と搭乗円は「帰還要請」と書く。古い言葉はこの節の上の 1 行だけに残し、画面・ログ・コメント・文書の新しい文章では使わない。

## 最後にデプロイ成功した main コミット

- `9bb57b6` — #276（機体の購入と作成の弾・装甲パーツの表示・所持欄の在庫数）。`Deploy Modules Preview` run 38186950240：success（2026-10-12）。公開プレビューで確認済み（所持欄の弾薬・装甲パーツ・電力パーツが Sort・売買・修理・積み込みで実在庫と一致、買った機体は弾 0 で出撃前に積む）
- `702dd64` — #275（機体の購入・作成・残骸の復活・修理を装甲パーツとお金で、#266）。`Deploy Modules Preview` run 38183735630：success（2026-10-12）。公開プレビューで確認済み（4 つのボタンの文言と費用、足りないときの通知、二重払いなし、修理割引の表示なし）
- `dfa4b80` — #274（回路の付け替えで弾薬を倉庫へ戻して積み直す）。`Deploy Modules Preview` run 38182004633：success（2026-10-12）。公開プレビューで確認済み（MMR 28 → 6 のあと 2 回の出撃で 6 のまま、不足の 1 行、帰還で 12 → 28 の補充）
- `6bb8a8f` — #273（進むと開くの PR-B）。`Deploy Modules Preview` run 38180668471：success（2026-10-12）。公開プレビューで確認済み。その前の #272（`832d52e`、PR-A）は run 38175944892：success
- `c30ebb7` — #270（回路の効果）。`Deploy Modules Preview` run 38150799547：success（2026-10-12）。公開プレビューで確認済み（全部解放のまま今までどおり遊べる・#267 の戻る無効と一時停止）
- `5256085` — #267（戻るの無効化と途中保存、項目5-3）
- `Deploy Modules Preview` run 38008393878：success（2026-10-10 09:17 JST 開始。build と deploy）。プレビューの操作はしていない。その前の #248（`409c4b7`、項目5-2b）は run 37854085456：success（2026-10-09 07:32 JST 開始。build と deploy。プレビューの操作はしていない）。その前の #245（`fd892c8`）は run 37764876807：success（2026-10-08 19:39 JST 開始。プレビューの操作はしていない）。その前の #244（`b73ddf9`、項目5-1b③）は run 37718453864：success（2026-10-08 11:33 JST 開始）。#243（`929c6c3`、項目5-1b②）は run 37639082931：success（2026-10-07 23:43 JST 開始）。プレビューで確認済み（結果画面に「僚機A は大破（残骸と回路は撃破した場所に残る）」、`lostMechs` に `kind: "wreck"`・`pos`・マスの行、2 回目の出撃で同じ座標に残骸が現れる。コンソールのエラーは古い favicon の 404 だけ）。その前の #242（`92ed833`、項目5-1b①）は run 37637708087：success（2026-10-07 23:33 JST 開始。プレビューで確認済み（古いセーブの回路だけの落とし物 `wreck_not_carried` が読み込みで倉庫へ戻り、格納庫の回路が 1 枚 → 2 枚。他の原因の落とし物はそのまま）、#241（`725c10e`、項目5-1）は run 37625813799：success（22:05 JST 開始）、#238（`c3a5c0d`、用語を「帰還」に統一）は run 37589472759：success（16:47 JST 開始）、#237（`05096fa`、C20-b）は run 37577161894：success（14:36 JST 開始）、#236（`94b3c6a`、C20-a）は run 37576329512：success（14:26 JST 開始）、#234（`c197b4a`）は run 37540296458：success（07:23 JST 開始）、#231（`11a2b20`）は run 37190045232：success（2026-10-04 17:47 JST 開始）、#230（`981e7a0`）は run 37188101202：success（17:11 JST 開始）、#228（`24bd2d8`）は run 37185671195：success（16:24 JST 開始）、#227（`2c55558`）は run 37177329980：success（13:33 JST 開始）、#222（`b8ea197`）は run 37127185644：success（2026-10-03 22:44 JST 開始）
- #221（`e3da6a3`）は run 37125459533：success（2026-10-03 22:13〜22:14 JST）。プレビューで確認済み（Invade 経由で置き去ると HQ マスに灰色の点の印・凡例の見本・ツールチップに機体 ID、選ぶと出撃バーに「置き去り機 1 機：出撃して離陸すれば回収」、2 機ならツールチップに数、印のあるマスの開き方は印なしと同じ、盤の作り直しで同じ座標（範囲外は (11,-11)）へ移り回収できる、場所のない古い行は開始地点に置かれ回収できる、回収で印が消える）。その前の #220（`6c9b739`）は run 37123932940：success（21:46 JST。置き去り機の回路が格納庫・Trade の一覧・選択肢・枚数に出ない、回収すると戻る）、#218（`ed22e87`）は run 37122926841：success（21:27〜21:28 JST。Invade の盤から出撃して置き去り → 同じマスで再出現・回収せず帰ると同じ行を更新 → 降下地点で回収して部隊に復帰、格納庫からの直接出撃では機体と回路を失う、仕分へ・再出撃・格納庫へを確認）、#215（`cdba96f`）は run 37121157155：success（20:54〜20:55 JST。既存の流れと、二重化していた古いセーブの読み込みを確認）、#213（`31a3c70`）は run 37120458883：success（20:41〜20:42 JST。4 機以上の読み込み・4 機目は選べない・出撃と摩耗は選んだ機体だけ・選択の保存・再出撃＝格納庫の選択を確認）、#212（`a346a2d`）は run 37119522768：success（20:23 JST 頃）、#211（`fd4e859`）は run 37119019061：success（20:14 JST 開始）、#209（`fb8234f`）は run 37118268304：success（20:00 JST 開始）、#208（`26c8896`）は run 37117792158：success（19:51 JST 開始）
- 2026-09-29 の #187（`0f2618d`）以降、`packages/**` を変える main への push はすべて success（#189・#191・#192・#195・#196・#197・#199・#201・#203・#204・#206・#208・#209・#211・#212・#213・#215・#218・#220・#221・#222・#227・#228・#230・#231・#234・#236・#237・#238・#241・#242・#243・#244・#245・#248・#267・#270）。文書だけのコミット（#198 `07b19b9`・#205 `6c3bf6d`・#207 `a8ee15e`・#210 `7f65334`・#214 `149e31d`・#216 `cd782c4`・#217 `bec5e58`・#219 `ec8079b`・#224 `d604b5b`・#225 `07968ca`・#226 `97a9d08`・#232 `b3fd585`・#233 `a11e2b6`・#235 `8f6a03c`・#239 `2451fdd`・#240 `b260298`）は workflow の `paths` に当たらないのでデプロイは走らない
- 直近の赤: 2026-09-28 16:39 JST の #166（`6d9cde0`）から 2026-09-29 17:21 JST の `f2928de` まで、main への push は `Build sort (Pages /sort/)` で failure（途中 1 件 cancelled）。#187（Sort の資源4分類移行の仕上げ、`0f2618d`、2026-09-29 19:26 JST）で復旧
- 確認コマンド: `gh run list --workflow "Deploy Modules Preview" --branch main --limit 5`

## 開いている PR

- 2026-10-03 時点で、9/29〜30 に作られて追い越されていた 3 件を整理した:
  - #194（shared の落とし物契約テストの再 PR）: #196 と同一内容で、その後 #206 が同じファイルに追記して main と競合 → 2026-10-03 に閉じた
  - #190（`docs/IMPLEMENTATION_PLAN.md` を `823ae4d` 基準で書き直す案）: B（#158）を「次の主実装」、C・D を「未着手」としており、作成時点でも古かった。GeminiSpark QA の結果は下の「QA・実機確認の記録」に移した → この STATUS の PR のマージ後に閉じる。main の `docs/IMPLEMENTATION_PLAN.md` は 2026-09-26 のまま
  - #193（`docs/AGENT_CLAIMS.md` の #191 完了扱い）: 同じ更新をこの STATUS の PR に含めた（#193 の「実装Eの担当宣言が確定するまで着手しない」は E が #195 でマージ済みのため含めない）→ この STATUS の PR のマージ後に閉じる
- 計画（2026-10-03 参謀。1 件ずつマージし、デプロイが緑なのを確かめてから次へ。パッケージの境目で分けてよい）:
  1. STATUS の同期 → #207（`a8ee15e`）完了
  2. 携行弾の修正 → explore #208（`26c8896`）・trade #209（`fb8234f`）完了。プレビューで確認済み（下の「QA・実機確認の記録」）
  3. 契約文書と 2026-10-03 の決定の記録（この PR）
  4. U9: Explore が出撃終了時に HubSave へ直接書く → U9 の PR で実装
  5. 機体数上限の撤廃と出撃機の選択（項目15。上限を前提にしたテストも直す）→ 項目15 の PR で実装
  6. 置き去りの機体の回収（3 本に分ける: ① shared と文書の残り → 回収の 1 本目の PR、② explore（離昇時の搭乗円での回収・再出現・Invade を通らない出撃の喪失）→ 回収の 2 本目の PR、③ invade（`frontSeed` での表示・盤の作り直し時の移動）→ 回収の 3 本目の PR）

## 進行中／次にやること

- **To-do（全画面シェル PR6・2026-11-01）**: PR1（#333）以降、縦スクロールするのは `window` ではなく `#wl-shell-panel`。PR6 の各画面フィットで、`window.scrollY`／`scrollTo`／`scroll` イベント／`position:sticky`・`fixed`／`scrollIntoView` など window のスクロール位置を前提にしたコードを洗い出して直す（例：`play-log-browser.ts` の `visualViewport` scroll 監視）→ [FULLSCREEN_SHELL_V0.md](FULLSCREEN_SHELL_V0.md)
- **Trade の資源履歴の増減**（神宮 10/17）: 増える＝緑、減る＝赤、どちらでもない＝灰色（青から変更）。数の符号は増える「+」、減る「−」（U+2212）、0 は「±0」で灰色。数のない表示は色だけ変える。色分けの文化の設定 → [MECH_WORLD_BUILDING_DESIGN.md §1.1](MECH_WORLD_BUILDING_DESIGN.md)
- **資源の色**（神宮 10/17）: 弾薬＝赤 `#f85149`、電力＝黄色 `#d4a72c`、装甲（防御）＝青 `#58a6ff`。SORT と探索の地図で同じ色。盤面の警告は白の点滅、ヒントは白の点線、3 連鎖以上の輪郭は紫。探索の拾得表示の文字は薄い赤／薄い黄色／灰色 → [SORT_V2_RULES.md §4.3.1](SORT_V2_RULES.md)
- **陣営の色の標準**（神宮 10/17）: 青＝指揮下・緑＝友軍・黄＝中立・赤＝敵対 → [EXPLORE_FACING_AIM_V0.md §9](EXPLORE_FACING_AIM_V0.md)
- **向き・射撃AI・残骸盾・貫通弾**: 設計承認済み、実装は神宮の Go 待ち → [EXPLORE_FACING_AIM_V0.md](EXPLORE_FACING_AIM_V0.md)
- **敵の実装：完了**。状態表示 #283、敵PR1 #284、仕様記録 #286、敵PR2〜PR5 #287 はマージ済み。追加仕様は設計メモ§11.5。#285 は引き継ぎ元で、Issueが開いていても未実装を意味しない。
- **初クリアと回路の解放：完了**。#270（回路効果）、#272（初クリアの記録・未修復の真1×1「4」の発見・初クリア前の真盤率0%・Restoreの1×1対応）、#273（既定release・9能力の倍率・僚機の手動移動・「掲示板が開いた」）はマージ済み。#271 は閉じた。既存の段落の「次」「未決」は当時の記録であり、新しい着手指示に使わない。
- **今回の着手：回路購入**（ユーザー選択）。10000c、サイズは作成上限+1まで・天井20、ランダムな線入り中古盤。既存の初クリア判定・真盤率を使い、未修復の回路として倉庫へ追加する。draft PRで確認する。
- **その後の残作業候補**：Invadeの段位・部隊全体の装着上限、生存中の僚機を背負う／降ろす処理。活動量の消費・充電は従来どおり後回し。実装前に最新版の仕様と不足する操作詳細を確認する。
- **お金まわり（#266）**: ~~**採用済み・未着手**~~ → **機体の購入・作成・残骸復活・通常修理は実装（feat/money-mech-economy）**（2026-10-12 神宮）。新品購入 2000c、新規機体作成は装甲パーツ（最大耐久×3）＋500c、残骸復活は装甲パーツ（最大耐久×2）＋500c、通常修理は足りない耐久の分の装甲パーツだけ（クレジットなし）、弾薬・装甲パーツ・電力パーツ・ジャンクは売値 5c・買値 6c。充電・回路の購入・真盤・初回クリアの発見・段位・背負いは入れない。
実装の予定順（2026-10-07 神宮）。どの段階も、実装の前に遊び方と見た目の細部を神宮が決める:

1. ~~U14（装着中の回路の売却）~~ → **完了（#234）**: 確認に「装備: <機体ID> から外して売却します」、保有回路一覧に「装備: <機体ID>」、外して売る処理を明示。売値・perfectMaxSize・置き去り機の扱い・通知は従来どおり
2. C20（小隊方針の「対象外」表示）→ 変更（10/7・神宮）: 「未解放のコマンドは見せない」方針に変わり 2 本に分ける。**C20-a（未解放のコマンドを画面に出さない）は実装済み**。~~C20-b（一部の僚機だけ解放済みの小隊方針で、従えない僚機が「？」で反応する）が次~~ → **C20-b も実装済み（10/7）。C20 は完了**
3. 項目5（隊長機大破時の救助撤退）→ 10/7・神宮: 細部1 = A（項目5では背負わない。背負いは予定順 6 の背負い（項目4）で入れる）。3 本に分ける: **5-1（出撃中に撃破された機体を帰還で大破として反映。細部11 = A）は実装済み（10/7）**、次は 5-2（即失敗の廃止と救助撤退）、5-3（「戻る」の確認） → **10/7 23:18 神宮「進めて」**: 5-1b①（shared・残骸の記録、実装済み #242）→ 5-1b②（explore・残骸がマップに残り搭乗円で回収、実装済み #243）→ 5-1b③（invade・trade の表示、実装済み）→ **5-2（隊長機大破で即失敗にせず救助撤退）は実装済み（10/8）** → **5-2b（時間切れの強制救助・撤退は隊長大破後だけ、生きている時間切れのコンテナは倉庫へ）を実装（10/9）**。実装の正本は [`ITEM5_FORMAL_SPEC.md`](./ITEM5_FORMAL_SPEC.md)。**5-3（「戻る」の無効化と途中保存）は実装済み（10/10、#267）**。設計メモ §7.1 と食い違うときは正式仕様を優先する
4. お金まわり（小さい PR に分ける）: 僚機 ~~1000c~~ 2000c → 修理費 → ~~電力パーツでの充電 →~~ 回路の購入 → 初回クリアの発見（→ 変更（2026-10-07・神宮）: 僚機は 2000c。充電はバッテリーの消費と一緒に後回しなので、ここから外す）
5. 段位（項目3）
6. 背負い（項目4）

- ~~To-do：初クリアまで真盤0%（実装予定。お金まわりの購入 PR と一緒に）。~~ → **実装済み（#272、2026-10-12）**: 率は `resolvePerfectCircuitInjectRate` が `firstInvadeClear` を見て決める。Invade を初めてクリアして「4」の 1×1 の回路を発見するまで、作成・購入・探索で拾う回路・敵が落とす回路のすべてで真盤の確率を 0% にする（2026-10-07 21:49 神宮。設計メモ §2.1）。初クリアは `firstInvadeClear` に記録する。
- **完了**：装甲パーツは買値6c・売値5c、残骸復活は最大耐久×2個＋500c。最大耐久100なら1700c相当で新品2000cより安い（#266の採用仕様・機体経済の実装）。
- ~~To-do（お金の PR。10/7 神宮 S1〜S3、記録のみ）~~ → **S1〜S3 は初クリアの PR-A（#272）で実装（10/12 神宮の Go。お金の PR を待たない）。修理費は引き続きお金の PR**: S1 A 初めて Invade をクリアしたあとは、ジャンクからの回路作成にも 1% の真盤の確率（それまでは 0%）。`effectivePerfectInjectRate` と初クリアのキーと一緒に入れる。S2 A 初クリアのキーが無いセーブは未クリア扱い（盤から推測しない）。S3 A Restore が 1×1 の回路に対応し、初めての Invade クリアで「4」の 1×1 の回路を発見する。修理費もお金の PR で入れる
- **完了（#270・#273）**：隊長に修復済みの「4」を装備すると僚機への移動指示が開く。既定release・9能力の倍率も実装済み。空の旧対応表だけで未実装と判定しない（`circuitPlay.ts`・`releaseAbility.ts`）。

次にやること（回路データモデルの残り。順番は設計書 §8 の A → B・C・D・E → F → G。担当・着手順の確定はオーケストレーター）:

- **F — 完了（2026-10-04）**: 背負えなかった大破機の回路の落とし物は実装済み（#228。Invade の出撃マスを帰還の `frontSeed`・`dropCell` に入れ、`fieldDrops` を作る。通らない出撃は失う＝U7。結果画面に出す。機体は `destroyed` で残す。置き去りの僚機の回路は落とさない）。Explore での落とし物の出現と回収（出撃マスの絞り込み、降下地点付近への出現、離昇時の搭乗円での回収、`recoveredDropIds` で倉庫 `equippedTo: null` へ戻す、重複所持の除外、結果画面表示）も実装完了（#231）。Invade の盤の印（G）も完了（#230）
- **置き去りの機体（`lostMechs`）の World での発見・回収**: 決定済み（2026-10-03 神宮。下の「設計との差」）。**shared 部分は実装済み（回収の 1 本目の PR）**: `lostMechs` の任意項目 `frontSeed`・`cell`・`lostAt`・`lostSortieId`・`catalogId`・`durability`・`durabilityMax`・`status`、帰還の `recoveredLostMechInstanceIds` と `recoverLostMechs`（`fleet` に戻す。`instanceId`・携行弾・バッテリーを保ち、回路は付いたまま）、再度の置き去りは同じ項目を更新、回路の二重化を修正（`HUB_SAVE_CONTRACT.md` §12.5）。**Explore 部分も実装済み（回収の 2 本目の PR）**: Invade を通った出撃（セクター＋HubSave の `frontProgress.seed`）の置き去りは場所付きで `lostMechs` に残り、次に同じマスへ出撃すると降下地点の近くに止まって現れ、離昇時に搭乗円の内側にいれば回収（帰還の `recoveredLostMechInstanceIds`）。回収しなければ同じ行を更新。Invade を通らない出撃の置き去りは帰還の `abandonedMechInstanceIds` で機体と回路を失う（#206 の残り）。Invade からの出撃は HubSave の出撃機の選択で部隊を組む（`HUB_SAVE_CONTRACT.md` §12.6 末尾）。**Invade 部分も実装済み（回収の 3 本目の PR。2026-10-03 神宮の決定どおり）**: 置き去り機のいるマス（今の盤の `frontSeed` の行）に印（右上の灰色の点。凡例に「置き去り機」の見本）を付け、ツールチップに機体 ID（複数なら数も）を出す。印のあるマスを選ぶと出撃バーに「置き去り機 N 機：出撃して離陸すれば回収」。印は表示だけで、地雷・開閉の判定には関わらない。盤を作り直すと、置き去り機は新しい盤の同じ座標へ移る（`frontSeed` を書き換え、範囲外は範囲内へ）。回路の落とし物（`fieldDrops`）と一般インベントリの落とし物（`inventoryFieldDrops`）も同じルールで移す。場所のない古い行は Invade を開いたときに今の盤の開始地点（HQ 0,0）へ置いて HubSave に書き戻す。**格納庫の置き去り数と回路ボーナス（回収の後続 PR）**: trade の出撃パネルの「配備予定」の下に「置き去り N 機（Invade の盤に表示）」（0 機なら出さない。数だけ）。回路ボーナス（`hubCircuitBonuses`：修理割引・作成倍率・耐久バッファ）は置き去り機の回路を除いて計算する（`hubVisibleCircuits` から集計。Invade からの出撃の `invadeSquadSearch` も同じ）。回収すると、また数える。パーフェクト最大サイズの記録は今のまま（置き去り機の回路も数える。神宮の決定）。**置き去りの機体の回路の HUB での扱い（2026-10-03 神宮。この PR で実装）**: HubSave には残すが、HUB では所有から離れている扱い。trade の「保有回路」一覧・「回路装備」の選択肢と装備数・出撃パネルの回路の枚数に出さず、売却・付け替え・取り外しは処理の側でも断る（shared `hubVisibleCircuits`、trade `lost-mech-circuits.ts`）。回収すると、その機体に付いたまま一覧に戻る。回路のボーナスは後続 PR で置き去り機の回路を外した（上）。パーフェクト最大サイズの記録は従来どおり全回路から計算する（神宮の決定）
- **機体数上限3の撤廃と出撃機の選択**（項目15）— **実装済み（2026-10-03、項目15 の PR）**: 下の「設計との差」の項目15 を参照。#213（`31a3c70`）。Invade からの出撃も部隊を連れて出る部分は回収の 2 本目の PR（#218）で実装済み（下の「設計との差」）。「最大 3」の記述は回収の 1 本目の PR で `MECH_FLEET.md`・`CIRCUIT_DATA_MODEL_V0.md`・`CIRCUIT_SQUAD_DESIGN_V0.md` を更新済み
- **G — 完了（2026-10-04、#230）**: Invade の盤で落とし物のあるマスに印を出す（置き去り機の印は回収の 3 本目の PR #221 で入った）。盤を作り直したときは落とし物も新しい盤へ移す（U8。#221 で実装済み）
- **C の残り**: ~~装着中の回路の売却（U14）~~ → **完了（#234）**: 自動で外して売る・確認あり（確認に「装備: <機体ID> から外して売却します」）。保有回路一覧にも「装備: <機体ID>」を出す。売値は倉庫と同じ。perfectMaxSize は下がらない。置き去り機の回路は従来どおり一覧に出さず売れない。Restore は装着したまま可（既存）。~~`circuitBonuses` を装着中の回路だけで集計（U5）~~ → **U5 は 2026-10-05 神宮の判断で変更**: 回路ボーナスは装着中の回路に限定しない。将来のチャーム型回路（所持しているだけで効く）に備え、回路の種類ごとに効き方（装着・所持など）を決められる前提とする。今の実装は置き去り機の回路を除く所持回路を集計する（置き去り機の回路はボーナスに数えない＝7a は維持。パーフェクト最大サイズの記録には数える＝7b）。今の `hubCircuitBonuses` のままでよい（装着中だけで集計する #229 は不採用でクローズ）
- **E の残り**: ~~小隊方針の「対象外」表示（C20。仕様決定済み・実装待ち。実装の予定順 2）~~ → 変更（10/7・神宮）: 方針「未解放のコマンドは見せない。主人公はどんな回路があるか知らず、何ができるようになるかも知らない（10/7 8:07 神宮）」。**C20-a 実装済み**: ロック中のボタン（隊長の 5 つ・小隊方針・僚機カードの方針と召還）は出さずに詰め、空の小隊方針バーは 2 か所とも消す。カードは僚機ごとに判定。ロック中のキー（C/U/G/P/1–4）は何もせずログも出さない。ショートカット表とヘルプは解放済みだけ。カードの「🔒 回路なし：自衛のみ」は削除（バッジとマップのラベルは残す）。結果画面は「搭乗円の外・自衛のみ」。DEBUG の帯と全解放の既定はそのまま。~~**残り C20-b**: 従えない僚機の「？」と 50/50 の止まる／無視（ログなし、待機中のラベルは「僚機A·待機」。設計メモ §9.2 C20）~~ → 変更（10/7・神宮）: **C20-b 実装済み**: 一部の僚機だけ解放済みの小隊方針で、生きていて従えない僚機は「？」（名前の上・1.5 秒）を出し、命令ごとに 50/50 で止まる（その場で待機・射程内だけ撃つ）か無視。ログなし（「対象外」ログは捨てた）。待機中のマップのラベルは「僚機A·待機」。待機は次の命令・帰還要請・散開捜索で解け、従えない命令がまた来ても解けない。移動できない僚機も抽選する。個別命令と召還は API の安全網として同じ反応（設計メモ §9.2 C20）。**E は完了**
- **U9（反映経路）— 実装済み（2026-10-03、U9 の PR）**: Explore が結果画面を最初に描くときに HubSave へ直接書く。どの結果ボタンでも置き去り・大破・摩耗・携行弾・バッテリーが 1 回だけ記録される。trade は保存済みの帰還 URL を再適用せず「反映済み」と出す。再出撃は HubSave から組み直す（項目15 以降は格納庫で保存した出撃機の選択 `sortieSelection` を shared `resolveSortieSelection` で読む。置き去り・出撃不能は除く。保存した携行弾・耐久）。Invade を通らない出撃の置き去りを失う扱い（#206 の残り）は回収の実装で入れる
- **文書**: 2026-10-01〜03 に増えた保存・受け渡しの項目は `docs/HUB_SAVE_CONTRACT.md` §12.5〜12.7・`CIRCUIT_DATA_MODEL_V0.md` §5.5 に記録した（計画の 3）。`docs/IMPLEMENTATION_PLAN.md` は 2026-09-26 のまま

設計との差:

- **反映経路（U9）— 決定済み（2026-10-03 神宮）・実装済み**: 設計書（§5.4・§9 U9）どおり Explore が出撃終了時に HubSave へ直接書く形にした（U9 の PR）。帰還 URL は互換のため残り、trade は `sortieId` で 1 回だけ反映する
- **置き去りの僚機の回路（設計書 §5.1・項目6）— 決定済み（2026-10-03 19:47 神宮。同日先に「設計どおり落とし物にする」と確認していたのを撤回）・~~実装は未着手~~ → 実装済み（回収の 1〜3 本目 #215・#218・#221）**: 置き去りの僚機の回路は落とし物（`fieldDrops`）にしない。回路は失われた機体（`lostMechs` の項目）に付いたままで、`circuitIds` も変えない。失われた機体が戻るのは、プレイヤーが World で見つけて回収したときだけ（回収の処理は Explore が持ち、今ある帰還の反映に乗せる）。自動で部隊に戻ることはない。回収したら `instanceId`・`currentAmmo`・`battery`・`circuitIds` をそのまま保ち、`lostMechs` から外す。再び現れて回収されなかった場合は、同じ `lostMechs` の項目を最新の状態で更新する。残骸化・敵化の条件は未定（バッテリーの活動量 0 はその条件ではない）。回収した機体は通常の部隊として出撃し、`lostMechs` の機体が直接出撃することはない。World での発見・回収の処理は未実装。設計書 §5.1・§5.3 の「置き去りの僚機も回路はその場に落ちる」はこの決定で置き換わる。今の #206 は置き去りの機体を `fleet` から外して `lostMechs`（残弾・バッテリー・回路 ID）に記録し、落とし物は作らない（ここは決定と合っている）
  - ~~**既知の食い違い**~~ → **回収の 1 本目の PR で修正**（置き去りの機体の回路は `equippedTo` がその機体のまま残る。既存セーブで倉庫に戻っていた回路は今ある場所に残し、`circuitIds` から外す）。以下は経緯: 今の保存の正規化（shared `hub-save.ts` の `enforceEquipIntegrity`：`equippedTo` が `fleet` にない機体を指す回路は倉庫へ）は、置き去りの機体に付いていた回路を倉庫（`equippedTo: null`）に戻す。`lostMechs[].circuitIds` にはその ID が残るので、同じ回路が「倉庫にあって他の機体に装着できる」状態と「失われた機体に付いたまま」の両方に見え、上の決定と食い違う（2026-10-03 に shared の `applySortieReport` を手元で直接呼んで確認: 僚機に装着した回路が反映後 `equippedTo: null` になり、`lostMechs[].circuitIds` には残る。実機は未確認）。コードはまだ直していない（下の「既知の問題」）
  - 同時に決定: 再び現れた機体をまた置き去りにしたら、Invade の盤にもう一度置き去りとして記録する。機体数上限3は撤廃（項目15。実装済み）
  - 同時に決定（2026-10-03 20:00 神宮）: 回収は離昇時に帰還要請の搭乗円の中にいる置き去りの機体に対して行う（僚機の搭乗円と同じ考え方。「N 秒範囲内にいたら」ではない）。Invade を通らない出撃では置き去りの機体は再び現れず、機体と回路はその場で失う（`lostMechs` にも残さない）。上の回路の二重化は回収の実装と一緒に直す（先に別 PR では直さない）。回収の実装は U9 の後。この件の未決はない。決定の全体は [`CIRCUIT_DATA_MODEL_V0.md`](./CIRCUIT_DATA_MODEL_V0.md) §5.6
  - ~~**既知の食い違い（Invade を通らない出撃）**: #206 は出撃マスの有無にかかわらず置き去りの機体を `lostMechs` に残す~~ → **解消（回収の 2 本目の PR）**: Invade を通らない出撃の置き去りは機体も回路も失い、`lostMechs` に残さない（帰還の `abandonedMechInstanceIds`）。この PR より前に記録された場所のない行は、回収の 3 本目の PR 以降、Invade を開いたときに今の盤の開始地点へ置かれ、再出現・回収できる
  - 置き去りの追加決定（2026-10-03 神宮・参謀）: Invade の盤を作り直したときは、置き去りの機体と落とし物の回路を新しい盤のどこかへ移して残す。`lostMechs` の項目に、置き去りにした場所 `{ frontSeed, cell }`・`lostAt`・`lostSortieId` と、部隊へ戻すための写し（`catalogId`・`durability`・`durabilityMax`・`status`）を足す。Invade は `frontSeed` で絞って `lostMechs` を盤に出す。別の構造は作らない。`lostMechs` の機体は、出撃の上限（3 機）にも回路の上限にも数えない。「再び現れた残骸」という状態は当面作らない。
- **部隊と出撃（項目15）— 決定済み（2026-10-03 神宮・参謀）・実装済み（項目15 の PR。Invade からの出撃で部隊を連れて出る部分は回収の 2 本目の PR で実装: Invade のリンクに出撃機のキーがないとき、Explore が HubSave の選択から trade の出撃リンクと同じ形で組む）**: 実装: `HUB_LIMITS.maxMechs` と読み込み時の切り詰めを削除し `HUB_LIMITS.maxSortieMechs = 3` を追加。選択は HubSave の `sortieSelection`（任意）にひとつだけ保存し、trade の格納庫・出撃 URL と Explore の再出撃がどれも shared `resolveSortieSelection` で読む（選んだ機体のうち出撃できる機体を `fleet` の順に最大 3 機。前回の選択がない・どれも出撃できないときは先頭から出撃できる 3 機）。4 機目のチェックボックスは押せない。最後の 1 機は外せない。「先頭から3機」ボタン。出撃リンクを押すと出撃した機体を選択として保存。一覧はスクロール。デモの「機体を受領」は従来どおり 3 機未満のときだけ。決定の内容: 出撃は最大 3 機（隊長＋僚機 2）。摩耗を受けるのは格納庫で選んだ出撃機だけ。機体数の上限は撤廃する（`HUB_LIMITS.maxMechs` と、読み込み時に `fleet` を切り詰める処理を消す）。格納庫はスクロールできる一覧にし、出撃機をチェックボックスで最大 3 機選ぶ。既定は前回の選択。出撃 URL には選んだ機体だけを載せる。Invade からの出撃も部隊を連れて出る。Explore は HubSave を直接読む（U9 と同じ考え方）。出撃時の電力パーツの消費は別タスク（STATUS 項目11。→ 2026-10-07: 出撃コストは「なし」）。機体の入手方法と価格は経済タスクで決め（→ 2026-10-07: 僚機の購入は 1000c。未実装）、それまでデモの「機体を受領」は残す。

2026-10-01〜03 に main へ入った保存・受け渡しの追加（設計書 A〜G の外。契約文書への追記は次の文書のみの PR で行う）:

- #199: 帰還 URL に `sortieId`（`appliedSortieIds` で 1 回だけ反映）、`wreckedMechInstanceIds`（大破機を `destroyed` で残す）、一般インベントリの落とし物 `inventoryFieldDrops`（回路の `fieldDrops` とは別。今の Explore は出していない）
- #201・#203: 機体ごとの残弾 `OwnedMech.currentAmmo`（instanceId 単位、基本容量 28）。Explore の射撃は撃った機体の残弾だけを減らす。HUB の `ammoLoad` は共有在庫のまま
- #204: 機体ごとのバッテリー（Activity／Capacity、旧データは 300／300）。Explore の実行時の処理は変えていない
- #206: 置き去りの機体の状態 `lostMechs`（残弾・バッテリー・回路 ID）を HubSave に保存
- 将来実装へ回した項目は [`FUTURE_IMPLEMENTATION.md`](./FUTURE_IMPLEMENTATION.md)（#198）。世界観の追記は `PRODUCT_VISION.md`（#205）

後片付け:

- ~~壊れた `.github/workflows/gemini-playtest.yml` の扱いを決める~~ → 2026-09-28 に削除済み（#144）。Gemini の Actions 自動化は保留

バックログ:

- フルスクリーン PWA の殻と場面遷移の統一
- 回路で Explore コマンドを解放する仕組み: **基盤は実装済み**（[`EXPLORE_COMMAND_UNLOCK_V0.md`](./EXPLORE_COMMAND_UNLOCK_V0.md)。プレビューは全解放が既定＋DEBUG トグル）。次: 回路→コマンド対応表・~~レア度~~（Phase 3。レア度とチャーム型回路は 2026-10-07 に後回しと決定）。回路なしのベースライン（2026-10-07 神宮）と今の実装との比較は [`EXPLORE_COMMAND_UNLOCK_V0.md`](./EXPLORE_COMMAND_UNLOCK_V0.md) §1.1（差は項目16）。装備回路を trade→explore へ渡す `mechCircuits` は実装済み（D: #168・#197）、Explore の判定は機体ごと（E: #195）。僚機の移動 `wing_mobility` はゲート実装済み（release・回路なしは静止＋自衛射撃。#195 以降はその僚機の回路で判定）。離昇時に置き去りになった僚機は結果画面に 1 行表示（~~回路なし~~ 自衛のみ／搭乗円の外を区別。→ 変更（10/7・神宮）: 「搭乗円の外・自衛のみ」）。未解放のコマンドは画面に出さない（C20-a、10/7）。#206 で置き去りの機体は `fleet` から外れ、状態が HubSave の `lostMechs` に残るようになった（再会時の扱い・回収作戦は `FUTURE_IMPLEMENTATION.md` で対象外）
- Restore のスワイプで線を引く操作は **見送り（後回し）**（2026-09-28）。スマホで 15×15〜20×20 を遊ぶための拡大・移動・当たり判定の改善は #159 で対応済み（項目12。ピンチの独自処理・ルーペは対象外）。大きい盤の右端に余白を足した（#169）
- 価格バランスの調整は、機体の追加購入や回路などの目標アイテムを追加した後に行う（敵ドロップ・戦場で拾う回路の頻度とサイズも、テストプレイ後にここで一緒に調整する。設計メモ §8.1）。ただしジャンクからの回路作成コスト（N×N＝ジャンク 2N 個＋round(4×1.5^N) クレジット。2026-09-28 に 2^N から改定）と回路の売値（25c＋評価値×3c。2026-09-28 に最低額を 30c→25c に変更・実装済み）は **決定済み**（設計メモ §2.2）なので、ここでの調整対象から外す。作成コストの実装は下の項目14
- trade に残る旧 typed-repair（`packages/trade/src/legacy-typed-repair.ts`）とレア売却 UI は、後の価格・経済タスクで移行か削除かをまとめて決める（それまでコードは触らない）

回路データモデルの実装 A〜G（[`CIRCUIT_DATA_MODEL_V0.md`](./CIRCUIT_DATA_MODEL_V0.md) §8。2026-10-03 に main のマージ済み PR から判定。C・E・F・G は 2026-10-07 に更新）:

| # | 内容 | 状態 | PR |
|---|---|---|---|
| A | shared の保存契約 v3・`mechCircuits` | 完了 | #153 |
| B | trade のジャンク作成サイズとコスト | 完了 | #158（＋#155 のコスト関数） |
| C | 倉庫と付け替え（HUB のみ・無料） | 一部完了: 装着／取り外し UI（#160。#192 で trade の画面に読み込み）、旧セーブ・壊れたセーブの案内（#164）。U14 完了（確認・一覧の「装備」表示）。残りなし（U5 は方針変更済み）| #160・#164・#192・#234 |
| D | 出撃 URL に装着回路 | 完了: shared の受け渡し境界（#168）、`buildDeployUrl` に `mechCircuits`（#197） | #168・#197 |
| E | explore の機体ごと判定 | 完了（FA・Bypass だけ有効、隊長は隊長機・僚機はその僚機の回路、小隊方針は解放済みの僚機にだけ適用）。~~小隊方針の「対象外」表示（C20）は仕様決定済み・実装待ち~~ → 変更（10/7・神宮）: 「対象外」は表示しない。未解放のコマンドを出さない C20-a は実装済み、「？」の反応は C20-b（→ 実装済み（10/7）） | #195 |
| F | 落とし物の記録と回収 | 完了: 帰還の 1 回反映・大破機の保持（#199）、置き去りの機体と回収（#206・#215・#218・#221）、shared の落とし物契約（#196）、U9 の直接保存。背負えなかった大破機の回路は出撃マスの `fieldDrops`（通らない出撃は失う。機体は `destroyed` で残す。置き去りの僚機の回路は落とさない。#228）。Explore での出現と回収（#231） | #196・#199・#206・#215・#218・#221・#228・#231 |
| G | 前線の落とし物表示（invade） | 完了: 落とし物のあるマスに印（#230）。盤の作り直しで落とし物も移す（U8、#221） | #221・#230 |

回路・部隊設計 v0 由来の仕様変更（[`CIRCUIT_SQUAD_DESIGN_V0.md`](./CIRCUIT_SQUAD_DESIGN_V0.md)。各項目は別タスク。項目1・2・6・14 の実装は上の表 A〜G）:

1. 回路のデータモデル：機体ごとの枠、コモンの枠拡張、部隊の総数上限。`maxCircuits=8` と自動削除の廃止、装着制への移行（~~所持だけで効くボーナスをやめる~~ → 2026-10-05 変更: 回路ボーナスは装着中に限定せず、回路の種類ごとに効き方を決める）、上限判定は装着中の数のみ。判定は機体ごと（隊長のコマンドは隊長機、僚機の方針はその僚機。小隊方針は解放済みの僚機にだけ適用し、~~未解放は「対象外」と表示~~ → 変更（10/7・神宮）: 未解放のコマンドは見せない（C20-a））。どの回路も Restore を通すまで効果なし。 → 設計: [`CIRCUIT_DATA_MODEL_V0.md`](./CIRCUIT_DATA_MODEL_V0.md)（**承認済み 2026-09-28**）。**進み具合（2026-10-03）: A 完了、C 一部（装着 UI・移行の案内。U14 は売却の確認の「装着中」表示だけ残り。U5 は 2026-10-05 の方針変更で今の集計を維持）、E 完了（~~C20 表示は仕様決定済み・実装待ち~~ → C20-a・C20-b とも実装済み）。** 部隊の総数上限は U3 のとおりまだ判定しない
2. モジュール間の受け渡し形式の変更（契約変更）：装備回路を Explore へ渡す／落とし物の記録を Invade から Explore へ渡す。まとめて設計する。 → 設計: [`CIRCUIT_DATA_MODEL_V0.md`](./CIRCUIT_DATA_MODEL_V0.md)（**承認済み 2026-09-28**）。**進み具合（2026-10-03）: A 完了、D 完了（装備回路を Explore へ渡す）、E 完了、~~F 一部（帰還の報告と反映。落とし物の作成・回収は未実装）、G 未着手~~ → 2026-10-07 更新: F 完了（#228・#231）、G 完了（#230）。** 落とし物は設計どおり URL キーを足さず HubSave の `fieldDrops` を読む方針（U19）
3. Invade の段位：~~クリアで段と上限が上がる、盤面途中の撤退で一段下がる~~ → 変更（2026-10-07・神宮）: クリアで段が 1 つ解放され、次に挑む段は解放済みの全段の一覧から選ぶ。盤面途中で撤退するときは、どこまで下がるかを一覧から選ぶ。部隊の回路装着上限は最高到達段を新しくクリアしたときだけ +1（天井なし。下の段のクリアし直しでは増えない。部隊全体の数で、機体ごとの枠ではない）。段に応じた Explore の難易度: 敵の攻撃力と HP に 1.01^(挑戦中の段)（段 0 は ×1。×2.3 ≒ バフなしの味方と TTK／TTD 1:1 が段 84 前後）。報酬は段で増やさない。仕様決定済み・未実装（実装の予定順 5。設計メモ §3）。
4. Explore の背負い：積載2、速度低下、回路の合算、大破していない機体の背負いと降機。**追加決定（2026-10-06〜07 神宮）**: 大破機を背負えるのは回収コマンドを解放した機体だけ。積載はコンテナ 1・大破機 2・大破していない僚機 2。速度は積載の合計で決まり、積載 0／1／2／3／4／5／6 で 120／75／60／45／30／15／0。積載上限（インベントリの枠）は回路で増やせ、上限の範囲なら何機でも背負える。背負われた機体は 1 個として数える。何かを背負っている僚機はそのままでは背負えず、その積荷を新しく背負う側へ移せる。上限を超えた分はそのマスの落とし物になる（消えない）。**2026-10-07 7:36 神宮の回答**: 隊長はいつでも背負える。僚機は ~~`wing_recover` を解放したときだけ~~ `wing_mobility` と `wing_recover` の両方を解放したときだけ（→ 変更（10/7・神宮））。積載 0 は表どおり 120（僚機も。今の `wingmanSpeed` は 115）。標準の積載上限は今の 2 のまま（**暫定**: Grok Bot が推奨から補ったもので、神宮が明示したものではない）。仕様決定済み・未実装（実装の予定順 6。設計メモ §6）。
5. Explore の隊長機大破：即失敗の廃止、撤退ボタン、背負われたときの手動操作、救助費用（所持金の半分）。撤退ボタンの転用（隊長大破時のみ有効）、戻る操作の確認（戦線復帰／撤退。「撤退」は隊長が無事でも救助撤退。Invade の強制戦闘ロック中も同じ確認で、全機大破扱いは廃止）。**仕様決定済み・実装待ち（2026-10-07。実装の予定順 3）**。 **10/7・神宮:** 残骸の定義 「HP がなくなるか、活動量がなくなると残骸になる。フィールド上で復活する方法はない。回収できれば連れ帰れて、新品の購入や作成より少し安く復活できる」（活動量がなくなる方はバッテリーの消費と一緒に後回しで、記録のみ）。細部1 = A（項目5では背負わない。背負いは項目4）。**5-1 は実装済み（10/7。細部11 = A）**: 出撃中に撃破された機体は、どの終わり方でも HUB で `destroyed`。一律摩耗は生き残った機体だけ（値は従来どおり）。回路は今の大破機の扱い。隊長撃破の即失敗は 5-2 まで今どおり（隊長機も `destroyed` で戻る）。
6. 落とし物の永続化と回収。背負われなかった大破機は機体喪失、回路はその場に落ちる。置き去りの僚機は 2026-10-03 の決定で別扱い（回路は落とさず失われた機体に付いたまま。World で見つけて回収したときだけ戻る。上の「設計との差」）。回収した自分の回路は元の状態のまま戻す（中古扱いにしない）。 → 実装 F・G（設計: [`CIRCUIT_DATA_MODEL_V0.md`](./CIRCUIT_DATA_MODEL_V0.md) §5）。~~**進み具合（2026-10-03）: F 一部、G 未着手。** 置き去りの僚機は #206 で `fleet` から外し `lostMechs` に記録（回路 ID も記録）。World での発見・回収は未実装。今の正規化で回路が倉庫に戻るのは決定との既知の食い違い（上の「設計との差」）~~ → **2026-10-07 更新: F・G 完了**（#228・#230・#231）。置き去りの機体の World での発見・回収は #215・#218・#221 で実装済み、回路の二重化も #215 で解消
7. HUB：付け替え（HUB のみ・無料）、回路購入、~~初回クリア報酬のお金~~ → 変更（2026-10-07・神宮）: 初回クリアのお金の報酬はなし。**追加決定（2026-10-07 神宮）**: 回路の購入は 10000c（サイズは「作成できるサイズ＋1」まで・天井 20×20 のランダム、真盤率は作成と同じ 1%、白回路ではなくランダムなエッジ入り）。僚機は ~~1000c~~ → 変更（2026-10-07・神宮）: 2000c（2026-10-07 7:36）。初回の Invade クリアでは、例外として Restore 前の白回路を 1 枚「発見」する（1×1、数字 4 が 1 つ）。1×1 はこの 1 枚だけで、Restore はそれ以外 2×2〜20×20。~~初回クリアのお金の報酬との関係は未確認（神宮の確認待ち）。~~ → 2026-10-07 7:36 神宮の回答: お金の報酬はなし。未実装（実装の予定順 4）。
8. 開始状態：僚機0、上限0、1機目の機体は無料。
9. ~~バランス検証：素の機体が敵に順番に何体勝てるか、2体同時ではどうなるかをシミュレーションで数値化する。~~ → **閉じた（2026-09-28）**。神宮の判断で、現行の TTK 10秒／TTD 20秒で狙いどおりとする前提で進める。シミュレーションは不要。
10. 修理コスト：背負って持ち帰った大破機の修理（~~装甲パーツ・電力パーツ＋クレジット~~ → 変更（2026-10-07・神宮）: 装甲パーツ（最大耐久×2）＋500c、新品購入より安く）。2026-10-07 7:36 の回答でもこのまま。未実装（実装の予定順 4）。
11. 出撃コスト：~~出撃時に機体ごとに電力パーツを消費（現状は出撃時に消費するものなし）。~~ → 変更（2026-10-07・神宮）: **なし**（ソフトロック防止。今の実装と一致）。電力パーツは HUB でバッテリーの充電に使う（活動量と 1:1）。充電は未実装（~~実装の予定順 4~~ → 変更（2026-10-07・神宮）: バッテリーの消費（減り）と一緒に後回し。バッテリーの消費を実装するときに入れる）。
12. **完了（2026-09-28）**: 盤の生成と解の判定（評価値・パーフェクト判定・成果状態）を 2×2〜8×8 の N×N で selftest 保証。パーフェクト注入は要求サイズで真盤を作る（`shared/src/perfect-circuit-sized.ts`、2×2 は従来の `verify-true-2`）。「Bypass を確定する」の案内に効果値を出し、閉ループがないときは「効果0になります」と表示（ボタンは押せるまま）。新しく作る盤の既定は 6×6 のまま（項目14まで）、HUB から渡された盤はそのサイズで開く。**追加（パーフェクト盤の数字隠し・神宮の決定）:** 注入するパーフェクト盤は、ループが外周4辺に接し、解が1つに決まる範囲で数字を隠す（目標 min(50%, 10%＋5%×N)。2026-09-28 に上限を 60%→50% に改定）。新しい puzzleId は `perfect-true-v2-…`、以前の `perfect-true-…` と `verify-true-2` はそのまま（設計メモ §2.1）。**追加（最大 20×20・神宮の決定、2026-09-28）:** Restore の盤は **2×2〜20×20**（`shared` `RESTORE_MAX_SIDE = 20`）。20 を超える要求は不完全盤・パーフェクト盤とも 20 に丸める（2×2 に置き換えない。以前はパーフェクト注入の上限が 16 で、17〜20 は 2×2 になっていた）。保存・URL の読み込みは古いセーブを落とさないよう 64 まで受け付け、Restore で開くときに 20×20 に丸める（そのときの線は捨てる）。生成の高速化: 数字隠しの上限 50%、ソルバーの閉ループ判定を差分化（探索は同じで約2倍速）、隠す作業の歩数上限（1回 5,000・盤全体 150,000 ノード。時間ではなく歩数なので puzzleId から同じ盤）。20×20 の生成は中央値 約 0.1 秒（手元）。15×15 以上のパーフェクト盤は開く前に「生成中…」を出す。2×2〜20×20 の生成・一意性・外周4辺・再生成・trade 採点一致・20 超えの丸めを selftest で保証。**追加（スマホ対応・2026-09-28、#159）:** 盤のタップは最寄りの辺を選ぶ（点の近く・セル中央は無反応）、11×11 以上か画面幅に収まらない盤は盤を上に置いて詳細を折りたたむ、盤は専用のスクロール枠で「全体 / 1× / 1.5×」（既定 1× ＝ 点の間隔 37.6 px）。辺ボタンはキーボード用に残す。詳細は `RESTORE_V0.md` §5.6.2。**追加（2026-09-28〜29）:** 新しく作る不完全盤の生成を閉ループ基盤（v3）に変更（#161。PR 本文では既存の puzzleId は従来の経路で読むとしている。U17 の互換テスト（`shared` `hub-save-v3.selftest.ts`。不完全盤 2〜8 辺と verify-true の手がかり・評価値を固定）は #161 以降も変更されておらず、2026-10-03 の main で通る）、Restore の selftest を v3 に合わせた（#189）、大きい盤の右端に余白（#169）。以下は元の記述: ~~Restore の盤面サイズ可変化（現状、新しく生成する盤は 6×6 固定: `restore/src/session.ts` `DEFAULT_COLS/ROWS = 6`）。2×2 など小さい盤面で生成と解の判定が成り立つかの確認も含む。パーフェクト盤の注入も要求サイズで作れるようにする（現状は 2×2 しか出ない）。Bypass を確定する前に評価値（効果値）が分かる表示を入れる（ループなしの Bypass は評価値 0 で効果なし、と確定前に分かるように）。具体的には「Bypass を確定する」の案内に評価値を出し、ループがないときは「効果0になる」と明示する。ボタンは押せるままでよい。現状は盤下のプレビューにはあるが、案内には出ず「効果を残せます」と書かれている（設計メモ §9.2 C21）。~~
13. 中古回路（購入・敵ドロップ・戦場で拾う）の初期マーク生成。購入した回路もランダムなエッジ入り（2026-10-07 神宮。項目7）。
14. パーフェクト最大サイズの記録（Fully Awakened のときだけ更新）と、ジャンク作成サイズ（2×2〜「最大＋1」から選択、最初は 2×2 のみ。**正方形（N×N）だけ**。**天井は 20×20**＝作成サイズは 2×2〜min(最大＋1, 20)。2026-09-28 神宮の決定。`shared` の `craftMaxSize` は既定で 20 に丸める。trade の作成画面への反映は実装 B）。作成コストは **N×N でジャンク 2N 個＋round(4×1.5^N) クレジット**（2×2＝4個＋9c、4×4＝8個＋20c、6×6＝12個＋46c、8×8＝16個＋103c、10×10＝20個＋231c、20×20＝40個＋13,301c。2026-09-28 に 2^N から改定・決定済み・設計メモ §2.2）。クレジットは shared の `circuitCraftCreditCost(N)` から出し、パーフェクトの完璧ボーナスはその 2 倍（同じ関数）。現行のジャンク作成（#133 `junk-circuit-craft-ui.ts`：ジャンク4個・クレジット0で 4×4 固定）を 2×2 始まりとこのコストに合わせる。保存契約（`HUB_SAVE_CONTRACT`）に影響するので、項目1（回路データモデル）と一緒に設計する。 → 設計: [`CIRCUIT_DATA_MODEL_V0.md`](./CIRCUIT_DATA_MODEL_V0.md)（**承認済み 2026-09-28**・実装は A〜G の順。**A（shared の保存契約 v3・`mechCircuits`）完了**。**B（trade のジャンク作成: 2×2〜min(最大＋1, 20) のサイズ選択・コストは shared の関数・8 件の切り詰め廃止・restore 取込で最大サイズ更新＋既存パーフェクトからの補正）も完了（#158、2026-09-28）**。設計書 §8 で項目14 に当たる A・B はどちらも完了）
15. 機体数上限3の撤廃と出撃機の選択。**決定（2026-10-03 神宮・参謀）、実装済み（項目15 の PR。上の「設計との差」）**: 出撃は最大 3 機（隊長＋僚機 2）。摩耗を受けるのは格納庫で選んだ出撃機だけ。機体数の上限は撤廃する（`HUB_LIMITS.maxMechs` と、読み込み時に `fleet` を切り詰める処理を消す）。格納庫はスクロールできる一覧にし、出撃機をチェックボックスで最大 3 機選ぶ。既定は前回の選択。出撃 URL には選んだ機体だけを載せる。上限 3 を前提にしたテストも直す。出撃時の電力パーツの消費は別タスク（STATUS 項目11。→ 2026-10-07: 出撃コストは「なし」）。機体の入手方法と価格は経済タスクで決め（→ 2026-10-07: 僚機の購入は 1000c。未実装）、それまでデモの「機体を受領」は残す。
16. 回路なしのベースライン（2026-10-07 神宮）: 回路なしで隊長は移動・攻撃・回収・帰還、僚機は攻撃だけ（移動もしない）。それ以外はすべて回路で解放（帯同・哨戒・遊撃は高レベル）。背負いは隊長はいつでも、僚機は ~~`wing_recover` を解放したときだけ~~ `wing_mobility` と `wing_recover` の両方を解放したときだけ（→ 変更（10/7・神宮））。今後の解放の予定: 回避・接近・離脱、武器の種類を変える回路。**追加決定（10/7・神宮）**: (1) 移動できない僚機の離昇時は今のまま（搭乗円の内側なら回収）。(2) 攻撃だけの僚機はその場で射程内の敵だけ撃つ（今のまま）。(3) 帯同・哨戒・遊撃は `wing_mobility` が前提 → 変更（10/7 14:13・神宮）: 回収と召還も前提。僚機ごとに判定し、小隊単位は生きている僚機だけを数える（C20-a で実装）。僚機の背負いは `wing_mobility`＋`wing_recover`（背負いは未実装なので文書だけ）。(4) 公開プレビューは対応表ができるまで全解放のまま。(5) 隊長の「帰還」は帰還要請と撤退の両方で、撤退が回路なしなのは正しい。**追加決定（10/7 16:35・神宮）**: キャンプ（`camp_set`）が未解放のときは上端の「キャンプ 未設置」・ヘルプの「時間切れ後はキャンプ防衛フォーカス」・出撃前ヘルプのキャンプのキーを出さず、時間切れの帯は「時間切れ」だけ（全解放は今までどおり）。「？」は太字 16px（色 #9ecbff のまま）。移動できない僚機は待機中もラベル「僚機A·自衛のみ」のまま（実装どおり）。**方針（10/7 8:07・神宮）**: 「未解放のコマンドは見せない。主人公はどんな回路があるか知らず、何ができるようになるかも知らない（10/7 8:07 神宮）」（C20-a で実装。ロック中のコマンドは画面にもログにも出さない）。**表の設計でそろえる**: カバー（V）と散開捜索は回路でゲートしていない。本番の対応表は空。~~**今の実装との差は実装待ち**~~ **今の実装との差（残り）**（[`EXPLORE_COMMAND_UNLOCK_V0.md`](./EXPLORE_COMMAND_UNLOCK_V0.md) §1.1）: 本番の回路→コマンド対応表が空で、release では回路を付けても何も解放されない。大破機・僚機を背負う処理が無い（項目4）。回避・接近・離脱と武器の種類を変える回路はコマンドが無い。プレビューの既定は全解放で、ベースラインは DEBUG トグルでだけ見える（→ 決定（10/7・神宮）: 対応表ができるまでこのまま）。回路なしの僚機（release）の静止＋射程内だけの攻撃と、基本コマンドのロックの形は決定と一致

## QA・実機確認の記録

- **GeminiSpark QA（出典: #190 の `docs/IMPLEMENTATION_PLAN.md` 案。#190 は基準 main `823ae4d`（#189 マージ）・基準日 2026-09-30 として記載。QA を実施したコミットそのものかは #190 に明記なし）**: 基本動作の QA。60 項目中 55 PASS、残り 5 件は UI/UX の改善候補。S0 = 0、S1 = 0。モジュール間の連携 10/10 PASS、状態保持・リロード確認 PASS。同じ記載で、神宮の実機確認でも当時の実装は概ね意図どおりとされている
- **携行弾の修正のプレビュー確認（2026-10-03 20:05 JST ごろ、Cursor（Grok Bot）。ヘッドレス Chrome（playwright-core）で公開プレビューを操作）**: 新しいセーブ（trade の「シード読込」→ 出撃可能 2 機）から「探索へ」→ 出撃。出撃 URL に `mechCurrentAmmo` はない（未設定）。
  - #208 デプロイ後（`26c8896`）: 隊長の実弾表示 28 → 射撃で減る（40 秒で 18）。帰還要請（X）後の帰還 URL は `mechCurrentAmmo=seed_op_gen1:18;seed_op_gen2:12`（僚機も 28 から撃っている）。#208 の前（`d6ca6ff` のデプロイ）では実弾表示が「—」のまま減らなかった
  - #209 デプロイ後（`fb8234f`）: 帰還（隊長 19・僚機 20）→「格納庫へ」→ セーブの `fleet[].currentAmmo` が 19・20 → 次の出撃 URL に `mechCurrentAmmo=seed_op_gen1:19;seed_op_gen2:20`（`startingAmmo` なし）→ 同じ帰還 URL を開き直しても値は変わらない → 2 回目の出撃は 19 から始まり射撃で減る（帰還 9・5）
  - 確認できていないこと: 3 機出撃（シードの出撃可能機は 2 機）、バッテリーの書き戻し（今の Explore は帰還 URL に `mechBattery` を載せない）
- 5 件の改善候補の中身は #190 に書かれていない。#190 の方針では、UI/UX 改善はシステム実装がそろった後にまとめて再評価する（それまで実装しない）

## 既知の問題

- **To-do（2026-10-17）**
  - (a) `c.discovered`・circuitPlay の `lastSeen`・霧（`fogOpen`）が `squadIntel` と二重に持たれている。毎フレームの霧の更新も 2 回走っている。
  - (b) `carry.selftest` の「leaving cancels the pickup」がたまに落ちる（main でも再現）。
  - (c) 襲撃の構えの僚機が、見えていない敵へ向かう（`brain.ts` の `nearestAliveEnemy`）。当面このまま。
- ~~**Explore の「撤退」ボタンを押しても結果画面に切り替わらない（2026-10-03 プレビューで確認）**~~ → **解消（2026-10-03、撤退の修正 PR）**: 描画ループは「最後に描いた phase」と比べるようにし（`game/phaseWatch.ts`）、ボタンで変わった phase も帰還要請（X）と同じ経路で結果画面を描く。撤退できる条件・救助費用など撤退のルールは変えていない（項目5）。以下は経緯: `abortSortie` は `world.phase = "result"` にするが、描画ループ（`main.ts` `frame`）は「そのフレームの中で phase が変わったとき」だけ `renderDom` を呼ぶので、ボタン（フレームの外）で変わった phase は描画されず、画面は出撃中のまま止まる。#135 より前から同じ形（それまでも `needsDom = true` だけ）。帰還要請（X）で終われば結果画面は出る

- ~~**trade から出撃した機体が射撃しない可能性（2026-10-03 に手元で確認・実機は未確認）**~~ → **解消（2026-10-03、#208・#209。プレビューで確認）**。以下は経緯: #203（2026-10-02 23:07 JST マージ・デプロイ済み）以降、Explore の射撃は機体ごとの `currentAmmo` だけを使い、`undefined` なら撃たない（`sim.ts` `tryFire`）。一方 trade には `OwnedMech.currentAmmo` を設定する処理がなく（旧来の `startingAmmo`／`ammoLoad` からの割り当て規則は #201 で意図的に未定義）、出撃 URL に `mechCurrentAmmo` が載らない。trade の URL 生成→explore の起動を手元でつなぐと `currentAmmo` は空で、射程内の敵がいても隊長機の弾は出ない（`currentAmmo` に 28 を入れると撃つ）。帰還 URL の `mechCurrentAmmo` を HubSave に書き戻す処理も trade にない。割り当て規則は神宮の判断が要る。詳細は `HUB_SAVE_CONTRACT.md` §12.5・§12.7（契約文書の PR）
  - → **本ルールを決定・実装（2026-10-12 神宮、fix/circuit-ammo-activity-refill）**: 在庫は `inventory.ammo`、付け替えで戻して積み直し、帰還・出撃前に自動補充（`HUB_SAVE_CONTRACT.md` §12.5「携行弾の配り方」）。未設定は HubSave の正規化で満タンとして書く。以下は経緯。
  - **暫定ルール（2026-10-03 参謀の決定。神宮の経済タスクでの決定待ち）**: 出撃時に `currentAmmo` が未設定の機体は満タン（その機体の上限＝今は 28）として扱う。`mechCurrentAmmo` に値がある機体はその値を使う（0 なら撃てない）。旧来の共有弾薬（`ammoLoad`）を機体ごとにどう配るかの本ルールは、神宮が経済タスクで決める。それまではこの暫定ルール
  - 対応の順番（参謀の指示）: この STATUS の PR → explore の修正 PR（未設定は満タンで出撃）→ trade の修正 PR（帰還の `mechCurrentAmmo`・`mechBattery` を HubSave に書き戻し、次の出撃 URL に載せる）→ 契約文書の PR → U9 の実装 PR（Explore が直接 HubSave に書く。trade の書き戻しはこちらへ移す）
- ~~**置き去りの機体の回路が倉庫に戻る（決定との既知の食い違い。2026-10-03）**~~ → **解消（回収の 1 本目の PR）**。既存セーブで倉庫に戻っていた回路は倉庫（または付け直した機体）に残し、`lostMechs[].circuitIds` から外す（`HUB_SAVE_CONTRACT.md` §12.5）。以下は経緯: 今の保存の正規化（shared `hub-save.ts` の `enforceEquipIntegrity`：`equippedTo` が `fleet` にない機体を指す回路は倉庫へ）は、置き去りの機体に付いていた回路を倉庫（`equippedTo: null`）に戻す。`lostMechs[].circuitIds` にはその ID が残るので、同じ回路が「倉庫にあって他の機体に装着できる」状態と「失われた機体に付いたまま」の両方に見え、上の決定と食い違う（2026-10-03 に shared の `applySortieReport` を手元で直接呼んで確認: 僚機に装着した回路が反映後 `equippedTo: null` になり、`lostMechs[].circuitIds` には残る。実機は未確認）。コードはまだ直していない（回収の実装と一緒に直す。U9 の後）。決定は「回路は失われた機体に付いたまま」（上の「設計との差」）
- ~~explore selftest が約 1 割の確率で失敗する~~ → **解消済み（2026-09-28, テスト側のみ）**。原因は、ランダムなカバー配置（`coverObjects.ts`）でコンテナ上の隊長がカバー中心へ吸着され回収半径から外れること（失敗 25/25 件で吸着範囲内にカバーあり）。`selftest.ts` で `Math.random` を固定シード（mulberry32）に差し替え、コンテナ上・直進テスト経路の近くのカバーをテスト内で除去（`clearCoverNear`）。本番コード・カバー挙動は無変更。同原因の潜在 flake（cargo 速度テスト）も同時に対処
- ~~`.github/workflows/gemini-playtest.yml` の字下げ崩れで `main` への push のたびに失敗表示~~ → **解消（2026-09-28 に #144 で workflow ファイルを削除）**。Gemini の Actions 自動化は保留

## Codexの段位実装（ユーザー直接指示・draft作業中）

回路購入#288はmainへマージ済み。段位ブランチにも統合し、購入機能を維持する。今回の作業はInvade段位の保存・最高記録・解放済み一覧・下位段への撤退・Exploreの敵HPと攻撃力への倍率・旧セーブと途中保存の互換。段位の独立部分は全テスト・ブラウザー操作で検証済み。mainへは未反映、デプロイは未実施。

追加回答：出撃人数の最大3機制限を撤廃。真・偽1×1もすべて数え、部隊の初期回路上限を1枚にする。出撃選択・保存・再出撃・Exploreの機体IDと回路対応を4機以上にも対応させた。部隊上限は初期1＋最高段の新規クリア回数として計算する。機体別の枚数制限は廃止で確定。武器種（SMG・散弾・MMR・LMG）と特殊弾（高速弾・誘導弾・EMP弾）は各機体に各1枚まで。装着・出撃・再出撃の制限と、武器＋特殊弾の併用射撃を同じdraft #289に実装した。旧セーブの装備は保持し、不適合な出撃部隊に変更を案内する。初期回路の再付与も防ぎ、初期上限1枚の枠を取り外しで空けられる。

## Codexの生存機体の積載と移動電力（ユーザー直接指示・draft作業中）

- Who: Codex / 神宮からの直接指示による実装
- What: 生存機体の積載・降ろし、搭載機の独立射撃、味方の移動活動量消費
- Why: 段位・部隊上限#289の次の作業として、積載の残りを実装する
- Scope: 機体1機は積載2、既存の積載速度表に従う。搭載機も自身の武器種・特殊弾・弾薬で戦い、運ぶ側との武器合算や変換はしない。移動中1秒につき活動量1を運ぶ側だけが消費し、停止中と搭載機の移動消費は0。充電比率は既存の電力パーツ1対活動量1
- Status: Q4は活動量0で残骸化・生存搭載機を解放、Q5は機体別の手動充電で確定。実装・全テスト・スマホ幅のブラウザー操作を検証済み、draft #290でCI確認中。仕様の正本はLIVE_MECH_TRANSPORT_V0.md。mainへのマージ・デプロイは別の判断

## Codex: 出撃前の充電案内と戦闘フィードバック
- Who: Codex / ユーザー直接指示
- What: feat/combat-supply-feedback。活動量0の出撃前警告、敵の弾切れ表示、自動回収の実取得量表示
- Why: 採用されたUX改善1・2・3を実装する
- Scope: バランス変更Bと追加レビューのレイアウト変更は別途検討
- Status: draft #291。全workspaceのnpm test、Explore/Tradeビルド、390px幅ブラウザー検証が通過。#289・#290はmainへマージ・デプロイ済み。今回のマージ・デプロイは未実施

### 2026-10-14 テストプレイ提案の確認
- run-20261014-full-release-001は外部レビューとして受領。PASS表記や初期値を仕様確定の根拠にはしない。
- Restore: `#link-return-trade`「格納庫へ」は既存実装にあり、ブラウザーでも存在を確認。Commit Bypassは画面内で判定を更新する処理で自動遷移ではない。小さい盤では詳細の後にリンクがあり、確定操作の近くに置く改善は候補。
- Explore: 密集時の対象表示、HUB: 購入・取引へのスクロール削減は追加UX候補。今回は採用済み3項目の変更だけとし、大きなレイアウト変更は別途判断。
- 経済バランス検証Bはユーザー指示で後回し。
