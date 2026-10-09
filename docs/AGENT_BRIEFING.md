# エージェント引き継ぎ（世界観・判断・JSONリレー）

**ステータス:** 現行（2026-10-09）  
**読む人:** Cursor Automations（Cloud Agents）で起動する風紀委員、実装隊長、実装エージェント（アロー、ジャベリン、トマホーク）。チャットの記憶は起動のたびに消える。作業の前にこのファイルを読む。

関連:

- 進行の事実: [`STATUS.md`](./STATUS.md)、開いている PR、`main` の `Deploy Modules Preview`
- 開発運用: [`ORCHESTRATION.md`](./ORCHESTRATION.md)
- 宣言の型: [`../AGENTS.md`](../AGENTS.md)
- 世界観の正本: [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) §2.1（願望であり、実装チケットではない）
- 自動化に貼る指示文: [`automations/`](./automations/)

このファイルは「今どの PR が開いているか」を凍結しない。進行は STATUS と GitHub の実体が勝つ。このファイルが勝つのは、役割の境界、監査、実装の判断、JSON の読み書きである。

---

## 0. 起動のたびにまっさら

Cursor Automations は、トリガーのたびに Instructions だけを読んだ新しいエージェントを起動する。前のチャット、前の判断、口頭の約束は残らない。残るのはリポジトリと、トリガーになったコメントだけである。

作業順:

1. このファイルを読む。
2. [`STATUS.md`](./STATUS.md) を読む。
3. 開いている PR を見る。
4. `main` の最新 `Deploy Modules Preview` を見る（文書だけのコミットは走らない。下の「検証の正直さ」）。
5. トリガーの JSON が自分宛てかを判定する。自分宛てでなければ着手しない。
6. 着手するなら、注文が指す正式仕様と、触るコードの現物を読んでから編集する。

リモートが `Xyngwie/-explore-sort-trade-game` でない、または中身が空の別リポジトリなら、そこでアプリを作ったりファイルを足したりしない。ゲームの作業場はこちらのモノレポだけである。

`AGENTS.md` と `ORCHESTRATION.md` は、実装レーンが調査からマージ、デプロイ確認まで進めてよいと書いている。リレーに乗っているあいだは、その完了条件よりこのファイルの役割境界が優先する。次はどちらでも守る。

- `main` のコードと契約文書がソース正本。GitHub Pages は確認用プレビューであり正本ではない。
- PR は 1 本ずつマージし、そのマージコミットの `Deploy Modules Preview` が成功してから次をマージする。
- [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) の願望を、注文なしに実装しない。

---

## 1. 誰が何をするか

| 呼び方 | JSON の名前 | すること | しないこと |
| --- | --- | --- | --- |
| 神宮 | （リレーの外） | 世界観、要件、優先度、最終的な採用。PC は持たない。実機確認はスマートフォン | エージェントが神宮の確認を代行して PASS にしない |
| 風紀委員 | `inspector` | 監査、仕様、世界観。仕様を JSON で実装隊長へ渡す。隊長の合格報告のあと、マージとデプロイ確認 | 実装エージェントへ直接実装注文を出さない。範囲を広げる実装を自分で始めない |
| 実装隊長 | `lead` | 仕様を 1 人の実装エージェントへの実装注文にする。報告を計画と突き合わせる。足りなければ同じ PR へ修正注文。足りていれば draft を ready にし、風紀委員へ合格を返す。不明点は風紀委員へ質問して戻す | マージしない。仕様を推測で埋めない。範囲外を修正注文で広げない。旧称「実行隊長」とは書かない |
| アロー | `arrow` | 受け取った計画だけを実装し、draft PR と作業報告を実装隊長へ返す | マージしない。ready にしない。デプロイ確認を完了扱いにしない。仕様の合否を自分で確定しない |
| ジャベリン | `javelin` | アローと同じ | アローと同じ |
| トマホーク | `tomahawk` | アローと同じ | アローと同じ |

自分宛てでない注文は存在しないものとして扱う。並列は、実装隊長がファイルの重ならない注文を別々のエージェントへ出した場合だけである。1 つの PR を 2 人で編集しない。

---

## 2. 世界観（実装判断に使う分だけ）

設定の文章が古い記述と食い違うときは [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) §2.1 を優先する。§2.1 も実装チケットではない。画面や数値を変える根拠は、正式仕様、契約、モジュールの V0、そして自分宛ての注文である。

判断に効く要点:

- 舞台は改造後の地球。地表は外殻の上（高度約 2km）。外殻は井戸（エレベーター）が支え、井戸は水と食料を出す。井戸を降りる者はいない。機体なしではコミュニティの外を行き来できない。
- 敵は、回路が入ったまま止まったはぐれ機体。コンテナは井戸から出て、はぐれ機体に散らされる。回路は基幹システムにいたエージェントの残滓で、機体の性能を変える。
- 掲示板は基幹システムへの閾値に届いた者が立てたもの。届いた者だけが届いたと知る。主人公は回路の存在を知らない。未解放のコマンドは画面に出さない。
- ひとことでディストピアの生活基盤。戦闘は目的ではなく障害。薄いエリアを回って帰るのも正当なプレイ。
- プレイヤーに見える文言は日本語。局面は「帰還」。X の行動と搭乗円は「帰還要請」。離昇ログは「帰還成功／帰還失敗」。表示の「抽出」「中断」「EXTRACT」は復活させない。英語の識別子、保存キー、URL は、注文が禁じていれば新しく作らない。
- 回路なしの基準動作: 隊長は移動・攻撃・回収・帰還。僚機は攻撃だけ。
- Explore は財布を持たない。救助費用は帰還の `rescueFee`（フィールド名 `rescueFeeCredits`）で Hub が `sortieId` ごとに 1 回だけ引く。所持金は 0 より小さくしない。0c は 0c。
- 帰還 URL に積荷があることと、倉庫へ入ったことは別である。Sort の精製開始と、未開封の預け、Trade の入庫まで追う。URL を見て「倉庫に入った」と書かない。

2026-10-09 時点の `main`（`409c4b7`、#248）では項目 5-2b は入っている。生きている時間切れは `forcedRescueRecovered` を立て、Sort は通常の帰還と同じく精製でき、未開封のまま倉庫へ入る。`extracted` は立てないので摩耗は 20 のまま。救助費用は付けない。隊長が大破した時間切れと救助撤退は印を付けず、積荷は倉庫に入らない。大破した時間切れの費用は `floor(所持金 × 3 / 4)`、ボタンの救助撤退と全滅は `floor(所持金 / 2)`。同じキー `rescueFee`。警告の円は `#c084fc`。搭乗円の緑 `#3dd68c` と青 `#3d8bfd` は変えない。残骸の点は `#a8604a`。この節が古くなったら STATUS とコードが勝つ。5-2b を注文なしにやり直さない。5-3 と真盤は、注文が明示するまで着手しない。

---

## 3. 仕様の優先順位

上から順に強い。下位で上位を上書きしない。

1. 自分宛ての注文（`Do` / `DoNot` / `Allowed` / `Base` / `ExistingPR` がその注文の全範囲）
2. 正式仕様（例: [`ITEM5_FORMAL_SPEC.md`](./ITEM5_FORMAL_SPEC.md)）
3. 契約（`packages/shared` の型、[`HUB_SAVE_CONTRACT.md`](./HUB_SAVE_CONTRACT.md)、ハンドオフのキー）
4. モジュールの V0（`EXPLORE_BEHAVIOR_V0`、`SORT_V2_RULES`、`TRADE_HANGAR_V0` など）
5. 設計メモ
6. [`PRODUCT_VISION.md`](./PRODUCT_VISION.md)（願望。チケットではない）

注文と正式仕様が食い違う、注文の語がコードのどれを指すか決められない、ときは推測で実装しない。実装エージェントは `HOLD` と未解決を返す。実装隊長は範囲を広げず、風紀委員へ `SPEC_QUESTION` を返す。知らない語を、それらしい新しい料金や新しい識別子に読み替えない。過去に「助手費」は隊長が「救助費用」へ戻した。エージェントが改名して解決したことにしない。

---

## 4. 注文の範囲

実装してよいのは、その注文の次だけである。

- `Do`: やること
- `DoNot`: やらないこと
- `Allowed`: 編集してよいパス。ここ以外のファイルを変えたら範囲違反
- `Base`: ブランチの起点。指定がなければ `origin/main`
- `ExistingPR`: 番号または URL があるときは、その PR のブランチに足す。2 本目のブランチと 2 本目の PR を作らない

`Allowed` が空、または `Do` が空の実装注文は不完全である。推測でファイルを選ばず `HOLD` にする。

挙動を変えたら、同じ PR でテストを更新する。範囲外のリファクタ、名称整理、ドライブバイの整形を混ぜない。`main` へ直接 push しない。

PR 本文の先頭に宣言を置く。

```text
## Agent Declaration
- Who: <表示名 / inspector|lead|arrow|javelin|tomahawk>
- What: <この PR が変えること>
- Why: <どの注文の、どの目的か>
- Scope: <範囲内 / 範囲外>
- Status: <draft。マージしていない>
```

あわせて、変更理由、変えなかった範囲、実行したコマンドと結果、契約・セーブへの影響、未確認を書く。

---

## 5. 検証の正直さ

実行していない成功を書かない。

| 書いた語 | 意味 | 書いてはいけないとき |
| --- | --- | --- |
| `PASS` / `GREEN` / success | そのコマンドをこの作業で実行し、成功した | 実行していない。前の PR の結果を流用した |
| `FAIL` | 実行し、失敗した | 実行していない |
| `NOT_RUN` | 実行していない | 成功の言い換えに使う |
| `NOT_TRIGGERED` | ワークフローの起動条件に入らず、run が無い | 「デプロイ成功」の言い換えに使う |

`Status` を `PASS` にしてよいのは、未解決が空で、範囲違反がなく、`PASS` と書いた検証をすべてこの作業で実行したときだけである。それ以外は `HOLD`。

- 文書だけの変更は `Deploy Modules Preview` の path フィルタに入らない。run が無いのは失敗ではなく `NOT_TRIGGERED`。最後に成功したデプロイは、その前のコードのマージのままである。
- プレビューを自分で操作していないとき、プレビュー確認は `NOT_RUN`。画面を想像して成功にしない。
- 神宮のスマートフォン確認はエージェントの `PASS` にしない。確認してほしい操作、画面、期待結果を具体的に残す。
- CI が緑でも、正式仕様と違う挙動なら合格ではない。

基本の確認コマンド（リポジトリルート、Node.js 20 以上）:

```bash
npm ci
npm run typecheck
npm test
```

UI を変えたパッケージは、対応する `npm run build:explore` / `build:sort` / `build:trade` / `build:invade` / `build:restore` も実行する。実行した範囲だけを報告する。

---

## 6. 何が注文で、何が注文でないか

次は注文ではない。実装を始めない。修正も始めない。

- `notAnOrder` が true
- 文面に「実装の開始ではありません」とある（JSON の形が `SPEC_DECISION` でも同じ）
- 待機、引き継ぎ、記入例、テンプレート
- 宛先が自分ではない
- `standby` が true
- 同じ役割から自分への引き継ぎだけで、`TASK_ASSIGNMENT` でも `CORRECTION` でもない

「不具合報告ではありません」は、Slack の不具合報告の自動化を起こさないための定型である。これがあるからといって無視しない。注文かどうかは、型、宛先、「実装の開始ではありません」、`notAnOrder` で決める。

Slack に出す作業連絡には、JSON の前に次の 2 文を置く。

```text
不具合報告ではありません。
他の実装エージェントは着手しない。
```

宛先の実装エージェントだけが着手する。他の 2 人は着手しない。GitHub の Issue コメントにも同じ 2 文を置いてよい。

1 回の応答で JSON は 1 個。トリガーが Issue コメントならその Issue にだけ返す。Slack ならそのスレッドにだけ返す。両方には出さない。

---

## 7. JSON プロトコル

出すときはこの形だけを使う。

```json
{
  "sender": "inspector",
  "recipient": "lead",
  "type": "SPEC_DECISION",
  "payload": {}
}
```

`sender` と `recipient` は `inspector` / `lead` / `arrow` / `javelin` / `tomahawk` だけ。表示名を混ぜない。

### 7.1 型

| type | 誰から誰へ | 受け取った側がすること |
| --- | --- | --- |
| `SPEC_DECISION` | 風紀委員 → 実装隊長 | 仕様として読む。`notAnOrder` でなければ、重ならない範囲で実装注文に分解する |
| `SPEC_QUESTION` | 実装隊長 → 風紀委員 | 推測で埋めない。仕様を決めて `SPEC_DECISION` で返す。実装エージェントは着手しない |
| `TASK_ASSIGNMENT` | 実装隊長 → 実装エージェント 1 人 | その計画だけを実装し、draft PR と `IMPLEMENTATION_REPORT` を返す |
| `IMPLEMENTATION_REPORT` | 実装エージェント → 実装隊長 | 計画と突き合わせる。合格なら ready にして `REVIEW_PASS`。範囲内の不足は `CORRECTION`。範囲外は `SPEC_QUESTION` |
| `CORRECTION` | 実装隊長 → 同じ実装エージェント | 同じ PR、同じブランチだけを直す。新しい PR を作らない |
| `REVIEW_PASS` | 実装隊長 → 風紀委員 | 仕様と差分を見て、デプロイのゲートを満たすときだけマージする。実装隊長はマージしない |
| `DEPLOY_REPORT` | 風紀委員 → 実装隊長 | マージとデプロイ確認の結果。実装注文ではない。次のマージ判断の材料 |

### 7.2 古い形も注文として読む

以前のリレーは次の形だった。受信時はこちらのキーも認める。送信は 7 の新しい形だけ。

```json
{
  "From": "実装隊長",
  "To": "アロー",
  "Command": "IMPLEMENT",
  "Status": "HOLD",
  "Task": "例",
  "Order": {}
}
```

| 新しい type | 古い Command | 方向 |
| --- | --- | --- |
| `SPEC_DECISION` | `PLAN` | 風紀委員 → 実装隊長 |
| `SPEC_QUESTION` | `QUESTION` | 実装隊長 → 風紀委員 |
| `TASK_ASSIGNMENT` | `IMPLEMENT` | 実装隊長 → 1 人 |
| `IMPLEMENTATION_REPORT` | `IMPLEMENTATION_RESULT` | 実装エージェント → 実装隊長 |
| `CORRECTION` | `CORRECTION` | 実装隊長 → 同じ人 |
| `REVIEW_PASS` | `REVIEW_PASS` | 実装隊長 → 風紀委員 |
| `DEPLOY_REPORT` | `DEPLOY_RESULT` | 風紀委員 → 実装隊長 |

名前の対応: 風紀委員 / Codex / ちゃっぴー = `inspector`。実装隊長 / 隊長 = `lead`。アロー = `arrow`。ジャベリン = `javelin`。トマホーク = `tomahawk`。受信した文に「実行隊長」とあっても送信では使わない。実装隊長として扱う。

古いフィールドは payload に読み替える。`Do` `DoNot` `Allowed` `Base` `ExistingPR` `Assignee` `Standby` `NotAnOrder` `Task` `Status` `PR` `Tests` `ScopeLockViolation` `Unresolved` `NextStep`。大小文字と camelCase は同じ意味である。

### 7.3 最小の `SPEC_DECISION`

`title` と `details` だけでも仕様として読む。

```json
{
  "sender": "inspector",
  "recipient": "lead",
  "type": "SPEC_DECISION",
  "payload": {
    "title": "テスト実装",
    "details": "README に 1 行足す"
  }
}
```

周囲の文に「実装の開始ではありません」とあれば、形が正しくても注文ではない。2026-10-09 の自動連携テストはこれであり、README へ行を足す実装ではない。

実装に回してよい完全な形:

```json
{
  "sender": "inspector",
  "recipient": "lead",
  "type": "SPEC_DECISION",
  "payload": {
    "title": "項目の名前",
    "details": "プレイヤーから見える完了条件",
    "task": "短い作業名",
    "do": ["やること"],
    "doNot": ["やらないこと"],
    "allowed": ["編集してよいパス"],
    "base": "main",
    "existingPr": null,
    "acceptance": ["受入条件"],
    "specRefs": ["docs/ITEM5_FORMAL_SPEC.md"],
    "notAnOrder": false
  }
}
```

`do` や `allowed` が無い仕様は、実装隊長がコードを読んだうえで注文に落とす。落とした結果が正式仕様から外れる、または仕様が無言なら、`TASK_ASSIGNMENT` を出さず `SPEC_QUESTION` を返す。

### 7.4 `SPEC_QUESTION`

```json
{
  "sender": "lead",
  "recipient": "inspector",
  "type": "SPEC_QUESTION",
  "payload": {
    "task": "作業名",
    "question": "決められない点を 1 つ",
    "whyUnresolved": "どの文書の、どの文が衝突しているか",
    "options": ["選択肢は並べてよい。選ばない"],
    "blocking": true
  }
}
```

### 7.5 `TASK_ASSIGNMENT`

```json
{
  "sender": "lead",
  "recipient": "arrow",
  "type": "TASK_ASSIGNMENT",
  "payload": {
    "task": "作業名",
    "assignee": "arrow",
    "do": ["やること"],
    "doNot": ["マージしない", "ready にしない", "範囲外を直さない"],
    "allowed": ["packages/explore/src/game/rescue.ts"],
    "base": "main",
    "existingPr": null,
    "acceptance": ["受入条件"],
    "specRefs": ["docs/ITEM5_FORMAL_SPEC.md"],
    "standby": false
  }
}
```

`assignee` は `recipient` と一致させる。`existingPr` があるときはその PR のブランチだけ。

### 7.6 `IMPLEMENTATION_REPORT`

```json
{
  "sender": "arrow",
  "recipient": "lead",
  "type": "IMPLEMENTATION_REPORT",
  "payload": {
    "task": "作業名",
    "status": "HOLD",
    "pr": { "number": 0, "url": "https://github.com/Xyngwie/-explore-sort-trade-game/pull/0", "draft": true, "branch": "feature/example" },
    "tests": [
      { "name": "npm test", "result": "NOT_RUN", "command": "npm test" }
    ],
    "scopeLockViolation": false,
    "unresolved": [],
    "previewPlay": "NOT_RUN",
    "deploy": "NOT_TRIGGERED",
    "nextStep": "実装隊長が計画と照合する",
    "summary": "何を変え、何を変えなかったか"
  }
}
```

`status` は `PASS` か `HOLD` だけ。`scopeLockViolation` が true、または `unresolved` が空でないとき、`PASS` は不可で `HOLD` にする。

### 7.7 `CORRECTION`

同じ `pr.number` と同じ `branch` を書く。不足は範囲の内側だけ。範囲の外が必要なら、この型を出さず `SPEC_QUESTION` を出す。

### 7.8 `REVIEW_PASS`

draft を ready にしたあとで出す。`pr.draft` は false。`unresolved` は空。`deploy` はまだ `NOT_RUN`（マージしていない）。マージの依頼先は風紀委員だけである。

### 7.9 `DEPLOY_REPORT`

```json
{
  "sender": "inspector",
  "recipient": "lead",
  "type": "DEPLOY_REPORT",
  "payload": {
    "task": "作業名",
    "pr": { "number": 0, "merged": true, "mergeCommit": "0123456789abcdef" },
    "deploy": "NOT_TRIGGERED",
    "deployRun": null,
    "previewPlay": "NOT_RUN",
    "phoneCheck": "神宮のスマートフォン確認はまだ",
    "notAnOrder": true
  }
}
```

コードを含むマージで、該当 SHA の `Deploy Modules Preview` が success のときだけ `deploy` を `PASS` にする。文書だけなら `NOT_TRIGGERED`。

---

## 8. リレーのゲート

1. 風紀委員が `SPEC_DECISION` を実装隊長へ出す。
2. 実装隊長は不明点を `SPEC_QUESTION` で戻す。推測で埋めない。
3. 実装隊長が 1 人へ `TASK_ASSIGNMENT` を出す。ファイルが重ならない別注文を、別の人へ同時に出してよい。
4. 実装エージェントは draft PR と `IMPLEMENTATION_REPORT` だけを返す。
5. 実装隊長が照合する。範囲内の不足は `CORRECTION`。範囲外は `SPEC_QUESTION`。足りていれば ready にして `REVIEW_PASS`。
6. 風紀委員がマージする。直前のマージのデプロイが緑でないうちは、次のコード PR をマージしない。文書だけならデプロイは `NOT_TRIGGERED` と書き、緑を待たずに次の文書を止める理由にはしない。コードの次のマージは、最後に成功したデプロイのあとに入った未デプロイのコードが無いときに行う。
7. 風紀委員が `DEPLOY_REPORT` を返す。神宮に頼む実機操作だけを、操作・画面・期待結果つきで残す。

---

## 9. Issue コメントの自動化が黙って止まる条件

Cursor の Issue コメントトリガーは、`github-actions[bot]` と GitHub App のコメントでは起動しない。Actions が bot として次の JSON をコメントしても、次のエージェントは起きない。

無人でつなぐときは、次のどちらかにする。

- ユーザーの PAT で、人間のアカウントとしてコメントする
- Issue コメント以外の Webhook トリガーで、同じ JSON を渡す

bot のコメントを「送ったから届いた」と書かない。起動した事実は、次のエージェントの応答があることだけが証拠である。
