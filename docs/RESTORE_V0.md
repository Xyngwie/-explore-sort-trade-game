# Restore v0（Module 5 ドラフト仕様 — 精密回路修復）

**ステータス:** ドラフト仕様 / 薄いスタブ（`packages/restore`）· ハンドオフ **キー契約のみ**（UI 未配線）· 2026-09-19  
**性質:** [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) §3.5 と `CircuitBoardState` を落とした **V0 ドラフト**。パズル本編の本判定は薄いスタブ止まり。  
**系譜:** Slitherlink 風の回路復元（高価値ワンオフ）

関連: [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) §3.5、[`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md)。

> **URL ナビはまだ結ばない。** クエリ鍵・型・build/parse は [`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md) / `@estg/shared` を正とする。  
> **タイマー圧なし**（制限時間で失敗させない）。

---

## 1. ひとことで

Slitherlink 系の **精密回路修復**。日常の薄利多売（sort）とは別軸の、高価値ワンオフ成果を想定する任意／イベントレイヤ。

---

## 2. スコープ（V0 ドラフト）

| 含む（仕様として書く） | 含まない（非ゴール） |
|---|---|
| 成果状態: Fully Awakened / Bypass / Offline | 本編 Slitherlink ソルバ・生成器 |
| `CircuitBoardState` インタフェース草案 | HubSave v3 版上げ（v2 加算は trade 側で実施） |
| `edgeState` のサイズ感と encode/decode スタブ | タイマー／タイムアタック |
| 薄いスタブページ「精密回路修復」 | explore/sort/trade/invade への **UI ナビ配線** |
| 後続スタブ受け入れ条件 | 報酬経済の本バランス |

---

## 3. 成果状態（願望 → V0 語彙）

| ID | 表示（仮） | 意味（願望） |
|---|---|---|
| `fully_awakened` | Fully Awakened | 回路が完全復元。高価値ワンオフ成果 |
| `bypass` | Bypass | 部分迂回で稼働。中間成果 |
| `offline` | Offline | 未修復／放棄。成果なしまたは最小 |

プレイヤーを時間で追い詰める失敗条件は置かない（間違えた線を直せる／中断して Offline を選べる、など）。

---

## 4. CircuitBoardState（草案）

軽量セーブ案: **おおよそ ~0.4KB** 程度に収まることを目標にする。

```ts
/** Module 5 — packages/shared に型 + encode/decode スタブ */
export type CircuitOutcome = "fully_awakened" | "bypass" | "offline";

export type EdgeMark = 0 | 1 | 2;
// 0 = empty / unknown
// 1 = line (導通)
// 2 = mark / ×（通さない）

export interface CircuitBoardState {
  v: 1;
  /** セル格子サイズ（Slitherlink 同様、辺は cols*(rows+1) + rows*(cols+1) ） */
  cols: number;
  rows: number;
  /**
   * 辺の状態を詰めた文字列（base64url）。
   * 各辺 2 bit（EdgeMark）。水平辺を先に行優先、続けて垂直辺。
   */
  edgeState: string;
  /** 確定時のみ。プレイ中は省略可 */
  outcome?: CircuitOutcome;
  /** 任意のパズル ID / シード（短文字列） */
  puzzleId?: string;
}
```

### 4.1 edgeState サイズ目安

例: `cols=8`, `rows=8` のとき

- 水平辺: `cols * (rows + 1) = 72`
- 垂直辺: `rows * (cols + 1) = 72`
- 合計 144 辺 × 2 bit = 288 bit ≈ 36 byte → base64url で **~48 文字**
- ラッパ JSON（`v` / `cols` / `rows` / `puzzleId`）込みでも **~0.2–0.4KB** に収まる想定

より大きい盤でも「数百バイト」を超えないよう、辺はビットパック必須。

### 4.2 共有 API（スタブ）

`packages/shared`:

- `CircuitBoardState` / `CircuitOutcome` / `EdgeMark`
- `edgeCount(cols, rows)`
- `encodeEdgeState(marks: EdgeMark[]): string`
- `decodeEdgeState(encoded: string, expectedEdges: number): EdgeMark[]`
- `createEmptyCircuitBoard(cols, rows, puzzleId?): CircuitBoardState`

本編ルール検証・ループ閉合判定は **まだ置かない**。

---

## 5. 非ゴール（明示）

- 制限タイマー／タイムアタック失敗
- 他モジュールへの **UI ナビ結線**（キー契約は HANDOFF_M45）
- 自動ソルバ・ヒントエンジン
- HubSave v3 版上げ（`circuits` は HubSave v2 加算で trade 永続済み）
- sort の日常ループへの強制挿入

---


## 5.4. Hub 永続（Module 3）

restore→trade 取込後、回路は **`HubSave.hub.circuits`**（`HubCircuitRecord`: `circuitId` + `circuitBoard` + `outcome`）に upsert される。  
trade ハンガーの一覧から選択して trade→restore URL を開ける。詳細: [`TRADE_HANGAR_V0.md`](./TRADE_HANGAR_V0.md)。

## 5.5. ハンドオフ契約（キーのみ）

正本: [`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md)。

| 方向 | 主なキー | 備考 |
|---|---|---|
| trade → restore | `circuitId?`, `circuitBoard?` | compact = `encodeCircuitBoardCompact` |
| restore → trade | `circuitId?`, `circuitBoard`, `circuitOutcome` | outcome: fully_awakened / bypass / offline |

shared: `buildTradeToRestoreUrl` / `buildRestoreToTradeUrl`。

## 6. 後続スタブ受け入れ条件（まだ実装しない）

1. 小さな固定盤で辺をトグル（empty → line → mark → empty）できる  
2. `encodeEdgeState` / `decodeEdgeState` 往復で盤が復元できる  
3. 完了操作で `fully_awakened` | `bypass` | `offline` のいずれかを選べる（本判定ロジックは仮でよい）  
4. UI にタイマーを出さない  
5. 他モジュールへ遷移するリンクを持たない（未配線のまま）  
6. `npm run typecheck` と `packages/restore` の typecheck が通る  

---

## 7. パッケージ / 試し方（ひな型）

```bash
npm install
npm run dev:restore
# http://localhost:5177/  — 「精密回路修復 — ひな型」
```

- パッケージ: `packages/restore`（`@estg/restore`）
- 共有型: `@estg/shared` の `CircuitBoardState` ほか

---

## 8. 採否メモ

- **位置づけ:** V0 ドラフト仕様 + 空の Vite ひな型。ビジョンの Module 5 欄の受け皿。
- **次:** UI ナビ配線（HANDOFF_M45 builder を完了ボタンに接続）。親（参謀）承認後にチケット化。
