# エージェント正本（世界・判断・契約）

新しい Cloud Agent は、過去のチャットを持たない。作業の前にこのファイルを読む。役割の手順は [`instructions/`](./instructions/) にある。このファイルと指示文が食い違ったら、このファイルを優先し、コメントにその旨を書く。

このファイルは実装チケットではない。次に何を作るかは、追跡 Issue の決定仕様と [`../STATUS.md`](../STATUS.md) と `main` の実体を見る。ここより新しい決定があれば、そちらが勝つ。

## 1. 誰が何をするか

オーナーは神宮。スマートフォンで実機を見る。PC で `npm` は走らせない。世界観、優先度、仕様の最終判断は神宮にある。風紀委員が仕様を文章にし、神宮がまだ決めていない点を神宮に返す。

| 名前 | `sender` / `recipient` | すること | しないこと |
|---|---|---|---|
| 風紀委員 | `inspector` | 監査、仕様決定、世界観の記録。照査済み PR のマージとデプロイ確認 | 実装しない。不明点を推測で埋めない |
| 実装隊長 | `lead` | 仕様を1人の実装担当への指示にする。作業報告を仕様と照らす。合えば ready にして風紀委員へ渡す | ゲームコードを自分で書かない。マージしない |
| アロー | `arrow` | 隊長の指示だけを実装し、draft PR と作業報告を返す | 指示の前に着手しない。マージしない。ready にしない |
| ジャベリン | `javelin` | 同上 | 同上 |
| トマホーク | `tomahawk` | 同上 | 同上 |

1件につき実装する者は1人。ファイルが重ならない別件だけ、隊長が別の者へ同時に出してよい。待機と書かれた者は、同じファイルを開かない。

旧称の「実行隊長」は実装隊長のこと。報告の宛先は `lead`。

## 2. リレー

連鎖は Slack では起きない。追跡用の GitHub Issue のコメントだけが次のエージェントを起こす。PR コメントや Slack に同じ文章を書いても、次は起動しない。

コメントの形は、日本語の短い前置きのあとに、フェンス言語 `json` のブロックを1つ。ブロックは1つだけ。中にネストしたオブジェクトがあってよい。抜き出しは、最初の ` ```json ` から対応する閉じフェンスまでを JSON として読む。最初の `}` で切る正規表現は、このプロトコルを壊す。

前置きには次を書く。

- 不具合報告ではないとき: 「不具合報告ではありません。」
- 実装担当がまだ着手してはいけないとき: 「実装の開始ではありません。実装エージェントは、実装隊長の実装命令が出るまで開始しないでください。」

`recipient` が自分でなければ、何も変更せず終了する。受け取った `type` を、そのまま自分から再送しない。同じ Issue に、同じ `type` と同じ PR head のコメントが自分から既にあれば、再送しない。

共通の形:

```json
{
  "sender": "inspector",
  "recipient": "lead",
  "type": "SPEC_DECISION",
  "issue_number": 0,
  "pr_number": null,
  "payload": {}
}
```

`sender` は `inspector` / `lead` / `arrow` / `javelin` / `tomahawk` / `owner`。`owner` は人間だけが使う。`recipient` はそれに加え、人間へ返すときは `owner`。`owner` 宛ては自動化を起動しない。コメントが人間への質問として残る。

`type` は次だけ。

| type | 向き | 意味 |
|---|---|---|
| `SPEC_DECISION` | 風紀委員 → 実装隊長 | 決まった仕様。実装担当への命令ではない |
| `SPEC_QUESTION` | 実装隊長 → 風紀委員、または神宮の答えを風紀委員へ | 決まっていない点。推測で実装しない |
| `TASK_ASSIGNMENT` | 実装隊長 → アロー / ジャベリン / トマホーク の1人 | その人だけが着手する |
| `REVISION_REQUEST` | 実装隊長 → 同じ実装担当 | 照査で足りなかった点だけ直す |
| `WORK_REPORT` | 実装担当 → 実装隊長 | draft の作業報告 |
| `PR_READY_REPORT` | 実装隊長 → 風紀委員 | 照査が通った。マージは風紀委員 |
| `TASK_COMPLETED` | 風紀委員 → `owner` | マージとデプロイ確認の記録。`owner` なので次の自動化は起動しない。次の機能は始めない |

神宮が質問に答えて風紀委員を起こすときは、Issue に次をコメントする。

```json
{
  "sender": "owner",
  "recipient": "inspector",
  "type": "SPEC_QUESTION",
  "issue_number": 0,
  "pr_number": null,
  "payload": {
    "answers": [
      { "id": "Q1", "decision": "神宮の答え" }
    ]
  }
}
```

各 `payload` の中身は [`instructions/`](./instructions/) の見本どおり。見本に無いキーを足して、新しい保存キーや URL キーの代わりにしない。

## 3. 判断

仕様に書いていない遊びは作らない。ビジョン文書の願望は、決定仕様ではない。

不明な点は `SPEC_QUESTION` で止める。選択肢が文書にあるなら、それを質問に添える。こちらで選んで実装しない。

決定済みでも、その命令の対象外と書いてあるものは入れない。項目5-2b のとき、5-3（戻るの無効化と途中保存）と真盤（初クリアまで確率 0%）は仕様に書いてあったが、実装には入れなかった。次の命令がそれらを名指しするまで、同じ扱い。

指示の Allowed に入っていない変更がないと、仕様の結果が達成できないときは、範囲を広げて実装しない。`WORK_REPORT` の `unresolved` にそのギャップを書き、draft のまま止める。隊長が `REVISION_REQUEST` で Allowed を広げる。項目5-2b では、生きている時間切れのコンテナを倉庫へ戻す必要があったのに、Sort の未開封入庫が Allowed の外だった。URL に個数を載せただけでは倉庫に入ったことにならない。

照査は PR 本文ではなく、決定仕様の文とコードとテストで行う。CI が緑でも、仕様の結果が起きていなければ通さない。

走らせていないテストを PASS や GREEN と呼ばない。自分が見た CI の成功だけを GREEN と書く。プレビューを操作していなければ `preview_play` は `NOT_RUN`。文書だけや、workflow の paths に当たらない変更で Deploy Modules Preview が走らなければ `NOT_TRIGGERED` であり、成功ではない。コードを変えたのに、その workflow が走っていないときは、成功扱いにせず報告して止める。

マージは1本ずつ。風紀委員は、そのマージコミットの Deploy Modules Preview が success になってから次をマージする。文書だけで workflow が走らないときは、その旨を `TASK_COMPLETED` に書き、デプロイ成功とは書かない。

照査の前に main へ入った変更を、隊長が照査したことにはしない。

## 4. 仕様の優先順位

上にあるものから見る。

1. 追跡 Issue にある、神宮の答えを反映した最新の `SPEC_DECISION`
2. その決定が名指しした正本ファイル（項目5は [`../ITEM5_FORMAL_SPEC.md`](../ITEM5_FORMAL_SPEC.md)。設計メモ [`../CIRCUIT_SQUAD_DESIGN_V0.md`](../CIRCUIT_SQUAD_DESIGN_V0.md) §7.1 と食い違うときは正式仕様）
3. 契約文書（[`../HUB_SAVE_CONTRACT.md`](../HUB_SAVE_CONTRACT.md) と、モジュールの V0 / V2）と、`main` のコードとテスト
4. [`../STATUS.md`](../STATUS.md)。PR や Actions と食い違うときは、PR と Actions を正として STATUS を直す
5. [`../PRODUCT_VISION.md`](../PRODUCT_VISION.md) と [`../FUTURE_IMPLEMENTATION.md`](../FUTURE_IMPLEMENTATION.md) は願望と先送り。実装の根拠にしない
6. [`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) は 2026-09-26 のままで、現在の予定ではない
7. [`../ORCHESTRATION.md`](../ORCHESTRATION.md) の役割分担（Codex がオーケストレーター、Cursor が実装レーン）は 2026-09-28 の記述。いまの実装の連鎖は、このファイルの風紀委員 → 実装隊長 → アロー / ジャベリン / トマホーク。デプロイ確認を1本ずつ行う原則は、いまも有効

画面の言葉は「帰還」。X の行動と搭乗円は「帰還要請」。古い「抽出」「生還」を新しい文章や画面に戻さない。英語の識別子、保存キー、URL は、用語の変更では触らない。

## 5. 世界と契約（実装で毎回守ること）

ゲームはモノレポ。`packages/explore`（探索）、`sort`（精製）、`trade`（格納庫）、`invade`（前線）、`restore`（回路の修復）、`shared`（契約）。所持金は HubSave の `credits`。Explore はお金を持たない。

帰還の費用は、URL キー `rescueFee`、コード上のフィールド `rescueFeeCredits`。Hub が `sortieId` ごとに1回だけ引き、0 未満にしない。0 は 0。

帰還の一律摩耗は `packages/shared/src/mech-fleet.ts` の `MECH_FLEET_RULES`。帰還 `extract` は 15、撤退 `abort` は 20、失敗 `fail` は 35。生きている時間切れの強制救助は `abort` に乗せ、`extracted` は立てない。通常の帰還にすると摩耗が 15 になる。

生きている時間切れで半径の中から持ち帰ったコンテナは、explore→sort の既存フィールド `forcedRescueRecovered` で Sort が精製または未開封の預け入れ（`depositUnopenedContainers`）を受け付ける。このフィールドは #248 で既に main にある。無い URL と古いセーブはそのまま読める。救助撤退と、隊長が大破した時間切れにはこの印を付けない。新しい識別子、保存キー、URL キーは、決定仕様が名前を書くまで足さない。仕様が「新しい識別子は作らない」と書き、既存のキーでは結果が出せないときは、実装せず `SPEC_QUESTION` に戻す。

キャンプの置場を「持ち帰る」は、今のコンテナの受け渡しに足すこと。キャンプ用の新しいセーブは作らない。

Invade の強制戦闘の時間切れは、Explore の `engage === "forced"` と同じ時計を使う。Invade の盤に別のタイマーを足さない。

搭乗円の色は緑 `#3dd68c` と青 `#3d8bfd`。警告の円はこれと別の色にし、選んだ色を PR に書く。項目5-2b で選んだ色は `#c084fc`。

修理費の決定（未実装。お金の仕様が来るまでコードの仮の `repairCredits: 50` を正本にしない）は、最大 HP の 2 倍の装甲パーツと 500c。僚機の購入は 2000c の決定で、未実装。充電はバッテリーの消費と一緒に後回し。

回路ボーナスは装着中だけに限定しない（#229 は不採用）。今の集計は、置き去りの機体の回路を除く所持回路。真盤は、Invade の初クリアで「4」の 1×1 を発見するまで確率 0%。発見の記録が無いセーブは未クリア。盤の様子からクリア済みと推測しない。これらは決定済みで、名指しの `SPEC_DECISION` があるまで実装しない。

## 6. コーディング

- 依存はリポジトリルートで `npm ci`（Node.js 20 以上）。確認は `npm run typecheck` と `npm test`。触ったモジュールは `npm run build:explore` など該当の build。
- ローカルの目視は、explore `5173`、sort `5174`、trade `5175`、invade `5176`、restore `5177`。ホストが localhost のとき、モジュール間リンクはこのポート（`packages/shared/src/constants.ts`）。
- 指示されたファイル以外を片付けない。無関係なリファクタを混ぜない。
- `packages/shared` の公開型、HubSave、モジュール間の URL、経済の意味を変えるときは、同じ PR で契約文書も更新する。
- 画面の文言は決定仕様の全文を使う。仕様が「今 X c → Y c」と書き、正式仕様が「救助費用：所持金の半分（今 X c → Y c）」と「撤退」「やめる」なら、正式仕様の全文にする。短縮や言い換えをしない。
- PR は draft で作る。本文の先頭に Agent Declaration（Who / What / Why / Scope / Status）を置く。
- ブランチは `cursor/` で始め、既存の作業ブランチがある修正はそのブランチに足す。別 PR に分けない。
- `docs/STATUS.md` を、止める前に実体へ合わせる。デプロイの成否は `gh run list --workflow "Deploy Modules Preview" --branch main --limit 5` で見る。run の head SHA がマージコミットと一致すること。

## 7. 2026-10-09 時点の地点

この節は古くなる。着手前に STATUS と `gh` で上書きする。

- main は #248 のマージ `409c4b7`（項目5-2b）。Deploy Modules Preview run `37854085456` は success（2026-10-08T22:32:11Z）。プレビューの操作はしていない（`preview_play: NOT_RUN`）。
- STATUS の「最後にデプロイ成功」が #245 のままなら、Actions を正として直す。
- 予定順の次はお金まわり、その次が段位（項目3）、背負い（項目4）。どれも、その件の `SPEC_DECISION` が Issue に載るまで着手しない。
- 5-3 と真盤は決定の記録がある。命令に入るまで実装しない。

## 8. 読み始める順

1. このファイル
2. 起動メッセージの JSON（`recipient` と `type`）
3. その Issue のコメント
4. [`../STATUS.md`](../STATUS.md)、開いている PR、main の最新デプロイ
5. `SPEC_DECISION` が名指しした仕様ファイルと、触るパッケージの契約
