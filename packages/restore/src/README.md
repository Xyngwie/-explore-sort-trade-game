# @estg/restore

Module 5（restore）薄いプレイアブル・スタブ。Slitherlink 風の精密回路修復。

- 仕様ドラフト: [`docs/RESTORE_V0.md`](../../../docs/RESTORE_V0.md)
- ハンドオフ契約: [`docs/HANDOFF_M45_V0.md`](../../../docs/HANDOFF_M45_V0.md)
- 共有: `@estg/shared` の `CircuitBoardState` / `parseTradeToRestoreSearch` / `buildRestoreToTradeUrl`
- **load:** trade→restore（`circuitId?`, `circuitBoard?` compact）を ingest。盤があれば hydrate、なければデモシード
- **return:** 現在の盤 + `circuitOutcome`（fully_awakened|bypass|offline）で Hub（trade）へ戻るリンク
- `puzzleSeed` から小盤（既定 6×6）を生成、辺トグル（空→線→×）
- loop-closed? / digit satisfaction / Fully Awakened | Bypass | Offline
- `edgeState` を UI 状態 + 任意 localStorage（当該 puzzleId）に保存
- **タイマーなし**（制限時間で失敗させない）

```bash
npm run dev:restore
# http://localhost:5177/
```
