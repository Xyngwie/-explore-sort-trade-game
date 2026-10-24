# 僚機の自律学習 v0

状態: 正式仕様（2026-10-24 神宮。実装を実装隊長へ渡す）。設計メモ [`MECH_WORLD_BUILDING_DESIGN.md`](MECH_WORLD_BUILDING_DESIGN.md) §5 と食い違うときは本書を優先する。

本書は、僚機が命令の中で行動を選び、結果を個体のマスに残す仕組みである。点数の表は v0 の比率であり、神宮が差し替えるまでこの数を使う。

## 誰が学ぶか

- 学ぶのは `kind === "wingman"` で、`OwnedMech.instanceId` がある僚機だけ。
- `instanceId` が無い僚機は、今の `decideWingman` のまま。マスは作らない。
- 隊長機は呼ばない。中隊指揮で隊長機を手放す仕様は、本書では作らない。入れ物は `instanceId` なので、その仕様が来たとき同じ帳簿を使える。
- 命令の姿勢（`escort` `patrol` `recover` `raid`）は変えない。散開が遊撃と地点を置く処理も変えない。学習が選ぶのは、その姿勢の中の移動と、その機体だけの荷下ろしである。

## 保存

HubSave に任意フィールド `mechLearning` だけを足す。これ以外の新しいトップレベルキーは作らない。

```text
mechLearning: {
  byMech: { [instanceId]: Cell[] }
  settledSortieIds: string[]   // 最大 64。古いものから捨てる
}
```

- 古いセーブにこのフィールドが無いときは、空の帳簿として読む。壊れたセルは捨て、残りのセルは残す。
- セルは結果が書かれたときだけ作る。全組み合わせを先に並べない。
- 出撃の開始時に、HubSave のその機体のセルを world の作業用へコピーする。出撃中は作業用を増やす。
- 精算では、作業用のセルで HubSave のその機体のセルを置き換える。同じ `sortieId` が `settledSortieIds` にあるときは、二度目は置き換えない。
- world をそのまま保存する今のチェックポイントには、作業用が一緒に残る。チェックポイント用の別キーは作らない。
- 大破しても、復旧しても、キーは同じ `instanceId` のまま。経験は機体に残る。
- 機体ごとのセル数の上限は 4096。超える新しいキーは書かず、既存のセルの加算は続ける。

実行時だけに置き、HubSave のメカ定義には足さないもの:

- `learningAction` … いま選んでいる行動
- `droppedThisSortie` … この出撃でその機体が荷物を捨てた
- `learningDecisionCount` … この出撃での判断回数。0 から始まる
- `learningDecisionAt` … 直前の判断の `world.elapsed`

古いチェックポイントにこれらが無いときは、未選択、捨てていない、0、未判断として読む。

## セル

キーは次だけ。

| 軸 | v0 の値 |
|---|---|
| `ledger` | `survival` `transport` `combat` |
| `action` | `drop` `flee` `fight` `carry` `extract` `hold` |
| `subject` | `none` `normal` `container` `circuit` `wreck` |
| `distance` | `near` `mid` `far` |
| `circle` | `inside` `close` `late` |
| `hp` | `high` `low` |
| `cargo` | `holding` `dropped` `none` |

数はすべて 0 以上の整数。無いフィールドは 0。

| ledger | 増やす数 |
|---|---|
| `survival` | `tries` `survived` `died` `leftBehind` |
| `transport` | `tries` `quizSuccess` `quizFailure` `broughtHome` `abandoned` |
| `combat` | `tries` `hits` `misses` `kills` |

点の大きさが違う結果は、同じ数に混ぜない。

`ledger` がこの三つ以外のセルは、読んでも合計に入れない。捨てもしない。中隊全体の功績のような枠は、後の仕様が新しい `ledger` を足す。本書ではその中身を書かない。

未経験とは、その行動が読む `survival` のセルが無い、またはその `tries` が 0 のことである。`survival` の `subject` は常に `none`。

## 段

一つの判断で、段は一つ。比べる行動は行動だけが違い、段は同じものを読む。

- 距離。敵がいるときは、その敵まで。敵が無く回収対象があるときは、その対象まで。どちらも無いときは、隊長まで。`near` はその機体の武器射程以内。`mid` は射程の外かつ視界以内。`far` は視界の外。射程と視界は、今の `rangeMul` と `visionMul` を掛けた値。
- 円。`boarding` があるときはその中心と半径。無いときは `extract` の中心と半径。`inside` は中心までの距離が半径以内（`isInsideBoarding` があるときはそれを使う）。`close` は円の外で、中心までの距離が半径 + 視界以内。`late` はそれより遠い。
- 体力。生きていて `hp / maxHp` が 0.5 より大きいときは `high`。それ以外で生きているときは `low`。死んでいる機体は判断しない。
- 荷物。`unitLoad > 0` は `holding`。積載 0 で `droppedThisSortie` なら `dropped`。どちらでもなければ `none`。

## 区分

- `container` … フィールドのコンテナ（`salvagedCount` の対象）。
- `circuit` … 運んでいる残骸のうち、既存の記録で回路が付いているもの。回路が残骸より優先する。
- `wreck` … 運んでいる残骸のうち、回路が付いていないもの。
- `normal` … 上のどれでもない敵。
- `none` … `survival` のセルだけが使う。

v0 では、戦場の敵の区分はすべて `normal` とする。敵を `circuit` や `wreck` に上げる、部隊が最近持ち帰った敵の利益の平均は、本書では作らない。点数表にその行があるのは、後の仕様が区分を渡したときに同じ式を使うためである。

一つの判断で行動が読む区分:

- `fight` と `flee` の戦闘セルは、今見ている敵の区分。v0 では `normal`。
- `carry` の運搬セルは、向かっている対象の区分。コンテナなら `container`。残骸なら `circuit` または `wreck`。
- `drop` の運搬セルは、その機体がいま持っているいちばん高い区分。順は `circuit`、`wreck`、`container`。
- `hold` と `extract` の運搬セルは、持っていればそのいちばん高い区分。持っていなければ運搬セルは読まない。
- どの行動も `survival` は `subject = none`。

## メニュー

姿勢ごとに開く行動は次だけ。開いていない行動は選ばない。

| 姿勢 | 開く行動 |
|---|---|
| `escort` `patrol` `raid` | `hold` `fight` `flee` `drop` `extract` |
| `recover` | `hold` `carry` `fight` `flee` `drop` `extract` |

さらに、その場で閉じるもの:

- `fight` は、生きた敵をその機体が見ている、または分隊が見ているときだけ。複数いるときはいちばん近い敵。
- `carry` は、`recover` で、積載にコンテナの余地がある、回収の途中、または発見済みコンテナがあるときだけ。
- `drop` は、`unitLoad > 0` で、時間切れでないときだけ。
- `extract` は、`boarding` があるときだけ。

固定順は `drop` `flee` `fight` `carry` `extract` `hold`。

判断は、未選択のとき、直前の判断から 2 秒経ったとき、いまの行動が完了・失敗・撤回したとき、に行う。2 秒は定数で、名前は保存キーにしない。間のフレームは直前の意図を繰り返す。完了・失敗・撤回は、回収完了、回収の中断、荷下ろしの完了、見ていた敵が倒れたまたは見えなくなった、搭乗円が消えた、である。

未経験の開いている行動が一つでもあるときは、その中から一つを試す。固定順に並べ、`learningDecisionCount % 個数` の位置を選ぶ。新しい乱数は作らない。

全部に `tries` があるときは、想定がいちばん高い行動を選ぶ。同点は固定順の先。

選んだら、その行動が読むセルの `tries` を 1 増やす。セルが無ければ作ってから増やす。`learningDecisionCount` を 1 増やす。

## 選んだあとの動き

既存の quirk（`cling` `decoy` `sniper`）の距離補正は、`hold` と `fight` の中で今どおり効く。

- `hold` … その姿勢の、今の `decideWingman`。
- `fight` … 姿勢は変えず、今の遊撃が敵へ立つ距離の取り方で、その敵へ移動して、交戦距離なら撃つ。
- `flee` … 隊長への帯同位置へ移動する。撃たない。回収を続けない。
- `carry` … その姿勢の、今の回収。
- `extract` … `boarding.center` へ移動する。撃たない。回収を続けない。
- `drop` … その機体のコンテナと、運んでいる残骸だけを、その場に下ろす。盾は下ろさない。小隊全体の `purgeCargo` は使わない。新しいログ文は足さない。下ろしたら `droppedThisSortie` を立て、この判断の移動は `flee` と同じにする。

## いつ数を増やすか

小テストは、その出来事のとき、そのとき選ばれている行動のセルに 1 を足す。

- 味方の弾が敵に当たったとき `hits`。外れたとき `misses`。弾 1 発につき 1。障害物、回避、味方への命中は足さない。味方への命中は今の `friendlyFire` のまま。
- その機体が敵を倒したとき `kills`。倒した機体のセルに足す。倒した敵の区分は v0 では `normal`。
- 回収が完了したとき、その区分の `quizSuccess`。回収を中断したとき、または時間切れで届かなかったとき、`quizFailure`。同じ対象の完了と失敗を両方足さない。完了が勝つ。
- `drop` で下ろしたとき、下ろした区分ごとに `quizFailure` を 1。同じ区分をいくつ下ろしても、その判断では 1。

精算は出撃の終わりに一度。

- 円の中で生きて帰った僚機は `survived`。
- 大破した僚機は `died`。
- 円の外で生きて残った僚機は `leftBehind`。
- 円の中に、その区分をまだ積んでいたときは `broughtHome` をその区分ごとに 1。
- 出撃中にその区分を持ったことがあり、円の中に残っていないときは `abandoned` をその区分ごとに 1。最初から持っていない区分は足さない。
- 精算のセルの行動は、終わりの時点の `learningAction`。未選択なら `hold`。段は終わりの時点の段。
- 撃破の `kills` は倒した機体。持ち帰りの `broughtHome` は運んだ機体。同じ残骸で両方足してよい。受け取る機体が違うなら、それぞれの `instanceId` に足す。

小競り合いの区間そのものには点を足さない。

## 点数

| 結果 | 点 |
|---|---|
| `survived` | +100 |
| `died` | −100 |
| `leftBehind` | −80 |
| `container` の小テスト成功 / 失敗 | +1 / −1 |
| `circuit` または `wreck` の小テスト成功 / 失敗 | +4 / −2 |
| `container` を円の中にまだ積んでいた | +8 |
| `circuit` または `wreck` を円の中にまだ積んでいた | +40 |
| `normal` の命中 / 外れ | +1 / −1 |
| `normal` の撃破 | +2 |
| `circuit` または `wreck` の撃破 | +20 |

持ち帰りに失敗した `abandoned` の点は 0。撃破点は、その区分のセルの `kills` にだけ掛かる。

## 想定

分母が 0 の項は 0。

- 生還の項 … `(survived×100 + died×(−100) + leftBehind×(−80)) / (survived + died + leftBehind)`
- 運搬の小テストの項 … `(quizSuccess×成功点 + quizFailure×失敗点) / (quizSuccess + quizFailure)`
- 持ち帰りの項 … `broughtHome / (broughtHome + abandoned) × 持ち帰りの点`
- 射撃の項 … `(hits×1 + misses×(−1)) / (hits + misses)`
- 撃破の項 … `kills / tries × 撃破点`

行動の想定は、その行動が読むセルの、上の項の和である。`tries` はあるが結果の数がすべて 0 のセルは、想定 0。

この和で、捨てた側が生還の得より低いあいだは、持ったままが選ばれる。通常コンテナは持ち帰りが +8 なので、円が `late` で持ったままの生還が悪い記録になると、捨てる側が先に勝つ。回路または残骸は持ち帰りが +40 なので、その減点が生還の得を上回るあいだは、持ったままが勝つ。

v0 の敵の撃破は +2 なので、死亡の −100 が付いた戦いより、逃げる側が高くなりやすい。敵の評価値が後から `circuit` または `wreck` として渡されると、同じ式で、生還が悪くても戦い切る側が高くなり得る。その分類を渡す仕組みは本書の対象外である。

## 実装の分け方

実装隊長は、ファイルが重なるので一人に `TASK_ASSIGNMENT` してよい。純関数と、僚機の判断への接続を、二人で同時に書かない。

触ってよいのは次だけ。

- `packages/shared/src/hub-save.ts`
- `packages/shared/src/hub-save-v3.selftest.ts`
- `packages/explore/src/game/learning.ts`（新規）
- `packages/explore/src/learning.selftest.ts`（新規）
- `packages/explore/src/game/brain.ts`
- `packages/explore/src/game/types.ts`
- `packages/explore/src/game/sim.ts`
- `packages/explore/src/game/orders.ts`
- `packages/explore/src/game/outcome.ts`
- `packages/explore/src/game/circuitPlay.ts`（その機体だけの荷下ろしを外から呼べるようにする範囲）

純関数の名前は `chooseLearningAction`、`learningExpectation`、`noteLearningEvent` だけを新しく置く。

確認すること:

- 未経験の行動が、結果の入った行動より先に選ばれる。選ぶ位置は `learningDecisionCount` と固定順だけで決まる。
- 全部に `tries` があるとき、想定の高い方が選ばれる。同点は固定順の先。
- 通常コンテナを持って円が `late` のとき、持ったままの生還が悪ければ `drop` が勝つ。回路を持っているとき、同じ生還の悪さでも `drop` の想定が低いあいだは `hold` が勝つ。
- `normal` の撃破 +2 と死亡 −100 では、`flee` が `fight` より高くなり得る。
- 小テストと精算は別の数に入る。同じコンテナの回収完了と、円の中にまだあったことは、両方 1 ずつ入る。
- 撃破は倒した機体、持ち帰りは運んだ機体。
- 命令の姿勢は変わらない。盾は落ちない。`purgeCargo` は小隊全体のまま。
- 古い HubSave と古いチェックポイントは、空の帳簿として読める。同じ `sortieId` の精算は一度だけ。
- `instanceId` の無い僚機と隊長機は、今の動きのまま。

## 対象外

隊長機の自律。中隊功績の中身。敵の評価を、最近持ち帰った利益の平均にする仕組み。敵を `normal` 以外に分類すること。新しい画面、新しいログ文、新しいホットキー。quirk の削除。誤射帳簿の変更。盾を捨てる学習。射程外を撃つための新しい射撃。予測回避、瞬間移動、遮蔽の学習。点数表の差し替え。
