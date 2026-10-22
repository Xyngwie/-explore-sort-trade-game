# #319 公開版の第三者検証準備・UX調査

2026-10-22、main `d093141a54e0e788d173182df26d49ee5c0ac75c`。
#319はMERGED。同コミットの[公開デプロイ39777940991](https://github.com/Xyngwie/-explore-sort-trade-game/actions/runs/39777940991)はSUCCESS。公開HUBの配信JS `assets/index-drgZncmp.js` 内にも同じフルSHAが含まれることを確認した。

Gemini用手順：[15項目のJSON](verification/alpha-lab-319-public-test-plan.json)。各項目は未実行のテンプレートであり、下記の限定調査のPASSを転記してはいけない。
各ケースの手順・判定・証拠・通常セーブの前後比較を記載。コピー/初期化はテスター本人が確認し承認する。画面比較だけで保存全キー不変と断定しない。

## 証拠の区分

- 第三者報告：run-20261022-alpha-lab-001、#318プリセット15/15 PASS。#319自由編集UIの検証結果ではない。
- 公開版実測：隔離した使い捨てChromium、390x844モバイルエミュレーション。通常HUBから公開入口、ALPHA_LAB/DEBUG_FIXTURE表示PASS。
- 公開版実測：6プリセットを順に切替、同一プリセットをもう一度生成。各操作でdebug_run変更、URL/保存メタ一致、実行中World由来の状態確認に表示される機体位置・盾ID/HP/所有先が切り替わる。途中停止を挟んでも旧セッション残留は未再現。
- 公開版実測：BARRICADE_PERSISTENCE_READYで設置盾をタップ。近くの地面盾もタップ範囲内だが、撤去パネルのみ表示され地面盾候補は0件。SHIELD-ISSUE-02の競合を再現。
- コード照合：個別指示pending中と「残骸盾」の明示的対象指定は先に処理される。一般タップは設置盾→地面盾→僚機→移動の順。密集時に先の対象が後の対象を隠す。
- 物理スマートフォン・人間による公開操作：NOT_RUN。

再実行：`PLAYWRIGHT_MODULE=/path/to/playwright-core node scripts/verify-lab-public-ux.cjs`。
公開版に対する入口/切替/密集の調査専用で、テスターの既存プロフィールは使わない。
生データ：[公開実測JSON](verification/alpha-lab-public-ux-20261022.json)。画面証拠は実行時 `/tmp/public-lab-ux.png`。

## 判定と次の処置

SHIELD-ISSUE-01：未再現。強制再起動などの推測修正はしない。今回の7切替は全30通りの組合せやすべての編集途中/チェックポイント状態の網羅ではない。継続報告には切替前後preset・debug_run・確認ダイアログの承認有無・状態JSONを添付してほしい。

SHIELD-ISSUE-02：再現。独立した最新main起点のDraft #321で、重複候補があるときだけ候補を選べるよう修正する。単独対象・明示的個別指示・剥離対象指定を維持。物理・盾値・作業時間・保存契約は変更しない。

これらのIDは、以前の同名ID「回路購入」「Offline回路」の指摘とは別件。
本PRは文書・調査スクリプトのみ。ゲームコード変更なし、デプロイNOT_TRIGGERED。マージ・デプロイは行わない。
