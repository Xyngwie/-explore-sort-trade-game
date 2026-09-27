# @estg/restore

Module 5（restore）プレイアブル厚みスタブ。Slitherlink 風の精密回路修復。

- 仕様ドラフト: [`docs/RESTORE_V0.md`](../../../docs/RESTORE_V0.md)
- ハンドオフ契約: [`docs/HANDOFF_M45_V0.md`](../../../docs/HANDOFF_M45_V0.md)
- 共有: `@estg/shared` の `CircuitBoardState` / `parseTradeToRestoreSearch` / `buildRestoreToTradeUrl`
- **load:** trade→restore（`circuitId?`, `circuitBoard?` compact）を ingest。盤があれば hydrate、なければデモシード
- **return:** 現在の盤 + `circuitOutcome`（fully_awakened|bypass|offline）で 格納庫へリンク（outcome は chip）
- **基板:** 大半は意図的な不完全／危険基板（矛盾ブロック・過剰数字・ノイズ）。稀に Perfect 注入（可解コア）。盤は N×N 可変（2×2〜、新規の既定は 6×6、HUB から渡された盤はその盤のサイズ）。Perfect 注入は要求サイズで作る（2×2 は固定の `verify-true-2`、それ以外は解のループから数字を作る `perfect-true-v2-{c}x{r}-…`：ループは外周4辺に接し、解が1つに決まる範囲で数字を隠す。以前の `perfect-true-{c}x{r}-…` は全数字表示のまま再生成）
- **成果:** digit 充足＋**効果値**（ループなし→0、複数ループ時は**最小閉ループのみ**採点、Perfect 時 0→4）。Fully Awakened / Bypass / Offline。不完全盤は大きな Bypass 確定 CTA（案内に Bypass 時の効果値を表示。閉ループなしなら「効果0になります」）
- **UI フィードバック:** 有効（最小）閉ループの辺グロー、Bypass / Fully Awakened 効果値プレビュー、hazard ノイズ辺の干渉・破断フィードバック（JA）
- **ローカルループ:** `?seed=` で「もう一度」（次盤）、Commit Bypass / Abandon→Offline、刻印名スタブ
- `edgeState` を UI 状態 + 任意 localStorage（当該 puzzleId）に保存
- **タイマーなし**（制限時間で失敗させない）

```bash
npm run dev:restore
# http://localhost:5177/
npm run test -w @estg/restore
```
