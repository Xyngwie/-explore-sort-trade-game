# Cursor Automations に貼る Instructions

各ファイルの全文を、その役割の Automation の Instructions に貼る。起動トリガーは GitHub の Issue コメントにする。Slack の `#webアプリ開発` は人間向けの写しであり、起動口にしない。風紀委員は、仕様の判断の前にそのチャンネルを読み、指示を出すときに神宮との会話を省略せず書き込む。質問の途中の確認は `docs/` に書き、一問ごとに Issue へ `SPEC_DECISION` を出さない。細部は番号、選択肢、★推奨で聞き、回答を待つあいだは ★の値で仮実装する。仮の値は「暫定」と書く。仮実装の PR は、回答がそろい、CI と確認スクリプトが緑になるまでマージしない。神宮の操作が要る連絡だけは、風紀委員が神宮（`U0C6KR8AD4Z`）へ DM する。DM も起動口にしない。

| Automation | 貼るファイル | 反応する JSON |
|---|---|---|
| 風紀委員 | [`INSTRUCTIONS_INSPECTOR.md`](./INSTRUCTIONS_INSPECTOR.md) | `recipient` が `inspector` |
| 実装隊長 | [`INSTRUCTIONS_LEAD.md`](./INSTRUCTIONS_LEAD.md) | `recipient` が `lead` |
| アロー | [`INSTRUCTIONS_ARROW.md`](./INSTRUCTIONS_ARROW.md) | `recipient` が `arrow` |
| ジャベリン | [`INSTRUCTIONS_JAVELIN.md`](./INSTRUCTIONS_JAVELIN.md) | `recipient` が `javelin` |
| トマホーク | [`INSTRUCTIONS_TOMAHAWK.md`](./INSTRUCTIONS_TOMAHAWK.md) | `recipient` が `tomahawk` |

判断基準の本体は [`../AGENT_CANON.md`](../AGENT_CANON.md) にある。Instructions と正本が食い違うときは正本を優先する、と各 Instructions に書いてある。

Issue コメントを受けて該当の Automation だけを起こす経路は `.github/workflows/agent-dispatcher.yml` である。各 Automation の Webhook にある Generate auth header のキーを、次の GitHub Actions secrets に入れる。`Bearer ` は付けても付けなくてもよい。

| 宛先 | secret 名 |
|---|---|
| 風紀委員 | `CURSOR_AUTOMATIONS_INSPECTOR` |
| 実装隊長 | `CURSOR_AUTOMATIONS_LEAD` |
| アロー | `CURSOR_AUTOMATIONS_ARROW` |
| ジャベリン | `CURSOR_AUTOMATIONS_JAVELIN` |
| トマホーク | `CURSOR_AUTOMATIONS_TOMAHAWK` |

キーが無いコメントは webhook を呼ばず、その Actions は失敗する。失敗したコメントは再実行されないので、secret を入れたあとに同じ JSON を新しいコメントとして書き直す。
