# Invade / Front v0（Module 4 ドラフト仕様）

**ステータス:** ドラフト仕様 / 薄いプレイアブル（`packages/invade`）· ハンドオフ配線済 · **前線＝マインスイーパ** · 2026-09-19  
**性質:** プロダクト会話と [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) から落とした **V0 ドラフト**。戦線マップ格子そのものが 1 枚のマインスイーパ盤。  
**系譜:** Invading Minesweeper 系の任意レイヤ（名称 TBD: invade / front）

関連: [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) §3.4・§4（報酬分割）、[`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md)。

> **URL ナビはまだ結ばない。** クエリ鍵・型・build/parse は [`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md) / `@estg/shared` を正とする。

---

## 1. ひとことで

HQ を中心とした前線マップで、**どこまで探索し・どのルートで漁るか**を決める任意レイヤ。**前線セクター格子そのものがマインスイーパ**（ネストした内盤ではない）。戦闘そのものが目的ではなく、Module 1（explore）の漁場密度とインテルを決める意思決定画面。

---

## 2. スコープ（V0 ドラフト）

| 含む（仕様として書く） | 含まない（非ゴール / 後回し） |
|---|---|
| HQ 中心のセクター格子＝1 枚のマインスイーパ盤 | セクター選択→内側 8×8 のネスト UI（廃止） |
| Chebyshev 距離に基づく密度 → 遠方ほど高い `P(mine)` | バランス確定・敵 AI 実装 |
| 任意参加 vs quick-battle（短縮経路）の方針 | explore / trade への **UI ナビ配線**（キー契約は HANDOFF_M45） |
| 報酬分割（インテル／ルート ≠ 本 salvage） | コンテナ／YieldBag の二重払い |
| 後続スタブ受け入れ条件 | Pages デプロイ必須化・経済ゲート |

---

## 3. HQ 中心フロント

- プレイヤー拠点（HQ）を原点 `(0, 0)` とする 2D セクター格子。
- 各セクター座標 `(sx, sy)` について HQ からの **Chebyshev 距離**  
  `d = max(|sx|, |sy|)` を密度／敵配置の主軸にする。
- UI: 「戦線マップ」上のセルがそのまま MS セル（開く／旗／地雷）。**内盤へのドリルダウンはしない。**

### 盤ジオメトリ（V0）

| 定数 | 値 | 意味 |
|---|---|---|
| `AOI_HALF` | 12 | 座標 −12…+12 |
| `BOARD_SPAN` | 25 | 一辺セル数（`2*AOI_HALF+1`） |
| 総セル | 625 | うち壁リング含む |
| 壁 | `d ≥ 12` | 進入不可（blocked） |
| 前線目安 | `d = 10` | density ≈ 1.0 の参照 |

---

## 4. Chebyshev 密度カーブ（会話からの案）

願望スケール（確定バランスではない）:

| `d` | 意味（願望） |
|---|---|
| `0` | HQ。強制開放・地雷なし |
| `~1–6` | 薄い〜中程度。日常漁場の主戦場候補 |
| `~10` | 前線上限の目安（高密度） |
| `>= 12` | **壁** — 進入不可 |

共有プレースホルダ: `packages/shared` の `chebyshevDistance` / `sectorDensityFromChebyshev`（純関数・曲線は仮）。

```text
density ≈ clamp( d / 10 , 0..1 )   // d < 12
d >= 12 → blocked / wall
P(mine | d) ≈ 0.05 + density * 0.20   // 近傍薄 → 前線 ~25%
```

実装: `packages/invade/src/board.ts` の `mineProbabilityAtDistance`。

---

## 5. 任意参加 vs quick-battle

- Module 4 は **毎ループ必須ではない**。
- スキップして Hub（Module 3）から直接 Module 1 へ入る経路（quick-battle / 同等の短縮）を残す。
- 踏んだ場合の価値は「どこまで開いたか／どのルートで出撃するか」の意思決定とインテル。

---

## 6. 報酬分割（explore との二重払い禁止）

| レイヤ | 渡してよいもの | 渡さない／控えめ |
|---|---|---|
| Module 4（invade） | ルート情報・セクター指定・インテル・希少ヒント | 本 salvage と同じコンテナ／本 `YieldBag` の満額付与 |
| Module 1（explore） | 実コンテナ・本 yield・機体摩耗 | （4 で既に払った本 salvage の再払い） |

同じサルベージを 4 と 1 の両方で満額払わない（[`PRODUCT_VISION.md`](./PRODUCT_VISION.md) §4）。

---

## 7. 非ゴール（明示）

- explore / sort / trade との **UI ナビ結線**（キー契約は別途 HANDOFF_M45）
- 侵食シミュレーションの本実装
- 敵 AI・弾薬消費・勝敗スコアの実装
- 市場／戦闘ゲート付きドロップ（ビジョン §5 — バランス後）
- 名称の最終決定（invade / front / その他）
- trade / restore / 回路ボーナスの書き換え（独立トラック）
- **セクター内ネスト 8×8**（PR #35 — 訂正済み）

---

## 8. 後続スタブ受け入れ条件

触れるスタブの最低ライン（前線＝MS）:

1. HQ 原点の格子上でセルを開く／旗できる（壁 `d≥12` 以外）  
2. HQ は開始時から開放され、地雷にならない  
3. `d >= 12` は壁（選択・開放不可）と分かる  
4. 盤進行が `intelFlags`（と軽微な density）に載る  
5. 地雷踏みで `engage=forced` + 隣接敵の「強制出撃へ」が出る  
6. 旗セル選択で `engage=raid` + 当該のみの「任意出撃へ」が出る  
7. 「スキップ（quick-battle）」相当の UI 文言があり、スキップ自体はナビしない  
8. 報酬表示はインテル／ルート表現に留め、コンテナ数の本払いをしない  
9. `npm run test -w @estg/invade` が通る  

---


## 8.5. ハンドオフ契約（キーのみ）

正本: [`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md)。

| 方向 | 主なキー | 備考 |
|---|---|---|
| trade → invade | `fromHub`, `deployableMechs?`, `startingAmmo?` | 任意参加。配備コミットはしない |
| invade → trade | `sectorX`, `sectorY`, `density`, `intelFlags?` | **YieldBag 禁止** |
| invade → explore | 同上 + `engage?` + `enemyCells?` | forced / raid 戦闘ハンドオフ。trade→explore と共存可 |

shared: `buildTradeToInvadeUrl` / `buildInvadeToTradeUrl` / `buildInvadeToExploreUrl` / `mergeInvadeSectorOntoExploreUrl`。

ルート焦点: 開いた／旗したセル（または明示選択）の `(sx,sy)` をハンドオフに載せる。盤全体のインテルは `intelFlags` に集約。

## 8.6. 薄掃討（thin sweep · track 2 · 残置）

選択 1 セクターに対する minesweeper-lite 一歩の純関数（`sweep.ts`）は残置。前線盤（§8.7）が UI の主経路。density ナッジ等で前線盤から再利用。

| 操作 | 効果 | ハンドオフへの載せ方 |
|---|---|---|
| Flag（旗立て） | セルを旗マーク | `intelFlags` に `sectorFlagged` |
| Sweep（偵察掃討） | `P(hazard) ≈ density` で成功/接触 | 成功 → `scoutClear`；接触 → `scoutHazard` |

## 8.7. 前線マインスイーパ（本トラック）

**戦線マップ格子そのものが 1 枚のマインスイーパ。** セクターを選んで内側のミニ盤に入る UX は使わない。

### メタファー

| セル | 意味 |
|---|---|
| **HQ / base**（開始時強制開放） | 安全な拠点 `(0,0)`。地雷にならない。進入直後から開いている |
| **空白（開いた 0）** | 探索済みの安全地帯（flood-fill で広がる） |
| **数字** | バッファ地帯 — 周囲の敵（地雷）セクター数を感知 |
| **地雷 / 爆弾** | 敵位置 → プレイヤーは Module 1（explore）で掃討する概念。invade はインテルを渡す |
| **壁** | `d≥12` — 進入不可（impassable） |

### 盤サイズと距離 → 敵密度

- 盤: **25×25**（`AOI_HALF=12` · 座標 −12…+12）
- 敵配置: 各プレイアブルセル独立に `P(mine) = 0.05 + clamp(d/10,0..1) * 0.20`  
  （近傍薄・前線濃。旧「セクター密度→内盤敵数」をリング距離へ適応）
- HQ: 単一セル中央（地雷禁止・開始時 flood 開放）
- 壁リング: blocked（地雷としては置かない）

### 操作・勝敗（ソフト）

- 開く（左クリック）: クラシック MS 同様、0 なら flood-fill
- 旗（右クリック / 旗モード）: トグル
- 開いたセーフセルをクリック: ハンドオフ用ルート焦点
- **勝利:** 全セーフマス開放、または地雷を正しくすべて旗立て → `sectorCleared`
- **地雷踏み:** `scoutHazard` を立てるが **前線マップ全体はハードロックしない**（続行・旗・ハンドオフ可）
- 部分進行: `minesRemaining` / `sectorFlagged` / 十分なセーフ開放で `scoutClear`

### ハンドオフ

- ベース: `sectorX` / `sectorY` / `density` / `intelFlags`
- **engage 加算（invade→explore）:**
  - **強制（`engage=forced`）:** 地雷踏み → 当該セル＋隣接地雷セルを `enemyCells` に載せ、「強制出撃へ」リンク
  - **任意（`engage=raid`）:** 旗を立てたセルを通常クリックで選択 → 当該セルのみを `enemyCells` に載せ、「任意出撃へ」リンク
- `enemyCells` 圧縮形: `sx,sy;sx,sy;...`（`encodeEnemyCells`）
- `intelFlags` 例: `minesRemaining`, `sectorCleared`, `scoutHazard`, `sectorFlagged`, `scoutClear`（＋ `routeHint` 等）
- density は盤結果で微調整（掃討完了でクールダウン、hazard でヒート）。**地雷密度カーブ自体は据え置き**（今は濃くしない）
- explore 側の `engage` / `enemyCells` 消費は後続 PR

実装: `packages/invade/src/board.ts`（`forcedEngageTargets` / `raidEngageTarget`）+ `@estg/shared` handoff。

---

## 9. パッケージ / 試し方（ひな型）


```bash
npm install
npm run dev:invade
# http://localhost:5176/  — 「戦線マップ」
# 例: http://localhost:5176/?fromHub=1&deployableMechs=2&startingAmmo=28
```

遊び方:

1. 前線格子でセルを開く／旗を立てる（HQ は最初から開放・壁は不可）
2. 開いたセルをクリックしてルート焦点
3. **格納庫へ渡す** / **探索へ渡す**（`intelFlags` / `density`）
4. 地雷踏み → **強制出撃へ**（`engage=forced` + 隣接敵）／旗セル選択 → **任意出撃へ**（`engage=raid`）

- パッケージ: `packages/invade`（`@estg/invade`）
- 共有ヘルパ: `@estg/shared` の sector density プレースホルダ
- 自己試験: `npm run test -w @estg/invade`

---

## 10. 採否メモ

- **位置づけ:** V0 ドラフト仕様 + 前線＝マインスイーパのプレイアブル。ビジョンの Module 4 欄の受け皿。
- **訂正:** PR #35 の「セクター内 8×8」は製品意図と不一致のため、本仕様で前線格子＝盤に置き換え。
- **次:** explore 側の `engage` / `enemyCells` 消費・侵食シミュレーションは後続。回路ボーナスは track 1（本トラックでは触らない）。
