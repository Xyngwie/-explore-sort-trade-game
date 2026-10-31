# WRECKLINE 全画面1枚完結型UI（FULLSCREEN_SHELL_V0）

決定：神宮 2026-10-31（Q1〜Q12 はすべて★案）。

## 1. 決定事項
| # | 決定 |
|---|---|
| Q1 | 入りきらないときは画面内のパネルだけスクロール可（ページ全体の縦スクロールは無し） |
| Q2 | PC もスマホと同じ全画面。中央固定・最大幅つき |
| Q3 | 下部タブは英字 `DOCK`・`INVADE`・`SORT`・`RESTORE`・`SORTIE` |
| Q4 | 出撃中はタブを隠す |
| Q5 | HUD の未開封コンテナをタップすると SORT へ移動 |
| Q6 | 弾薬は赤のまま。危険は点滅白枠＋頭上赤字で表す |
| Q7 | 計器の数値は既定で非表示、タップで 1.5 秒表示 |
| Q8 | 頭上赤字（#283）は残す |
| Q9 | 解体・売却は確認ダイアログ |
| Q10 | ピンチ・ダブルタップは Explore の地図だけ |
| Q11 | 新規導入中は次の行き先以外のタブを押せない |
| Q12 | 物資市場は今の Trade 画面へ移動 |

## 2. PR 分割
1 外枠シェル ／ 2 HUD 表示 → 2b パレット ／ 3 計器 ／ 4 HUB ツリー → 4b 機体・資源パレット → 4c 現場パレット ／ 5 ジェスチャー ／ 6 各画面フィット。

各 PR 共通：`scripts/verify-new-game-intro.cjs` 必須 PASS、#332 の導入順路と戻る対策を壊さない、セーブ・チェックポイント互換テストを付ける。

## 3. PR1 外枠シェル（実装範囲）
- `packages/shared/src/fullscreen-shell.ts`。各モジュールの `boot.ts` が本体読込前に `mountFullscreenShell(module)` を呼ぶ。
- `html,body` を `100dvh` 固定・`overflow:hidden`。既存の `#app` はそのまま `#wl-shell-panel`（縦スクロール可・`overscroll-behavior:contain`）の中へ移すだけ。画面デザインは変えない。
- `body` は `touch-action:manipulation`（ダブルタップ拡大抑止）、タブバーは `touch-action:none`。地図のピンチ等は PR5。
- PC：`body` 最大幅 960px・中央寄せ（暫定・技術値）。
- シェルはセーブを読むだけで書かない（selftest で保存・チェックポイント不変を確認）。

## 4. タブ → 既存画面（暫定）
| タブ | モジュール |
|---|---|
| DOCK | trade（BASE HUB／格納庫） |
| INVADE | invade |
| SORT | sort |
| RESTORE | restore |
| SORTIE | explore |

### 有効・無効（PR1 時点）
- 現在のタブは押せない（表示のみ）。
- Q4：explore ページではタブバー自体を隠す。
- Q11：`newGameIntro` があり `firstSortie` 未記録の間は DOCK 以外を無効（導入の順路は HUB 内のボタンが持つ）。
- #332 保護：SORT がハンドオフ用クエリ付きで開いている間は全タブ無効（開封途中の離脱で戻る対策を迂回させない）。
- HUB セーブが無いときは DOCK のみ。

## 5. 未決（神宮確認待ち）
STATUS.md「全画面シェル PR1」節を参照。
