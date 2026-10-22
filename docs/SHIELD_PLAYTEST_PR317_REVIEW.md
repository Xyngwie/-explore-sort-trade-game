# PR317 第三者テスト再検証（2026-10-22）

基準main: `f53788cb19b4b61d29663d66f50accfc9de4e05c`。ゲームコード変更なし。

原本は [shield-playtest-pr317-original.json](verification/shield-playtest-pr317-original.json)、公開版の独立再検証は [circuit-purchase-pr317-review.json](verification/circuit-purchase-pr317-review.json)。

| 指摘 | 再検証結果 |
| --- | --- |
| SHIELD-ISSUE-01 購入無反応 | ハンドラ不良は未再現。ネイティブ確認ダイアログを承認すると5,000,000c→4,990,000c、回路2→3枚。再読込後も保持。取消では残高・在庫とも変化なし。元テスターのダイアログ処理は不明であり、取消が原因だったと断定しない。 |
| SHIELD-ISSUE-02 Offline装備不可 | Offlineを理由とした拒否は未再現。初期装備で部隊上限1枚を使用済みのため追加装備は上限超過通知。初期回路を外すとverify_trueをOfflineのまま装備できた。ただし回路効果は0でP盾として使えない。 |

## 回路の識別と検証範囲

- `false-1x1-…` は初期1×1回路であり、通常盾回路ではない。名前付き効果の判定対象は2×2以上で、当該初期回路のeffectKeyはnull。
- `verify_true` はRestore検証用の未解2×2真盤。付与時はOffline、effectKeyはnull。現行生成ルールで完全解にした場合の効果はprotectでありP盾ではない。
- 別ボタン「検証用・完璧」のverify_perfectは完成盤だが、現行効果はlureでありP盾ではない。
- したがって、この回路識別を前提とする盾・屹立の機能確認は未確認として扱う。盾機能の不具合が確定したという意味ではない。
- 原本のtestResultsはPASS 4件・BLOCKED 11件・FAIL 0件。summaryのPASS 4件・BLOCKED 10件・FAIL 1件と不一致。購入指摘は別のissues欄にあり、原本は改変せず保存した。
- 原本の環境は390×844のブラウザーエミュレーション。今回もPlaywrightの隔離ブラウザーであり、物理スマートフォン確認はNOT_RUN。

## 再実行と第三者への手順

`PLAYWRIGHT_MODULE`にPlaywright Coreの場所、必要なら`CHROMIUM_PATH`を設定して実行する。

```sh
node scripts/verify-circuit-purchase-review.cjs
```

公開HUBに新規の隔離コンテキストを作り、シード読込、購入確認の取消/承認、再読込、装備上限通知、初期回路を外した後のOffline装備を検証する。既存ユーザーのセーブには触れない。対象URLは`TRADE_BASE_URL`で変更可能。通常のプレイヤー画面で確認するときも、購入確認を明示的に承認し、装備拒否時は通知文と部隊上限を記録する。

盾検証ではIDや真盤/偽盤だけで判定せず、実際の効果shield/p_shieldと装備枠を確認する。既存の`scripts/verify-shield-circuit.cjs`、`scripts/verify-barricades.cjs`には対応する隔離データの準備例がある。テストデータによる機能確認と、通常プレイの入手・成長経路の確認は分ける。既存の検証用真盤を完成済みP盾へ置き換える変更は行っていない。

今後の準備方式は [仕様質問T1](spec-questions/shield-test-fixture.json) で判断を求める。新しい公開テスト機能の実装は未着手。今回は文書・ブラウザー検証スクリプトのみで、全workspaceテスト/型検査/本番ビルドはNOT_RUN。公開版で上記3ケースPASS。マージ・デプロイは行わない。
