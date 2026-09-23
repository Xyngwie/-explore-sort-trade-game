# @estg/restore

Module 5（restore）プレイアブル厚みスタブ。Slitherlink 風の精密回路修復。

- 仕様ドラフト: [`docs/RESTORE_V0.md`](../../../docs/RESTORE_V0.md)
- ハンドオフ契約: [`docs/HANDOFF_M45_V0.md`](../../../docs/HANDOFF_M45_V0.md)
- 共有: `@estg/shared` の `CircuitBoardState` / `parseTradeToRestoreSearch` / `buildRestoreToTradeUrl`
- **load:** trade→restore（`circuitId?`, `circuitBoard?` compact）を ingest。盤があれば hydrate、なければデモシード
- **return:** 現在の盤 + `circuitOutcome`（fully_awakened|bypass|offline）で Hub（trade）へ戻るリンク
- **基板:** 大半は意図的な不完全／危険基板（矛盾ブロック・過剰数字・ノイズ）。稀に Perfect 注入（可解コア）
- **成果:** digit 充足を数え、Fully Awakened / Bypass / Offline をバナー表示。完全クリアは刻印ロック
- **ローカルループ:** `?seed=` で次の基板、Commit Bypass / Abandon→Offline、刻印名スタブ
- `edgeState` を UI 状態 + 任意 localStorage（当該 puzzleId）に保存
- **タイマーなし**（制限時間で失敗させない）

```bash
npm run dev:restore
# http://localhost:5177/
npm run test -w @estg/restore
```
