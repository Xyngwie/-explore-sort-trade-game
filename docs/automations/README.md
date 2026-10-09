# Cursor Automations に貼る Instructions

各ファイルの全文を、その役割の Automation の Instructions に貼る。起動トリガーは GitHub の Issue コメントにする。Slack は人間向けの写しであり、起動口にしない。

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
| アロー | `CURSOR_AUTOMATIONS_ARROW`（無ければ `CURSOR_AUTOMATIONS_ALLOW`） |
| ジャベリン | `CURSOR_AUTOMATIONS_JAVELIN` |
| トマホーク | `CURSOR_AUTOMATIONS_TOMAHAWK` |

キーが無いコメントは webhook を呼ばず、その Actions は失敗する。失敗したコメントは再実行されないので、secret を入れたあとに同じ JSON を新しいコメントとして書き直す。
