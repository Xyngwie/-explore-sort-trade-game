# Invade / Front v0（Module 4 ドラフト仕様）

**ステータス:** ドラフト仕様 / 薄いプレイアブル（`packages/invade`）· **UI ナビ配線済**（invade→explore / invade→trade）· **前線＝マインスイーパ** · 2026-09-23  
**性質:** プロダクト会話と [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) から落とした **V0 ドラフト**。戦線マップ格子そのものが 1 枚のマインスイーパ盤。  
**系譜:** Invading Minesweeper 系の任意レイヤ（名称 TBD: invade / front）

関連: [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) §3.4・§4（報酬分割）、[`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md)。

> **UI ナビは配線済み。** ルート焦点後の CTA「**この漁場で出撃**」が `buildInvadeToExploreUrl`（Pages 対応 `resolveModuleBaseUrl`）で Module 1 へ遷移。クエリ鍵・型・build/parse は [`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md) / `@estg/shared` を正とする。

---

## 1. ひとことで

HQ を中心とした前線マップで、**どこまで探索し・どのルートで漁るか**を決める任意レイヤ。**前線セクター格子そのものがマインスイーパ**（ネストした内盤ではない）。戦闘そのものが目的ではなく、Module 1（explore）の漁場密度とインテルを決める意思決定画面。

---

## 2. スコープ（V0 ドラフト）

| 含む（仕様として書く） | 含まない（非ゴール / 後回し） |
|---|---|
| HQ 中心のセクター格子＝1 枚のマインスイーパ盤 | セクター選択→内側 8×8 のネスト UI（廃止） |
| Chebyshev 距離に基づく密度 → 遠方ほど高い `P(mine)` | バランス確定・敵 AI 実装 |
| 任意参加 vs quick-battle（短縮経路）の方針 | 侵食シミュレーション本実装 |
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

- sort / trade 以外への追加ナビ結線（invade→explore / invade→trade は配線済）
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
5. 地雷踏みで `engage=forced` + 隣接敵の「探索へ（強制交戦 chip）」が出る
5b. 強制戦闘中は盤・旗・スキップ等を禁止（強制出撃のみ）。ブラウザ戻るで全機大破を Hub/Trade へ渡す
5c. 開く／旗後、グリッド直下から「探索へ」できる（セル出撃バー）  
6. 旗セル選択で `engage=raid` + 当該のみの「探索へ（任意レイド chip）」が出る  
6b. ルート焦点で「探索へ」（sector/density/intel → explore）と「格納庫へ」が出る  
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
- 旗（右クリック / タッチ既定のタップ）: トグル。詳細は末尾「マウス・スマホ入力の統一」
- 開いたセーフセルをマウス左クリック: ハンドオフ用ルート焦点。タッチの数字タップは末尾の周囲開放
- **勝利:** 全セーフマス開放、または地雷を正しくすべて旗立て → `sectorCleared`
- **地雷踏み:** `scoutHazard` + **強制戦闘ロック**（他操作禁止・強制出撃のみ）。ブラウザの戻る＝全機大破（`intelFlags=allDestroyed` + HubSave wear）
- 部分進行: `minesRemaining` / `sectorFlagged` / 十分なセーフ開放で `scoutClear`

### ハンドオフ

- ベース: `sectorX` / `sectorY` / `density` / `intelFlags`
- **engage 加算（invade→explore）:**
  - **強制（`engage=forced`）:** 地雷踏み → 当該セル＋隣接地雷セルを `enemyCells` に載せ、「探索へ（強制交戦 chip）」
  - **任意（`engage=raid`）:** 旗を立てたセルを通常クリックで選択 → 当該セルのみを `enemyCells` に載せ、「探索へ（任意レイド chip）」
- `enemyCells` 圧縮形: `sx,sy;sx,sy;...`（`encodeEnemyCells`）
- `intelFlags` 例: `minesRemaining`, `sectorCleared`, `scoutHazard`, `sectorFlagged`, `scoutClear`（＋ `routeHint` 等）
- density は盤結果で微調整（掃討完了でクールダウン、hazard でヒート）。**地雷密度カーブ自体は据え置き**（今は濃くしない）
- explore 側は density / engage / enemyCells を脅威と漁場バナーに消費（戦闘全面書き換えはしない）

実装: `packages/invade/src/board.ts`（`forcedEngageTargets` / `raidEngageTarget`）+ `@estg/shared` handoff。

---



## 8.8. 強制戦闘ロックとブラウザ戻る（V0 加算）

- 地雷踏み（`board.hitMine`）後、invade は **強制戦闘ロック**: 開く／旗／再生成／スキップ／通常出撃／格納庫渡しを禁止。
- 許可: グリッド直下（および該当時ハンドオフ）の **「探索へ（強制交戦 chip）」** のみ。
- ロック中にブラウザの戻る（`popstate`）→ HubSave 全艦隊 `durability=0`（大破）+ trade URL に `intelFlags=allDestroyed` と `returnKind=fail` の wear を載せる。
- 意図的な強制出撃 CTA は sessionStorage で handoff intent を立て、wipe しない。
- explore 側も `engage=forced` の出撃中 `popstate` で同様に wipe → trade（結果画面到達後は intent で抑止）。
- **強制戦闘が任意の終端（生還 / 失敗 / abort / back-wipe）に達したら** `HubSave.frontProgress.hitMine` をクリアする。再入場で stale ロックを復活させない（開いた地雷マスの見た目は残す）。pending 中（未ハンドオフ）は従来どおりロック。


## 8.9. 前線の手触り（危険凡例・解決済マス・進捗感）

UI のみの加算。**`HubSave.frontProgress` の形は変えない**（seed / opened / flagged / focus / hitMine）。#75 のロック解除規則もそのまま。

| 見た目 | 意味 |
|---|---|
| 未開マスの色帯 | HQ からの Chebyshev 距離帯（近傍薄 → 前線濃）。爆弾密度の手触り |
| 空白（開いた 0） | 探索済セーフ地帯を強調 |
| 旗 | 任意レイド候補を強調 |
| ✕（赤） | 開いた地雷かつ `hitMine=true`（強制ロック中・未解決） |
| 済（緑） | 開いた地雷かつ `hitMine=false`（#75 解決後・再出撃可） |
| 進捗バー | セーフ開放率・空白数・旗・残敵（派生表示。永続フィールドではない） |

実装: `packages/invade/src/front-feel.ts` + `main.ts` / `style.css`。


## 8.10 置き去り機体の表示と回収導線（2026-10-03 正本化）

- Invade 盤は現在の `frontSeed` に対応する `lostMechs` を、保存された `cell` に表示する。
- 表示は灰色の置き去り機体マーカーとし、地雷判定・セルの開閉判定には影響しない。
- ツールチップには置き去り機体を表示し、該当マスを選択すると「置き去り機 N 機：出撃して離陸すれば回収」の出撃導線を表示する。
- その導線から Explore へ出撃し、離昇時に搭乗円内にいる置き去り機体を回収する。
- 盤を作り直した場合、置き去り機体の座標を新しい盤へ移し、座標が壁外なら遊べる範囲へ収める。
- 場所情報を持たない legacy row は現在の盤の開始地点（HQ）へ配置して場所情報を補完する。
- 項目5-1b③（2026-10-08）: `lostMechs` のうち `kind: "wreck"`（残骸）の行は置き去り機の印に含めず、別の印「残骸」（右下の錆色の点 `#a8604a`）・凡例・ツールチップ「残骸 n 機: …」・出撃バーの行「残骸 n 機：出撃して離陸すれば回収」を出す。残骸は盤を作り直すと回路ごと消え、新しい盤へは移らない（W3 C、[`CIRCUIT_SQUAD_DESIGN_V0.md`](./CIRCUIT_SQUAD_DESIGN_V0.md) §7.1）。

## 8.11 段位（2026-10-07 神宮の決定・未実装）

- クリアで段が 1 つ解放される。次に挑む段は、解放済みの全段の一覧から選ぶ。
- 盤面途中で撤退するときは、どこまで下がるかを一覧から選ぶ。
- 部隊の回路装着上限は、最高到達段を新しくクリアしたときだけ +1（天井なし。下の段のクリアし直しでは増えない）。
- Explore の敵の攻撃力と HP に 1.01^(挑戦中の段) を掛ける（段 0 は ×1）。報酬は段で増やさない。
- 初回クリアでは、例外として 1×1（数字 4 が 1 つ）の白回路を 1 枚発見する。初回クリアのお金の報酬はなし（2026-10-07 7:36 神宮）。初回確定発見は一度だけ。追加決定により1×1をジャンク2個・6cで作成可能。初クリア後は通常抽選でP1×1を追加入手でき、Restoreは1×1〜20×20。
  - 実装（#272、2026-10-12・神宮の Go）: 盤が sectorCleared に変わった操作の保存で、HubSave の任意キー `firstInvadeClear` を記録し、未修復の「4」を倉庫へ入れる。クリアの帯（「前線掃討完了 — sectorCleared。…」）の下に 1 行「盤の奥で、小さな回路を1枚見つけた」（発見した盤だけ）。キーの無いセーブは未クリアで、読み込んだ時点で掃討済みの盤は数えない（S2）。出撃の帰還、intel の sectorCleared、frontProgress、掲示板の解放は初回クリアの印にしない（#271 の照合）。
- 詳細は [`CIRCUIT_SQUAD_DESIGN_V0.md`](./CIRCUIT_SQUAD_DESIGN_V0.md) §3・§4。

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
3. **この漁場で出撃**（invade→explore · `intelFlags` / `density`）／**格納庫へ**（invade→trade）
4. 地雷踏み → **探索へ（強制交戦 chip）**（`engage=forced` + 隣接敵）／旗セル選択 → **探索へ（任意レイド chip）**（`engage=raid`）

- パッケージ: `packages/invade`（`@estg/invade`）
- 共有ヘルパ: `@estg/shared` の sector density プレースホルダ
- 自己試験: `npm run test -w @estg/invade`

---

## 8.10 置き去り機体の再出現（実装済み契約）

- Invade outing で未帰還となった機体は `lostMechs` に保存され、`frontSeed` / `cell` でこの盤上の位置を持つ。
- 盤上では対象マスに「置き去り機」の印を表示する。印は地雷・開閉判定には影響しない。
- 対象マスから Explore へ出撃すると、対象の置き去り機体が World に再出現する。
- Explore の離昇時に搭乗円内に入っている再出現機体は回収される。回収成功後は通常の `fleet` に復帰し、通常の deploy 対象になる。
- 回収されなかった再出現機体は同じ `instanceId` の `lostMechs` 行として同じ地点に残り、次回以降も再発見・回収の対象となる。
- Non-Invade outing の未帰還機体は `lostMechs` の対象外で、機体および装着回路を完全喪失する。
- 置き去り機体の回路は `lostMechs` の機体に付いたまま扱い、回収成功時にそのまま戻る。回路の `fieldDrops` 化はしない。
- Abandoned → Wrecked / Enemy の具体的遷移条件は本仕様では定義しない。Battery Activity=0 を直接条件にしない。

## 10. 採否メモ

- **位置づけ:** V0 ドラフト仕様 + 前線＝マインスイーパのプレイアブル。ビジョンの Module 4 欄の受け皿。
- **訂正:** PR #35 の「セクター内 8×8」は製品意図と不一致のため、本仕様で前線格子＝盤に置き換え。
- **次:** 侵食シミュレーション・バランス調整は後続。回路ボーナスは track 1（本トラックでは触らない）。invade→explore UI ナビは配線済。

### 段位UIのdraft実装

挑戦中の段と解放済み範囲を表示する。盤をクリアしたら解放済みの一覧から次の段を選び、確認して新しい盤に進む。途中の盤では、下の段の一覧から撤退先を選んで確認する。強制戦闘ロック中は段変更できない。0段では下位段が無いため下位撤退を無効にする。従来の同じ段での盤再生成は残す。

段位の一覧は100段ごとにページを切り替え、解放済みの全段を選べる。段位を上げても敵の速さや回路枚数・サイズ・報酬は変えず、HPと攻撃力だけを1.01^段で増やす。

回路装着上限の実装は、部隊の数え方・機体別枠との関係・1×1を上限に数えるかのユーザー回答を待って追加する。

## 追加決定：マウス・スマホ入力の統一

神宮直接指示TASK_ASSIGNMENT「Invadeのマウス・スマホ操作の統一」が旧旗モード/長押し旗操作を更新する。マイン配置・数字・偵察範囲・勝利条件・報酬・被発見/強制戦闘のルールは維持する。

| 入力 | 操作 |
|---|---|
| マウス左クリック | 旗なしの未開放マスを開く |
| マウス右クリック | 未開放マスの旗を設置/解除（疑問符なし） |
| 開いた数字で左右同時押し | 周囲の旗数が数字と一致した場合だけ、旗なし未開放マスを開く。左右どちら先でも単独操作を混ぜない |
| ホイール / 中ボタンドラッグ | 拡大縮小 / 盤面移動 |
| タッチ既定 | タップで旗設置/解除、長押し後に離すと旗なし未開放マスを開く |
| タッチ反転 | タップで旗なし未開放マスを開く、長押し後に離すと旗設置/解除 |
| 開いた数字のタップ | 反転にかかわらず、旗数一致時だけ周囲開放 |
| 長押し後スイープ / ピンチ | 盤面移動 / 拡大縮小。離してもマス操作をしない |
| 引いた状態でダブルタップ | その位置を中心に拡大。旗/開放と重複しない |

周囲開放は数字と旗数のみで判定する。旗数不足/超過では開かない。旗位置の誤りにより地雷を開く可能性がある。地雷の正解情報で安全確認せず、最初の地雷開放で残りの開放を止め、既存scoutHazard/強制戦闘ロックとハンドオフに接続する。

入力状態は画面幅で固定せずpointerTypeごとに判定。マウス左長押しで旗を立てない。長押し閾値到達時には変更せず、離した時に一回だけ処理する。複数指/pointercancel/画面フォーカス喪失は保留操作を取り消す。盤面上の互換click/contextmenu/中ボタン自動スクロールは重複操作させない。変換後のDOM位置から当たり判定する。

定数は `packages/invade/src/boardInput.ts` のBOARD_INPUT：長押し480ms、移動8px、ダブルタップ間隔280ms/距離24px、初期倍率1、倍率0.65〜4、引いた状態は1.6未満、ダブルタップ2倍、ホイール係数0.0015。ズーム倍率はexp(-deltaY×係数)、上下限でクランプ。盤面が完全に見失われないよう40pxを可視範囲へ残す。移動/拡縮は保存せず、タッチ割当も起動時は必ず既定。引いた状態の単独タップは、ズームとの区別のため最大280ms保留する。

確認手順と実測結果は `docs/verification/invade-input.json` とDraft PRへ記録する。物理スマートフォンは実施時だけ確認済みとする。
