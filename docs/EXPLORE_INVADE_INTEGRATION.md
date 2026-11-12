# 探索と侵略の一体化（広い地図）

- 日付：2026-11-12
- 基準：main `30f1c96`（これ以降）
- 位置づけ：探索（explore）と侵略（invade）を、一枚の広い地図にする計画。段階 0 は文書だけで、ゲームの動きを変えない。段階 1 は地図の大きさを渡せるようにする（PR #369。基準は main `5f34a24` 以降）
- 決定の残し方：番号と選んだ中身をセットで書く。選んでいないことは、この文書では埋めない

世界観の願望は [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) にある。この計画の決定は、下の 13 個だけである。実装は段階ごとに、小さい PR で進める。段階の外を先に足さない。

## 今のコード（main `30f1c96`）

出撃 1 回の地図は、盤のマス 1 個分である。盤のマスを横断する地図はない。

### 探索の地図

`packages/explore/src/game/balance.ts`

- 地図の大きさは `BALANCE.worldW` 1400、`worldH` 1000
- 出現点 `SPAWN_POINT` は (700, 500)。地図の中心（`packages/explore/src/facing.selftest.ts` が中心であることを見ている）
- コンテナは `fieldContainerCount` 20。置き方は `packages/explore/src/game/world.ts` の `placeContainers`（1400×1000 の中の目印と、5 列×4 行の格子）
- 敵の数は `threatFromDensity` と `threatFromEngage` が決める。返すのは数と、出現の距離・速さ・HP の倍率である。マスの座標は位置に使わない。`enemyCells` は件数だけを数える
- 敵の位置は `world.ts` の `placeEnemies` が、出現点の周りの輪に置く
- 段位の倍率は `packages/shared/src/invade-rank.ts` の `rankEnemyMultiplier`（1.01 の段乗）。`world.ts` の `createWorld` が、敵の HP と `enemyDamage` に掛ける。出撃につき一つ
- カメラの初期位置は出現点を中心にした 720×420（`world.ts` の `createWorld`）。追従の端は `packages/explore/src/game/sim.ts` が `worldW` / `worldH` で止める
- ズームは `packages/explore/src/game/mapZoom.ts`。倍率 1〜2.5。描画のときだけ使い、セーブしない。ミニマップはない
- 霧のマスは `fogCell` 40（`packages/explore/src/game/vision.ts` が `worldW` / `worldH` で列と行を数える）

### 侵略の盤

`packages/shared/src/front-board.ts`

- 一辺 25（`AOI_HALF` 12、座標 −12…+12、`BOARD_SPAN` 25）。決定 2 の盤全体 35000×25000 は、この 25 に今の 1400 と 1000 を掛けた数である
- 地雷の確率は [`INVADE_V0.md`](./INVADE_V0.md) §8.7。コードは `mineProbabilityAtDistance`。拠点からのチェビシェフ距離 `d` について、`P = 0.05 + min(1, d/10) × 0.20`（`MIN_MINE_P` 0.05、`MAX_MINE_P` 0.25、`SECTOR_FRONT_DISTANCE` 10）。`d` が 0（HQ）と、`d` が 12 以上（壁。`SECTOR_WALL_DISTANCE`）は地雷にしない
- 開いた地雷で、強制戦闘のロックが外れているとき（`hitMine === false`）、表示は「済」（`cellGlyph`）。ロック中は「✕」

盤の読み書きは `packages/invade/src/hub-persist.ts`（`frontProgress`）。段位は `packages/shared/src/invade-rank.ts`。初クリアは `packages/shared/src/first-clear.ts`。強制戦闘のロックは `packages/invade/src/forced-combat.ts`。

### 出撃へ渡すキー

[`INVADE_V0.md`](./INVADE_V0.md) §8.5。invade から explore へ渡す URL のキーは `sectorX`、`sectorY`、`density`、`intelFlags`、`engage`、`enemyCells`。定数は `packages/shared/src/constants.ts` の `HANDOFF_QUERY_KEYS.invadeToExplore`（ほかに `invadeRank` と `neighborCount`）。

直接出撃は `packages/explore/src/game/directFieldEntry.ts`。保存してある盤の seed を使い、HQ のマス (0, 0) へ出す（`sectorX=0`、`sectorY=0`、`density=0`）。開いたマスとマークは変えない。

出撃の場所は、そのマス一つである（`packages/explore/src/game/lostMechs.ts` の `sortieLocationFor`。`frontSeed` と `cell`）。

### セーブ

保存キーは `wreckline.hubSave.v3`（`packages/shared/src/constants.ts` の `HUB_SAVE_STORAGE_KEY`）。

関係する欄は、すべてこのキーの中にある。

- `frontProgress`（盤の seed、開いたマス、マーク、焦点、`hitMine`）
- `fieldCells`（`packages/shared/src/field-cell-state.ts`。`frontSeed` と `cell`）
- `fieldDrops`（`packages/shared/src/hub-save.ts`。`frontSeed` と `cell`。探索の中の座標は持たない）
- `lostMechs`（同じファイル。任意の `frontSeed` と `cell`。`pos` は探索の座標）
- `invadeRank`
- `firstInvadeClear`

`fieldCells` の地面と残骸の `pos` も、探索の座標である。

出撃の勝敗は、盤の開いたマスとマークを書き戻さない。強制戦闘が終わると `clearPendingForcedCombat` が `frontProgress.hitMine` だけを消す。開いた地雷の「済」は、このロック解除の表示である。倒したかどうかとは別で、失敗や中断でもロックは外れる。マークしたマスへ任意で出て倒しても、そのマスが開いていなければ「済」にはならない。

### 命令の半径

中隊長 7500、僚機の小隊長 1500（`BALANCE.commandRangeCaptain` / `commandRangePlatoonLeader`）。#365 で入れた。今の 1400×1000 では 7500 が地図の全体を覆う。この二つの半径は、ここにある広い地図を見越して選んであり、変えない。正本は [`AUTONOMOUS_LEARNING_V0.md`](./AUTONOMOUS_LEARNING_V0.md) の「小隊長の通信と分担」と、[`MECH_WORLD_BUILDING_DESIGN.md`](./MECH_WORLD_BUILDING_DESIGN.md) §6。

## 決まったこと（神宮決定 2026-11-12）

1. 一体化の形 = A 盤全体（25×25）を 1 枚の広い地図にする（神宮決定 2026-11-12）
2. 1 マスの大きさ = A 今の 1400×1000（盤全体は 35000×25000）（神宮決定 2026-11-12）
3. マインスイーパーの盤 = A 出撃前の偵察として残す（神宮決定 2026-11-12）
4. 地雷マスの敵 = A そのマスの区画の中に敵の一団を置く（神宮決定 2026-11-12）
5. 出撃の入口 = B 侵略（盤でマスを選ぶ）と直接出撃（HQ マスが中心）の両方（神宮決定 2026-11-12）
6. 結果を盤へ返す = B 倒した地雷マスを「済」にする（`front-board.ts` の既存の「済」表示）（神宮決定 2026-11-12）
7. 結果画面 = A 今の探索の結果画面（ER）に盤の変化の行を足す（神宮決定 2026-11-12）
8. セーブ = A `wreckline.hubSave.v3` の今のキー（`frontSeed` と `cell`）のまま、新しい最上位キーは足さない（神宮決定 2026-11-12）
9. 敵の強さ = A 出撃全体で一つ（今の段位と密度）（神宮決定 2026-11-12）
10. INVADE タブと侵略モジュール = A 名前も場所もそのまま（段階 5 で見直す）（神宮決定 2026-11-12）
11. 報酬の二重払い禁止（[`INVADE_V0.md`](./INVADE_V0.md) §6）= A 続ける（神宮決定 2026-11-12）
12. 広い地図の見方 = A 今のズームだけ（ミニマップは足さない）（神宮決定 2026-11-12）
13. 敵とコンテナの配置 = invade の盤に合わせる。爆弾（地雷）のあるマスに敵とコンテナを置き、安全と分かっている空白地帯はほとんど通過するだけにする（神宮決定 2026-11-12）

上の 13 個以外は、決めていない。あとの段階で聞く。選択肢も、仮の値も、ここには置かない。決定 13 の個数と動きは、まだ決めていない（下の未決）。段階 1 では配置を変えない。

## 段階

一段が、一つの小さい PR である。前の段が main に入ってから次へ進む。未決と書いた問いは、その段の実装命令の前に聞く。聞いた答えが文書に残るまで、その部分は作らない。

### 段階 0（PR #367）

この文書を置き、下の「食い違う文」を打ち消し線で指す。ゲームのコード、テスト、HTML、素材は変えない。この段に未決の問いは置かない。未決はあとの段に残す。

### 段階 1（実装済み・PR #369）

状態：実装済み（PR #369。基準は main `5f34a24` 以降）。見た目も動きも、既定の 1400×1000 では変えていない。決定 13 の配置は、この段では作らない。

地図の大きさは `createWorld(boot, { worldW?, worldH? })` で渡す。省略した軸、および有限な正の数でない値は、`BALANCE` の 1400 と 1000。値は、その出撃の `world.balance` のコピーにだけ書く。大域の `BALANCE` は変えない。

出現点は、渡した大きさが既定と違うときはその地図の中心（`spawnPointForMap`）。既定の 1400×1000 は `SPAWN_POINT` (700, 500) のまま。カメラの初期位置は出現点を中心にした 720×420 で、地図の中に収める。既定では、収める前の位置がすでに中にあるので、今と同じ (340, 290) である。

`placeContainers` と敵の出現の端、移動の端、霧の列と行、遮蔽物が避ける出現点は、その出撃の大きさを見る。コンテナの個数と、目印・5 列×4 行の散らしは変えていない。置くマスの方針は決定 13。1 マスの個数と、空白地帯に置くかどうかは段階 3 の未決である。

確認した範囲：カメラ（`sim.ts` の端と `createWorld` の初期位置）、`mapZoom.ts`、出現点、コンテナの散らし、移動の端、霧の列と行。命令の半径 7500 と 1500 は変えていない。

### 段階 2（未決あり）

マスの座標と世界の座標の変換を、`packages/shared` の純関数にする。テストだけ。ゲームの動きは変えない。

対応のさせ方は未決（段階 2 で聞く）。決定 2 は、1 マスの大きさと盤全体の大きさだけを決めている。

### 段階 3（未決あり）

決定 1。25×25 の盤全体を、出撃 1 回の地図にする。決定 4 と決定 13。敵とコンテナは、爆弾（地雷）のあるマスに置く。安全と分かっている空白地帯はほとんど通過するだけにする。決定 5。入口は二つ。盤で選んだマスから入る出撃と、HQ マスを中心にした直接出撃。

この段で聞く未決は、開始位置、地雷マス 1 個あたりの敵の数とコンテナの数、空白地帯に何も置かないか少し置くか、未開封の見せ方、敵の一団の動き、性能の上限、壁マスである。

### 段階 4（未決あり）

決定 6。出撃の結果を盤へ返す。倒した地雷マスを、既存の「済」にする。決定 8。フィールドの保存は今のキー（`frontSeed` と `cell`）のまま、座標は広い地図の座標で書く。新しい最上位キーは足さない。

この段で聞く未決は、「倒した」の判定と、今のセーブの座標の移し方である。

### 段階 5（未決あり）

入口と、結果画面を合わせる。決定 7。結果画面は今の探索の ER に、盤の変化の行を足す。決定 10。INVADE タブと侵略モジュールの名前と場所は、この段で見直すまでそのままである。見直して変えるかどうかは、まだ決めない。

## 未決

答えは置かない。

- 盤のマス（`sx`、`sy`。−12…+12）のどこを、世界座標のどこに置くか。未決（段階 2 で聞く）
- 盤で選んだマスから入るとき、そのマスの中のどこを開始位置にするか。未決（段階 3 で聞く）
- コンテナを置くマスは決定 13（爆弾のあるマス。安全と分かっている空白地帯はほとんど通過するだけ）。1 マスに何個置くか、空白地帯に何も置かないか少し置くかは未決（段階 3 で聞く）。今の 20 個と目印の座標は 1400×1000 用である。段階 1 では個数も散らしも変えない
- まだ開いていないマスを、広い地図の上でどう見せるか。未決（段階 3 で聞く）
- 敵の一団を置くマスは決定 13（決定 4 の、爆弾のあるマスの区画）。1 マスに何体置くか、空白地帯に何も置かないか少し置くか、その区画の中でどう動くかは未決（段階 3 で聞く）
- 広い地図で、どこまでを一度に動かし、どこで止めるか。未決（段階 3 で聞く）
- 壁マス（拠点からの距離が 12 以上で、今は進入できないマス）を、広い地図でどう扱うか。未決（段階 3 で聞く）
- 決定 6 の「倒した」を、どの状態で満たすか。満たした地雷マスを、既存の「済」にする、とだけ決まっている。未決（段階 4 で聞く）
- 今のセーブにある探索の座標（`lostMechs.pos`、`fieldCells` の地面と残骸の位置）を、広い地図の座標へどう移すか。未決（段階 4 で聞く）
- 結果画面に足す、盤の変化の行の文。未決（段階 5 で聞く）
- 段階 5 の見直しで、INVADE タブと侵略モジュールの名前と場所を変えるかどうか。決定 10 は、見直すまで今のままにする、とだけ決めている。未決（段階 5 で聞く）

## 食い違う文

次の文は、当時の記録として残す。打ち消し線の部分だけが、この文書の決定に置き換わる。

- [`CANVAS_PALETTE_RESTRUCTURE.md`](./CANVAS_PALETTE_RESTRUCTURE.md) の侵略・出撃の行 I と、explore／SORTIE の対応の行
- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) §7 の「未決定の大型統合を先に実装する」
- [`INVADE_RECON_INPUT_DECISION.md`](./INVADE_RECON_INPUT_DECISION.md) の、偵察操作の PR が Invade/Explore 統合を変えないとした行
- [`STATUS.md`](./STATUS.md) の #348 の対象外（INVADE/Explore の統合）
- [`FIELD_OBJECT_IDENTITY_FOUNDATION.md`](./FIELD_OBJECT_IDENTITY_FOUNDATION.md) の「EXPLORE/INVADE戦場統合は別計画」
