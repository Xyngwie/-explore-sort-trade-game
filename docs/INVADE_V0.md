# Invade / Front v0（Module 4 ドラフト仕様）

**ステータス:** ドラフト仕様 / 薄いプレイアブル（`packages/invade`）· ハンドオフ配線済 · **薄掃討（track 2）** · 2026-09-19  
**性質:** プロダクト会話と [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) から落とした **V0 ドラフト**。本編マインスイーパは未着手；選択セルの Flag/Sweep のみ。  
**系譜:** Invading Minesweeper 系の任意レイヤ（名称 TBD: invade / front）

関連: [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) §3.4・§4（報酬分割）、[`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md)。

> **URL ナビはまだ結ばない。** クエリ鍵・型・build/parse は [`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md) / `@estg/shared` を正とする。

---

## 1. ひとことで

HQ を中心とした前線マップで、**どこで漁るか（ルート／セクター）を選ぶ**任意レイヤ。戦闘そのものが目的ではなく、Module 1（explore）の漁場密度とインテルを決める意思決定画面。

---

## 2. スコープ（V0 ドラフト）

| 含む（仕様として書く） | 含まない（非ゴール / 後回し） |
|---|---|
| HQ 中心のセクター格子・選択セルの薄掃討（Flag/Sweep） | 本編マインスイーパ／侵食シミュレーション |
| Chebyshev 距離に基づく密度カーブ案 | バランス確定・敵スポーン実装 |
| 任意参加 vs quick-battle（短縮経路）の方針 | explore / trade への **UI ナビ配線**（キー契約は HANDOFF_M45） |
| 報酬分割（インテル／ルート ≠ 本 salvage） | コンテナ／YieldBag の二重払い |
| 後続スタブ受け入れ条件 | Pages デプロイ必須化・経済ゲート |

---

## 3. HQ 中心フロント

- プレイヤー拠点（HQ）を原点 `(0, 0)` とする 2D セクター格子を想定。
- 各セクター座標 `(sx, sy)` について HQ からの **Chebyshev 距離**  
  `d = max(|sx|, |sy|)` を密度スケールの主軸にする。
- UI: 「戦線マップ」上に HQ と密度色のセル。選択後に **旗立て / 偵察掃討**（密度連動 hazard）。侵食シミュレーションや全面盤マインスイーパは未実装。

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
- Invading Minesweeper 本編ルールの移植
- 敵 AI・弾薬消費・勝敗スコアの実装
- 市場／戦闘ゲート付きドロップ（ビジョン §5 — バランス後）
- 名称の最終決定（invade / front / その他）

---

## 8. 後続スタブ受け入れ条件（まだ実装しない）

触れるスタブの最低ライン（薄掃討込み）:

1. HQ 原点の格子上でセクターを 1 つ選択できる  
2. 選択セクターの `d` と仮 `density` が表示される  
3. `d >= 12` は選択不可（壁）と分かる  
4. 選択セルを Flag / Sweep でき、結果が `intelFlags`（と軽微な density）に載る  
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

## 8.6. 薄掃討（thin sweep · track 2）

選択した 1 セクターに対する **minesweeper-lite** 一歩。盤全体シミュレーションではない。

| 操作 | 効果 | ハンドオフへの載せ方 |
|---|---|---|
| Flag（旗立て） | セルを旗マーク | `intelFlags` に `sectorFlagged` |
| Sweep（偵察掃討） | `P(hazard) ≈ density` で成功/接触 | 成功 → `scoutClear`（density をわずかに下げる）；接触 → `scoutHazard`（density をわずかに上げる） |
| マーク解除 | マーク除去 | ベースの `routeHint` 等のみ |

- 実装: `packages/invade/src/sweep.ts`（invade 専用純関数）。共有は既存 `sectorDensityAt` のみ。
- **新しい URL キーは追加しない。** 既存の `sectorX` / `sectorY` / `density` / `intelFlags` に載せる。
- 回路ボーナス（track 1）とは独立。HubSave 編集なし。

## 9. パッケージ / 試し方（ひな型）


```bash
npm install
npm run dev:invade
# http://localhost:5176/  — 「戦線マップ」
# 例: http://localhost:5176/?fromHub=1&deployableMechs=2&startingAmmo=28
```

遊び方（薄い一歩）:

1. 格子でセクターをクリック（壁 `d≥12` 以外）
2. **旗立て** または **偵察掃討**（hazard 確率は仮 density）
3. **格納庫へ渡す** / **探索へ渡す**（`intelFlags` / `density` が付く）

- パッケージ: `packages/invade`（`@estg/invade`）
- 共有ヘルパ: `@estg/shared` の sector density プレースホルダ
- 自己試験: `npm run test -w @estg/invade`

---

## 10. 採否メモ

- **位置づけ:** V0 ドラフト仕様 + 薄掃討付きプレイアブル。ビジョンの Module 4 欄の受け皿。
- **次:** 本編マインスイーパ／侵食は後続。回路ボーナスは track 1。
