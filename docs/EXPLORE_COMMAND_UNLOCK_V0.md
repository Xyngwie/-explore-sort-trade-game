# Explore コマンド回路解放 — 基盤 v0

**ステータス:** 基盤のみ実装（2026-09-28）。回路→コマンドの対応表・レア度は **未決定**（別タスク / Phase 3）。  
**正本コード:** `packages/explore/src/game/commandUnlock.ts`（判定）、`game/commands.ts`（実行側ゲート）、`game/unlockMode.ts`（モード切替）

## 1. 目的

隊長機は初期状態では意図的に制限され、回路を入手・装備・強化するほど Explore の行動が広がる。本書はその **共通基盤** だけを定める。

- 回路なしでも常に使える **基本 4**: 歩く（移動）／戦う（射撃）／回収する／帰還する（抽出要請・撤退）
- それ以外のプレイヤー発行コマンドは原則 **回路で解放**（circuit tier）
- 回路なしでも最低限プレイ可能であること

## 2. コマンド一覧と分類

| id | 分類 | 入力 / UI | 実行関数 |
|---|---|---|---|
| `move` | 基本 | WASD・矢印・マップクリック | `sim.ts tickWorld`（連続入力） |
| `fire` | 基本 | Space / F（射程内は自動反応射撃も） | `sim.ts tickWorld` → `tryFire` |
| `collect` | 基本 | 自動（接触）/ E | `sim.ts tickWorld` → `updateSalvage` |
| `extract` | 基本（帰還） | X / 「抽出要請」ボタン | `sim.ts requestExtract` |
| `abort` | 基本（帰還） | 「撤退」ボタン | `commands.ts abortSortie` |
| `camp_set` | 回路 | C / 「キャンプ設置」 | `orders.ts setCampOrDeposit` |
| `camp_unload` | 回路 | U / 「小隊荷下ろし」 | `orders.ts unloadAtCamp` |
| `camp_pickup` | 回路 | G / 「キャンプから積込」 | `orders.ts pickUpFromCamp` |
| `purge` | 回路 | P / 「パージ／キャンプへ降ろす」 | `orders.ts purgeCargo` |
| `scatter_search` | 回路 | 「散開捜索」 | `orders.ts scatterSearch` |
| `wing_escort` | 回路 | 1 / 小隊方針「帯同」/ 僚機カード「帯同」「召還」 | `orders.ts applyOrder(escort)` / `rallyWingman` |
| `wing_patrol` | 回路 | 2 / 小隊方針・僚機カード「哨戒」 | `applyOrder(patrol)` |
| `wing_recover` | 回路 | 3 / 小隊方針・僚機カード「回収」 | `applyOrder(recover)` |
| `wing_raid` | 回路 | 4 / 小隊方針・僚機カード「遊撃」 | `applyOrder(raid)` |

僚機方針は将来「僚機回路で段階解放」する想定のため、方針ごとに別 id にしてある（対応表は未決定）。

### 対象外（ゲートしない）と理由

- **カバー（V / 旧カバーボタン）**: #120 以降カバーはオブジェクト接触式（移動の一部）。旧グローバルトグルは `keyboardOverlay.ts` のガードで無効化済み。カバー挙動は変更しない。
- **ショートカット表示（? / 「隠す」「キー」）**: UI 表示切替でゲームプレイに影響しない。
- **カメラ**: 自動追従で、プレイヤーコマンドではない。
- **出撃・結果画面の CTA（Sort へ／格納庫へ／再出撃）**: モジュール遷移であり Explore の行動ではない。
- **システムが行う自動方針変更**（抽出要請時の僚機哨戒、回収完了後の帯同復帰、僚機 AI）: プレイヤーコマンドではないのでゲートしない。
- **僚機の帯同（出撃に連れて行くこと）自体**: 将来は僚機回路が必要になる想定だが、今回は `isWingmanAccompanyUnlocked()` という **フックの形だけ** 用意し、どこからも呼んでいない（常に true）。新規ゲームで僚機が消えることはない。

## 3. API

```ts
// commandUnlock.ts（純関数）
isCommandUnlocked(commandId, equippedCircuits, { mode?: "all_unlocked" | "release", table? }): boolean
isCommandUnlockedFor(world, commandId): boolean        // world.commandUnlock を使う
CIRCUIT_COMMAND_UNLOCKS: CircuitCommandUnlockTable     // 本番の対応表 = 空（Phase 3 で決める）

// commands.ts（実行側ゲート）
executeExploreCommand(world, { id, wingId?, rally? }): { status: "locked" | "done", ... }
dispatchExploreKey(world, key, { repeat? })            // main.ts keydown はここを通る
```

- ボタンもキー入力も **必ず** `executeExploreCommand` を通る。ロック中は実行されず、戦術ログに `🔒 …：回路未装備のためロック中` を 1 回出す。
- 基本 4 はどのモードでも常に true。
- UI: ロック中のボタンは `disabled` + 破線 + 「🔒」付き（`.cmd-locked` / `data-cmd-locked="1"`）。ショートカット表の行も「🔒 …（回路）」表示。

## 4. 回路装備状態の出どころ（契約）

- `World.commandUnlock = { mode, equippedCircuits: string[], table? }` は **Explore ローカル**（セーブ／ハンドオフ契約ではない）。
- 現在、HubSave には「装備中の回路」という概念がなく（`HubSnapshot.circuits` は所持ボード一覧）、trade→explore には集計済み `circuitBonuses` しか渡っていない。したがって `equippedCircuits` は **常に `[]`**。
- 実際の装備状態を Explore に届けるには、trade→explore ハンドオフへの **任意・後方互換フィールド追加**（例: 装備回路キー一覧）が必要。これは契約変更なので **承認後の別タスク**。既存 URL キーは変更しない。

## 5. モード（プレビュー／リリース）

切替は **1 箇所**: `packages/explore/src/game/unlockMode.ts` の `EXPLORE_RELEASE_LOCKS`。  
ビルド時の Vite 環境変数 **`VITE_EXPLORE_RELEASE_LOCKS`** をここだけで読む。

| ビルド | 既定モード | DEBUG トグル |
|---|---|---|
| 通常（未設定 = GitHub Pages プレビュー） | `all_unlocked`（全コマンド解放＝従来どおり） | 表示 |
| `VITE_EXPLORE_RELEASE_LOCKS=1`（または `true`） | 常に `release` | 非表示 |

リリース相当ビルドの例: `VITE_EXPLORE_RELEASE_LOCKS=1 npm run build:explore`

### DEBUG トグル（プレビューのみ）

- 位置: 出撃前ブリーフィング画面のタイトル下、および出撃中画面の「WRECKLINE」見出し直下の破線バー（`#debug-unlock-bar` / ボタン `#btn-debug-unlock`）。
- 表示: `DEBUG 回路ロック: 全コマンド解放（プレイテスト）` または `リリース相当（回路なし＝基本4のみ）`。リリース相当中はバーが琥珀色。
- 保存: `localStorage["estg.explore.debugCommandUnlockMode"]` = `"all_unlocked"` | `"release"`（未設定・不正値は `all_unlocked`）。リロード・再出撃後も維持。HubSave には入れない。
- 出撃中に切り替えると即座に実行側ゲートにも反映される。

## 6. テスト

`npm run test -w @estg/explore` の `explore command unlock *` ブロック:
純関数判定、モード解決・保存、all_unlocked で全実行、release・回路なしで回路コマンドがボタン／キー経路ともブロックされ基本 4 は動作、テスト専用の暫定対応表で装備時に解放、ショートカット表のロック表示。暫定対応表はテスト内にのみ存在し、本番の `CIRCUIT_COMMAND_UNLOCKS` は空であることもテストで固定している。
