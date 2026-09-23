# Restore v0（Module 5 ドラフト仕様 — 精密回路修復）

**ステータス:** ドラフト仕様 / プレイアブル厚みスタブ（`packages/restore`）· ハンドオフ **キー契約**（trade UI ナビは Hub 側）· 2026-09-23  
**性質:** [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) §3.5 と `CircuitBoardState` を落とした **V0 ドラフト**。不完全基板＋稀な可解コア、成果語彙、刻印ロックまでローカルで触れる。フルソルバ／宇宙レイヤは非スコープ。  
**系譜:** Slitherlink 風の回路復元（高価値ワンオフ）

関連: [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) §3.5、[`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md)。
- 拡張の与太話（回路パラドックス／cosmos aspiration、未実装）: [`RESTORE_CIRCUIT_PARADOX_V0.md`](./RESTORE_CIRCUIT_PARADOX_V0.md)

> **URL ナビはまだ結ばない。** クエリ鍵・型・build/parse は [`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md) / `@estg/shared` を正とする。  
> **タイマー圧なし**（制限時間で失敗させない）。

---

## 1. ひとことで

Slitherlink 系の **精密回路修復**。日常の薄利多売（sort）とは別軸の、高価値ワンオフ成果を想定する任意／イベントレイヤ。

---

## 2. スコープ（V0 ドラフト）

| 含む（仕様として書く） | 含まない（非ゴール） |
|---|---|
| 成果状態: Fully Awakened / Bypass / Offline | 本編フル Slitherlink ソルバ |
| 不完全基板生成（矛盾／過剰数字／ノイズ）+ 稀な Perfect 注入 | HubSave v3 版上げ（v2 加算は trade 側で実施） |
| `CircuitBoardState` / edgeState encode/decode | タイマー／タイムアタック |
| プレイアブル「精密回路修復」+ 刻印ロックスタブ | explore/sort/trade/invade パッケージ改変 |
| digit 充足スコアと outcome 分類 selftest | Multiverse / 兵種解放 / 報酬本バランス |

---

## 3. 成果状態（願望 → V0 語彙）

| ID | 表示（仮） | 意味（願望） |
|---|---|---|
| `fully_awakened` | Fully Awakened | 回路が完全復元。高価値ワンオフ成果 |
| `bypass` | Bypass | 部分迂回で稼働。中間成果 |
| `offline` | Offline | 未修復／放棄。成果なしまたは最小 |

プレイヤーを時間で追い詰める失敗条件は置かない（間違えた線を直せる／中断して Offline を選べる、など）。

### 3.1 設計哲学メモ（願望 → ローカル厚み）

完全に解ける盤は稀な最上位の「true」コアとし、大半は意図的に矛盾や誤りを含むハズレ（**flawed substrate**）とする。部分解決でもプレイヤーの手間を **Bypass** として性能向上に反映し、職人の腕前を感じられる余地を残す。

**ローカル実装（`packages/restore` · 2026-09-23）:**
- 生成器は多数派を **flawed_majority**（hazard: `contradiction` / `overdigit` / `dense_noise`）にし、Perfect は seeded injection（`PERFECT_CIRCUIT_*_RATE`）のみ。
- スコアは digit satisfaction。成果は **Fully Awakened**（単一ループ＋数字 100%）/ **Bypass**（部分進捗）/ **Offline**（未着手・放棄）。
- Perfect クリア時は `locked` + 刻印名スタブ（`lastEditorName`）。タイマー圧なし。
- 兵種解放（scout / armor / raid）・Multiverse・HubSave v3 は **まだ未実装**（非スコープ）。

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


## 5.0. プレイアブル厚み（packages/restore · 2026-09-23）

| 項目 | 内容 |
|---|---|
| 多数派基板 | `rarity=flawed_majority`。hazard 比率おおよそ contradiction 45% / overdigit 30% / dense_noise 25% |
| 稀少基板 | `rarity=perfect_rare`。seeded true injection（本番 ~1%、DEV ~33%、`?perfectRate=`）または `verify-true-2` |
| スコア | 満たした digit 数 / 手がかり数（UI メーター） |
| 成果 | Fully Awakened（閉ループ＋ digit 100%）→ 刻印ロック可 / Bypass（部分進捗）/ Offline（放棄・未着手） |
| ローカル操作 | Commit Bypass · Abandon→Offline · 次の基板（`?seed=`）· 刻印名入力スタブ |
| 非スコープ | Multiverse、scout/armor 解放、HubSave v3、タイマー |

---

## 5.4. Hub 永続（Module 3）

restore→trade 取込後、回路は **`HubSave.hub.circuits`**（`HubCircuitRecord`: `circuitId` + `circuitBoard` + `outcome` + `lastEditorName?` + `locked?`）に upsert される。  
trade ハンガーの一覧から選択して trade→restore URL を開ける。詳細: [`TRADE_HANGAR_V0.md`](./TRADE_HANGAR_V0.md)。

### 5.4.1 成果ボーナス（track 1 · hub/sortie）

`aggregateCircuitBonuses(hub.circuits)`（`packages/shared/src/circuit-bonuses.ts`）が outcome を集計する。仮バランス:

| outcome | craftMultiplierBonus | repairDiscount | durabilityBuffer |
|---|---|---|---|
| `fully_awakened` | +0.10 | 20% | 10 |
| `bypass` | +0.05 | 10% | 5 |
| `offline` | 0 | 0 | 0 |

加算後に soft cap（craft +0.25 / repair 50% / buffer 25）。trade は修理割引・配備 URL の `circuitBonuses`、explore は帰還摩耗に緩衝を適用。invade 非対象。



### 5.4.2 刻印（署名）と Perfect Circuit ロック（願望→仕様メモ）

1. **刻印:** restore→hub 保存時、最終編集者名 `lastEditorName`（刻印）を `HubCircuitRecord` / `CircuitBoardState` に記録する。trade ハンガーの「署名」（localStorage `wreckline.craftSignature.v0`、一度確定で変更不可）を渡し、upsert 時にスタンプする。
2. **Perfect Circuit ロック:** 完全クリア（スタブ判定: `outcome===fully_awakened` かつ `perfect: true`、または digit satisfaction 100% + 単一ループ閉合）の回路は以降 **編集不可**（`locked: true`）。辺トグル・outcome 上書きを拒否し、restore UI に刻印と「完璧な回路・編集不可」を表示する。
3. **非 Perfect:** 編集可。辺／outcome 更新のたびに `lastEditorName` を刷新する。既に `locked` のレコードへの upsert は拒否（盤面維持）。

加算フィールド（HubSave v2 のまま）: `lastEditorName?`, `locked?`（board 側に `perfect?` も可）。ヘルパ: `isCircuitLocked` / `isPerfectCircuitClearance` / `stampCircuitEditor` / `sanitizeEditorName`。

プレイテスト用の保証可解盤（`puzzleId=verify-true-2` · 2×2 · 手がかり全 2）は trade ハンガーから授与。詳細・ネタバレは [`TRADE_HANGAR_V0.md`](./TRADE_HANGAR_V0.md) §4.5.2。

**Perfect Circuit 注入率（実装メモ）:** デモ／シード生成では、自然な乱数手がかりではなく **seeded true-board injection** で稀に真盤を混ぜる。本番既定 **1%**（`PERFECT_CIRCUIT_PROD_RATE`）、DEV/localhost または `?perfectRate=` で一時 **33%**（`PERFECT_CIRCUIT_DEV_RATE`）。ドキュメント上の代替 **0.1%** は `PERFECT_CIRCUIT_PROD_RATE_ALT` / env `VITE_PERFECT_CIRCUIT_RATE=0.001`。なお、正式版のプレイヤー向け UI では「真盤気配」等の注入表示を抑止し、真盤注入だったことをプレイヤーに知らせない。詳細は [`PERFECT_CIRCUIT_PROBABILITY.md`](./PERFECT_CIRCUIT_PROBABILITY.md) §8。



## 5.6. 回路効果値（effect value）

共有純関数: `computeCircuitEffectValue` / `computeCircuitEffectForBoard`（`packages/shared` · `circuit-effect.ts`）。

| 規則 | 内容 |
|---|---|
| ループなし | **効果 = 0**（効果が非活性） |
| ループあり | 充足した数字マスの寄与を合計 |
| 数字 d≥1 | 充足時に **d** を加算 |
| 数字 0 | 不完全 / wounded 以下では **0**。**Perfect** 回路では充足した 0 を各 **4** として加算 |
| Perfect 判定 | 数字 100% + 単一閉ループ、または `perfect` / `locked` フラグ |

表示: restore 盤面横の充足メーター＋効果値、trade「次の出撃」の回路サマリー。

## 5.5. ハンドオフ契約（キーのみ）

正本: [`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md)。

| 方向 | 主なキー | 備考 |
|---|---|---|
| trade → restore | `circuitId?`, `circuitBoard?` | compact = `encodeCircuitBoardCompact` |
| restore → trade | `circuitId?`, `circuitBoard`, `circuitOutcome` | outcome: fully_awakened / bypass / offline |

shared: `buildTradeToRestoreUrl` / `buildRestoreToTradeUrl`。

## 6. スタブ受け入れ条件（ローカル厚み）

1. 小さな盤で辺をトグル（empty → line → mark → empty）できる  
2. `encodeEdgeState` / `decodeEdgeState` 往復で盤が復元できる  
3. digit 充足とループから `fully_awakened` | `bypass` | `offline` を分類できる（手動 Commit / Abandon 可）  
4. UI にタイマーを出さない  
5. 大半の生成盤は flawed（hazard 付き）；Perfect は注入または `verify-true-2` のみ  
6. Perfect クリア相当では刻印名スタブと lock を restore→trade ペイロードに載せる  
7. `npm run test -w @estg/restore` が通る（生成比率・outcome 分類を含む）  

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

- **位置づけ:** V0 ドラフト仕様 + プレイアブル厚みスタブ。ビジョンの Module 5（不完全多数／Perfect 稀少）をローカルで体験できる受け皿。
- **次:** Hub 側ナビの磨き、本ソルバは別チケット。兵種解放・cosmos は非スコープのまま。
