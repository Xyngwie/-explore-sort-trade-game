# エージェント正本（世界観・監査・実装の判断）

新しい Cloud Agent は記憶を持たない。作業の前にこのファイルを読む。役割の手順は [`automations/`](./automations/) の Instructions にあり、このファイルと食い違うときは、このファイルを優先する。

このファイルは 2026-10-09 の神宮の決定で置いた。Cursor Automations は Issue コメントで起動し、毎回まっさらなエージェントが Instructions だけを読んで動き始める。

## 1. 誰が何をするか

| id | 名前 | すること | しないこと |
|---|---|---|---|
| `owner` | 神宮（xyngwie） | 世界観と仕様の最終判断。スマートフォンでの実機確認 | エージェント間の伝言 |
| `inspector` | 風紀委員 | 監査、仕様の決定と記録、実装隊長への `SPEC_DECISION`、届いた PR のマージ、デプロイ確認 | 機能のコードを書く。実装エージェントへ直接命令する |
| `lead` | 実装隊長 | 決定した仕様を `TASK_ASSIGNMENT` に分ける。作業報告を仕様と照合する。問題がなければ PR を ready にして風紀委員へ報告する。不明点は `SPEC_QUESTION` で差し戻す | 仕様を補う。マージする |
| `arrow` | アロー | 自分宛の実装命令だけを書き、draft PR と `WORK_REPORT` を返す | 仕様を広げる。マージする。他人の命令に反応する |
| `javelin` | ジャベリン | アローと同じ | 同じ |
| `tomahawk` | トマホーク | アローと同じ | 同じ |

流れは一方通行で、不明なときだけ戻る。

```text
神宮
  ↓ 判断
風紀委員  --SPEC_DECISION-->  実装隊長
風紀委員  <--SPEC_QUESTION--  実装隊長     （命令を書くと穴があるときだけ）
実装隊長  --TASK_ASSIGNMENT--> アロー / ジャベリン / トマホーク
実装隊長  <--WORK_REPORT----- 実装エージェント
実装隊長  --CORRECTION------> 同じエージェント   （照合で問題があったとき）
実装隊長  --PR_REPORT-------> 風紀委員           （照合が通ったあと）
風紀委員  --AUDIT_REJECT----> 実装隊長           （仕様と違うのでマージしない）
風紀委員  --DEPLOY_REPORT---> 実装隊長           （マージとデプロイ確認のあと）
```

実装隊長は、ファイルが重ならない作業なら、この流れと別に `TASK_ASSIGNMENT` を出してよい。重なるかどうかの判断は実装隊長がする。

## 2. 起動口

リレーの起動口は **GitHub Issue のコメント**である。JSON を Slack やチャットに置いただけでは、次の自動化は起動しない。2026-10-09 の README 追記テストは、このため実装隊長まで届かず止まった。

- 受け取った JSON への返事は、トリガーになった Issue のコメントに書く。
- 同じ JSON を Slack の `#webアプリ開発`（`C0C6MHPFB1A`）にも写す。これは人間が読む写しであり、第二の起動口ではない。
- Slack の写しの先頭は「不具合報告ではありません。」とする。実装を始めさせる文章を、JSON の外に書かない。
- `recipient` が自分でないコメントでは、何も書かず、何も変えない。
- 自分が出したコメントを、もう一度自分への仕事として扱わない。

## 3. 読む順番

1. このファイル
2. 自分の [`docs/automations/INSTRUCTIONS_*.md`](./automations/)
3. [`STATUS.md`](./STATUS.md)
4. 開いている PR（`gh pr list`）
5. `main` の最新デプロイ（`gh run list --workflow "Deploy Modules Preview" --branch main --limit 3`）
6. 今回の Issue コメントの JSON が指す仕様文書

`STATUS.md` と GitHub の状態が食い違うときは、GitHub を正として `STATUS.md` を直す。

## 4. 世界観（実装してよい範囲の外）

ディストピアの生活基盤ゲームである。戦闘は目的ではなく障害で、薄い場所を探索して帰ることも正しい遊び方である。回路で僚機が動けるようになり、拾った資源を拠点で精製し、機体を直して次の出撃へつなぐ。

これは [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) の願望である。未実装の願望を、今の仕様として実装しない。

今の実装の地図は次のとおり。

- `packages/explore` 探索。`packages/sort` 精製。`packages/trade` 拠点。`packages/invade` 戦線。`packages/restore` 回路の修復。
- モジュール間の型、セーブ、URL は `packages/shared` と [`HUB_SAVE_CONTRACT.md`](./HUB_SAVE_CONTRACT.md) が契約である。
- プレイヤーに見える言葉は日本語。局面は「帰還」、X と搭乗円は「帰還要請」。
- 出撃中にやられた機体は、どの終わり方でも大破になる。回路は残骸とセットで残り、戦場で回路だけを抜かない。盤を作り直すと残骸は消える。
- 隊長が大破しても即失敗にしない。撤退ボタンは大破した瞬間に出す。費用は所持金の半分で、確認は「今 X c → Y c」と「やめる」。生き残った僚機は置き去り。先に呼んだ搭乗円の中なら、残骸ごと無料で帰れる。
- 時間切れは強制救助。円が進行中なら通常の帰還を待つ。生きていれば無料で、半径の中だけ回収し、帰った機体の摩耗は 20。大破していれば所持金の 3/4。正本は [`ITEM5_FORMAL_SPEC.md`](./ITEM5_FORMAL_SPEC.md)。設計メモ [`CIRCUIT_SQUAD_DESIGN_V0.md`](./CIRCUIT_SQUAD_DESIGN_V0.md) §7.1 と食い違うときは正式仕様を優先する。
- 「4」の 1×1 回路は、付けると僚機が動ける回路である。最初の周回は実質単機である。
- 項目5に背負いは入っていない。背負いは項目4。活動量が尽きた残骸と充電は、バッテリーの消費と一緒に後回し。

2026-10-09 時点で、項目5-2b は #248（`409c4b7`）として main にあり、Deploy Modules Preview run `37854085456` は success である。プレビューの操作はしていない。次の実装は、新しい `SPEC_DECISION` が指すものだけである。5-3（戻るの無効化と途中保存）と真盤（初クリアまで 0%）は決まっているが、その `SPEC_DECISION` が無い限り着手しない。

## 5. 仕様の優先順位

上にあるものだけを実装する。下のもので上をひっくり返さない。

1. 神宮がその場で書いた決定（Issue コメント、または風紀委員が記録したあとの `SPEC_DECISION`）
2. その決定が指す正式仕様（項目5は `docs/ITEM5_FORMAL_SPEC.md`）
3. 契約文書（`HUB_SAVE_CONTRACT.md`、ハンドオフ、各 V0/V2）
4. `main` のコード
5. 設計メモの推奨。神宮が「推奨どおり」と言うまでは推奨ではない
6. `PRODUCT_VISION.md` は願望であり、仕様ではない

穴を実装で埋めない。命令を書いている途中で穴が見つかったら `SPEC_QUESTION` にし、その部分の `TASK_ASSIGNMENT` は出さない。

## 6. 監査の基準

テストとデプロイの値は `PASS`、`FAIL`、`NOT_RUN`、`NOT_TRIGGERED` だけを使う。走っていないテストを `PASS` にしない。

`scopeLockViolation` が true、または `unresolved` が空でないとき、`status` を `PASS` にしない。

`packages/**` を変えていない変更では、Deploy Modules Preview は走らない。これをデプロイ成功と呼ばない。値は `NOT_TRIGGERED`。文書だけの PR は、チェックが無くてもマージしてよい。

`packages/**` を変えたのにワークフローが走らないときは、文書だけの例外を使わず、止めて報告する。

プレビューを操作していないとき、`previewPlay` は `NOT_RUN` である。スマートフォンでの確認は神宮が行う。エージェントは「確認済み」と書かない。

#232 から #244 は、神宮が対象を指すまで監査しない。

## 7. コードを書くときの暗黙のルール

- 決定した範囲だけを変える。隣の整理やリファクタを混ぜない。
- 英語の識別子、保存キー、URL のキーを、仕様に無い限り足さない。帰還の種別は `extract`（摩耗 15）、`abort`（摩耗 20）、`fail`（摩耗 35）だけである。
- 救助費用は既存の `rescueFee` を使い、`sortieId` ごとに 1 回だけ引く。所持金は 0 より小さくしない。
- セーブの古い形は読めるようにする。
- `packages/shared` の契約を変えるときは、同じ PR で契約文書も直す。
- 画面の文言は、仕様に書いてある文をそのまま使う。短く言い換えない。
- Node.js 20 以上。ルートで `npm ci`。確認は変更したワークスペースの `npm run test -w <workspace>` と、必要な `npm run build:*`。
- ブランチは小文字の `cursor/<agent-id>-<短い内容>`。`main` へ直接 push しない。
- 実装エージェントの PR は draft で作る。マージするのは風紀委員だけである。
- PR 本文の先頭に、次を書く。

```text
## Agent Declaration
- Who: <id / 名前>
- What: <この PR が変えるもの>
- Why: <どの SPEC_DECISION または TASK_ASSIGNMENT か>
- Scope: <やる範囲 / やらない範囲>
- Status: <draft / ready / merged>
```

- 止まる前に `docs/STATUS.md` の先頭へ、何が main に入り、デプロイが走ったかを書く。走っていなければ走っていないと書く。

5-2b の続きで `forcedRescueRecovered` が main に入っている。正式仕様は「新しい識別子は作らない」と書いていた。入ってしまったものを、この文書のついでに剥がさない。次の作業で、仕様に無い識別子を足す先例にはしない。

## 8. JSON

Issue コメントには、JSON を一つだけ、フェンスして書く。キーは次で固定する。

```json
{
  "sender": "inspector",
  "recipient": "lead",
  "type": "SPEC_DECISION",
  "payload": {
    "title": "",
    "status": "PASS",
    "details": "",
    "source": "docs/ITEM5_FORMAL_SPEC.md",
    "in": [],
    "out": [],
    "unresolved": [],
    "scopeLockViolation": false,
    "tests": {
      "selfTest": "NOT_RUN",
      "typecheck": "NOT_RUN",
      "build": "NOT_RUN",
      "ci": "NOT_RUN",
      "previewPlay": "NOT_RUN",
      "deploy": "NOT_TRIGGERED"
    },
    "pr": null
  }
}
```

`sender` と `recipient` は `owner`、`inspector`、`lead`、`arrow`、`javelin`、`tomahawk` だけを使う。

`type` は次だけを使う。

| type | 差出人 → 宛先 | 意味 |
|---|---|---|
| `SPEC_DECISION` | inspector → lead | 決まった仕様。`unresolved` は空。`status` は `PASS` |
| `SPEC_QUESTION` | lead → inspector | 命令にできない穴。`status` は `HOLD`。その穴の実装命令は出さない |
| `TASK_ASSIGNMENT` | lead → arrow / javelin / tomahawk | 一人への実装命令。仕様の全文を `details` に書く |
| `WORK_REPORT` | 実装エージェント → lead | draft PR のあと。走ったテストだけ `PASS` または `FAIL` |
| `CORRECTION` | lead → 同じ実装エージェント | 照合で落ちた点。同じ PR を直す。新しい PR は作らない |
| `PR_REPORT` | lead → inspector | draft を ready にしたあと。マージはまだ |
| `AUDIT_REJECT` | inspector → lead | 仕様と違うのでマージしない |
| `DEPLOY_REPORT` | inspector → lead | マージしたあとのデプロイ確認 |

`TASK_ASSIGNMENT` の `payload` には、加えて `base`（起点の SHA）、`do`、`doNot`、`allowed`（触ってよいパス）を入れる。

`WORK_REPORT` と `PR_REPORT` の `pr` は `{ "number", "url", "draft", "head" }` である。

## 9. 古い運用文書との関係

[`ORCHESTRATION.md`](./ORCHESTRATION.md) のデプロイ、契約、検証の節は今も使う。同文書の「Codex が風紀委員」という役割分担は 2026-09-28 の記録であり、このファイルの表が現在の Cursor Automations の役割である。

[`AGENTS.md`](../AGENTS.md) は作業開始時の宣言と、Cloud Agent の起動手順である。役割の中身はこのファイルを読む。
