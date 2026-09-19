# Invade / Front v0（Module 4 ドラフト仕様）

**ステータス:** ドラフト仕様 / 薄いプレイアブル（`packages/invade`）· ハンドオフ配線済 · **セクター内マインスイーパ** · 2026-09-19  
**性質:** プロダクト会話と [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) から落とした **V0 ドラフト**。戦線マップ＋選択セクターの内盤マインスイーパ。  
**系譜:** Invading Minesweeper 系の任意レイヤ（名称 TBD: invade / front）

関連: [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) §3.4・§4（報酬分割）、[`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md)。

> **URL ナビはまだ結ばない。** クエリ鍵・型・build/parse は [`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md) / `@estg/shared` を正とする。

---

## 1. ひとことで

HQ を中心とした前線マップで、**どこで漁るか（ルート／セクター）を選ぶ**任意レイヤ。選択セクターの内側では小さなマインスイーパで偵察する。戦闘そのものが目的ではなく、Module 1（explore）の漁場密度とインテルを決める意思決定画面。

---

## 2. スコープ（V0 ドラフト）

| 含む（仕様として書く） | 含まない（非ゴール / 後回し） |
|---|---|
| HQ 中心のセクター格子・選択セクターの内盤マインスイーパ | 侵食シミュレーション／全面戦線の単一巨大盤 |
| Chebyshev 距離に基づく密度カーブ → 内盤の敵数 | バランス確定・敵 AI 実装 |
| 任意参加 vs quick-battle（短縮経路）の方針 | explore / trade への **UI ナビ配線**（キー契約は HANDOFF_M45） |
| 報酬分割（インテル／ルート ≠ 本 salvage） | コンテナ／YieldBag の二重払い |
| 後続スタブ受け入れ条件 | Pages デプロイ必須化・経済ゲート |

---

## 3. HQ 中心フロント

- プレイヤー拠点（HQ）を原点 `(0, 0)` とする 2D セクター格子を想定。
- 各セクター座標 `(sx, sy)` について HQ からの **Chebyshev 距離**  
  `d = max(|sx|, |sy|)` を密度スケールの主軸にする。
- UI: 「戦線マップ」上に HQ と密度色のセル。選択後に **セクター内マインスイーパ**（下記 §8.7）。侵食シミュレーションは未実装。

---

## 4. Chebyshev 密度カーブ（会話からの案）

願望スケール（確定バランスではない）:

| `d` | 意味（願望） |
|---|---|
| `0` | HQ 直近。極薄／安全寄り |
| `~1–6` | 薄い〜中程度。日常漁場の主戦場候補 |
| `~10` | 前線上限の目安（高密度） |
| `>= 12` | **壁** — 進入不可、または極端に厳しい境界 |

共有プレースホルダ: `packages/shared` の `chebyshevDistance` / `sectorDensityFromChebyshev`（純関数・曲線は仮）。

```text
density ≈ clamp( d / 10 , 0..1 )   // d < 12
d >= 12 → blocked / wall
```

実装・チューニングは後続チケット。V0 では「距離 → 密度スカラー」が読めることだけを約束する。

---

## 5. 任意参加 vs quick-battle

- Module 4 は **毎ループ必須ではない**。
- スキップして Hub（Module 3）から直接 Module 1 へ入る経路（quick-battle / 同等の短縮）を残す。
- 踏んだ場合の価値は「どのセクター／ルートで出撃するか」の意思決定とインテル。

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
- 侵食シミュレーション／戦線全体を 1 盤にする移植
- 敵 AI・弾薬消費・勝敗スコアの実装
- 市場／戦闘ゲート付きドロップ（ビジョン §5 — バランス後）
- 名称の最終決定（invade / front / その他）
- trade / restore / 回路ボーナスの書き換え（独立トラック）

---

## 8. 後続スタブ受け入れ条件

触れるスタブの最低ライン（内盤込み）:

1. HQ 原点の格子上でセクターを 1 つ選択できる  
2. 選択セクターの `d` と仮 `density` が表示される  
3. `d >= 12` は選択不可（壁）と分かる  
4. 選択セクターで内盤マインスイーパが遊べ、結果が `intelFlags`（と軽微な density）に載る  
5. 「スキップ（quick-battle）」相当の UI 文言があり、スキップ自体はナビしない  
6. 報酬表示はインテル／ルート表現に留め、コンテナ数の本払いをしない  
7. `npm run test -w @estg/invade` が通る  

---


## 8.5. ハンドオフ契約（キーのみ）

正本: [`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md)。

| 方向 | 主なキー | 備考 |
|---|---|---|
| trade → invade | `fromHub`, `deployableMechs?`, `startingAmmo?` | 任意参加。配備コミットはしない |
| invade → trade | `sectorX`, `sectorY`, `density`, `intelFlags?` | **YieldBag 禁止** |
| invade → explore | 同上セクター組 | trade→explore キーと共存可 |

shared: `buildTradeToInvadeUrl` / `buildInvadeToTradeUrl` / `buildInvadeToExploreUrl` / `mergeInvadeSectorOntoExploreUrl`。

## 8.6. 薄掃討（thin sweep · track 2 · 残置）

選択 1 セクターに対する minesweeper-lite 一歩の純関数（`sweep.ts`）は残置。内盤（§8.7）が UI の主経路。density ナッジ等で内盤から再利用。

| 操作 | 効果 | ハンドオフへの載せ方 |
|---|---|---|
| Flag（旗立て） | セルを旗マーク | `intelFlags` に `sectorFlagged` |
| Sweep（偵察掃討） | `P(hazard) ≈ density` で成功/接触 | 成功 → `scoutClear`；接触 → `scoutHazard` |

## 8.7. セクター内マインスイーパ（本トラック）

選択した前線セクターの **内側** で遊ぶ小さな盤。戦線マップ自体は維持し、内盤はパズル層。

### メタファー

| セル | 意味 |
|---|---|
| **HQ / base**（開始時強制開放） | 安全な拠点。地雷にならない。進入直後から開いている |
| **空白（開いた 0）** | 探索済みの安全地帯（flood-fill で広がる） |
| **数字** | バッファ地帯 — 周囲の敵（地雷）数を感知 |
| **地雷 / 爆弾** | 敵位置 → プレイヤーは Module 1（explore）で掃討する概念。invade はインテルを渡す |

### 盤サイズと密度 → 敵数

- 盤: **8×8**（`BOARD_SIZE`）
- 敵数: `mineCount = round(3 + density * 13)` → **3…16**  
  （`density` は Chebyshev セクター距離由来の仮スカラー 0..1）
- HQ ブロック: 偶数盤の中央 2×2（地雷禁止・開始時 flood 開放）

### 操作・勝敗（ソフト）

- 開く（左クリック）: クラシック MS 同様、0 なら flood-fill
- 旗（右クリック / 旗モード）: トグル
- **勝利:** 全セーフマス開放、または地雷を正しくすべて旗立て → `sectorCleared`
- **地雷踏み:** `scoutHazard` を立てるが **前線マップ全体はハードロックしない**（続行・旗・ハンドオフ可）。部分偵察のまま explore へ渡してよい
- 部分進行: `minesRemaining` / `sectorFlagged` / 十分なセーフ開放で `scoutClear`

### ハンドオフ

- **新しい URL キーは追加しない。** 既存の `sectorX` / `sectorY` / `density` / `intelFlags` に載せる
- `intelFlags` 例: `minesRemaining`, `sectorCleared`, `scoutHazard`, `sectorFlagged`, `scoutClear`（＋ `routeHint` 等）
- density は盤結果で微調整（掃討完了でクールダウン、hazard でヒート）
- invade→explore は「敵位置」の概念をトークンで渡す。explore 側は当面 threat スケールに利用してよい

実装: `packages/invade/src/board.ts`（invade 専用純関数）。

---

## 9. パッケージ / 試し方（ひな型）


```bash
npm install
npm run dev:invade
# http://localhost:5176/  — 「戦線マップ」
# 例: http://localhost:5176/?fromHub=1&deployableMechs=2&startingAmmo=28
```

遊び方:

1. 格子でセクターをクリック（壁 `d≥12` 以外）
2. 内盤で開く / 旗を立てる（HQ は最初から開放）
3. **格納庫へ渡す** / **探索へ渡す**（`intelFlags` / `density` が付く）

- パッケージ: `packages/invade`（`@estg/invade`）
- 共有ヘルパ: `@estg/shared` の sector density プレースホルダ
- 自己試験: `npm run test -w @estg/invade`

---

## 10. 採否メモ

- **位置づけ:** V0 ドラフト仕様 + セクター内マインスイーパ付きプレイアブル。ビジョンの Module 4 欄の受け皿。
- **次:** 侵食シミュレーション・explore 側の敵座標消費は後続。回路ボーナスは track 1（本トラックでは触らない）。
