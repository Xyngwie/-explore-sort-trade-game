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
