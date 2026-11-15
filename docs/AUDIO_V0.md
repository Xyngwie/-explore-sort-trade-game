# BGM と効果音 v0

- 日付：2026-11-15
- 状態：実装（canvas 版。既存版のページは音なし）
- 作曲：Claude Code（神宮の依頼）。プログラムで合成し、外部の音源やサービスは使っていない。作り方は [`tools/audio/README.md`](../tools/audio/README.md)

## 決定（神宮決定 2026-11-15「全★で実装」）

| ID | 決定 |
|---|---|
| B1 | 交戦の曲：分隊の誰かの視界に生きた敵がいるあいだは「Contact」。見えなくなって 4 秒たったら探索の曲へ戻す |
| B2 | 画面の端に小さな「♪」。押すたびに BGM と効果音をまとめてオン・オフ。設定はその端末に覚える（`localStorage` の `wreckline.audio.muted`。セーブには入れない） |
| B3 | 曲の切り替えは、前の曲を 1 秒で小さくしながら次の曲を始める |

ほかに神宮の指示（2026-11-15）：タイトルの曲だけアウトロ付き（ループしない）。ほかの曲はすべて継ぎ目なくループする。効果音は「じゃまにならない程度」。

## シーンと曲

| シーン | 曲 | ファイル |
|---|---|---|
| 開始画面 | WRECKLINE - Above the Shell（アウトロ付き・1 回） | `bgm/title.mp3` |
| 格納庫（DOCK。パレットの中もすべて） | Hangar - Rust and Warmth | `bgm/hangar.mp3` |
| 仕分（SORT） | Sorting the Salvage | `bgm/sorting.mp3` |
| 修復（RESTORE） | Restoring the Circuit | `bgm/restoring.mp3` |
| 偵察（INVADE） | Recon Grid | `bgm/recon.mp3` |
| 探索：出撃準備 | Briefing - Mass Driver | `bgm/briefing.mp3` |
| 探索：出撃中 | Scavenging the Shell | `bgm/scavenging.mp3` |
| 探索：交戦（B1） | Contact | `bgm/contact.mp3` |
| 探索：帰還要請〜離昇（搭乗円が出ているあいだ） | Extraction Window | `bgm/extraction.mp3` |
| 探索：結果（離昇した） | Home with Cargo | `bgm/home.mp3` |
| 探索：結果（離昇しなかった。撤退・救助・失敗） | Lost to the Cold | `bgm/lost.mp3` |

置き場所は `packages/shared/src/audio/`。曲と効果音の一覧と、ループの区間は `manifest.json`。

## 再生のしかた（`packages/shared/src/audio.ts`）

- Web Audio で鳴らす。スマートフォンのブラウザは操作のあとでないと音を出せないので、最初のタップかキーで始まる。
- 曲は、そのシーンに入ったときに読み込む。展開した曲は最大 2 曲だけ持つ。効果音（全部で約 230KB）は最初のタップのあとにまとめて読み込む。
- ループの継ぎ目：MP3 には復号のずれがあるので、曲の前後に自分の終わりと始まりを 0.5 秒ずつ付けて保存し、ちょうど 1 周期の区間をループさせる（`manifest.json` の `loop`）。ずれがあっても 1 周期の窓は途切れない。
- 画面が裏に回ったら止め、戻ったら続ける。ミュート中も止める。
- 音量：BGM は 0.5、効果音は 0.9 を掛ける。効果音そのものは段ごとに小さく作ってある（画面の操作 < 射撃・被弾 < 作業 < 出来事）。

## 効果音

| 何が起きたら | 効果音 | どこで拾うか |
|---|---|---|
| canvas のボタンを押す | `ui-tap`（パレットを開く `ui-open`、戻る `ui-back`、決定 `ui-confirm`、やめる `ui-cancel`） | `CanvasUI` の `onActivate`。同じタップでほかの効果音が鳴るときは、そちらだけ |
| 押せないボタンを押す | `ui-denied` | `CanvasUI` の `onDenied` |
| 格納庫の操作（売却・購入・修理・充電・装備・解体・機体の購入と作成・回路の作成と購入・航空支援） | `coin-gain` `coin-spend` `repair` `charge` `equip` `scrap` `mech-new` `air-support` | プレイ記録の操作名（`setPlayLogOperation`）→ `ACTION_SFX` |
| 探索：射撃（隊長・僚機・敵）、命中、被弾、盾が壊れる、敵の撃破、味方の大破 | `fire-*` `hit-enemy` `hit-self` `shield-break` `enemy-down` `ally-wrecked` | ゲームの処理が `world.sfx` に積み、ページが毎フレーム鳴らす（`sfxQueue.ts`） |
| 探索：コンテナ発見、回収の開始（隊長）と完了、僚機への指示、帰還要請、残り 30 秒、離昇、地雷マスを「済」に | `container-found` `salvage-start` `salvage-done` `order` `extract-request` `time-warning` `liftoff` `board-cleared` | 同上 |
| 修復：線、×・消す、輪が閉じる、完全覚醒で確定 | `restore-edge` `restore-cross` `restore-solved` `restore-perfect` | `RestoreScene` |
| 仕分：開封、入れ替え | `sort-open` `sort-place` | `SortScene` |
| 偵察：マスを開く、旗、地雷を踏む、盤を掃討 | `invade-open` `invade-flag` `invade-mine` `board-cleared` | `InvadeScene` |

じゃまにならないための決まり：同じ効果音は段ごとの間隔（0.03〜0.12 秒）より短く続けて鳴らさない。同時に鳴るのは 10 個まで。探索の 1 フレームの中で同じ効果音は 1 回だけ。

## 「♪」の場所

資源の行（Cr・弾・装・電・箱）の右端に、行の中で 44px を空けて置く（DOCK・SORT・RESTORE・INVADE・探索の準備と結果）。資源の行が無い画面は、開始画面では右上の角、出撃中は上の表示の右端（表示の文字はその分だけ短くする）。どの画面でも、ほかのボタンと重ならないことを `scripts/verify-canvas-audio.cjs` と `scripts/verify-canvas-explore.cjs` で確かめる。

## 対象外

既存版のページ（canvas でない格納庫・探索など）の音。音量のつまみ（B2 は ★A のオン・オフだけ）。曲ごとの音量の設定。
