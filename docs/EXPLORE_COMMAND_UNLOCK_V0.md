# Explore コマンド回路解放 — 基盤 v0

**ステータス:** 基盤のみ実装（2026-09-28）。回路→コマンドの対応表・レア度は **未決定**（別タスク / Phase 3）。  
**正本コード:** `packages/explore/src/game/commandUnlock.ts`（判定）、`game/commands.ts`（実行側ゲート）、`game/unlockMode.ts`（モード切替）

**関連する設計決定（回路・部隊 v0、本書との差分つき）:** [`CIRCUIT_SQUAD_DESIGN_V0.md`](./CIRCUIT_SQUAD_DESIGN_V0.md)

## 1. 目的

隊長機は初期状態では意図的に制限され、回路を入手・装備・強化するほど Explore の行動が広がる。本書はその **共通基盤** だけを定める。

- 回路なしでも常に使える **基本 4**: 歩く（移動）／戦う（射撃）／回収する／帰還する（抽出要請・撤退）
- プレイヤー向けの「基本 4」は行動のまとまりである。帰還はコマンド ID が `extract` と `abort` の 2 件なので、ゲートの `BASIC_COMMAND_IDS` は 5 件（`move` / `fire` / `collect` / `extract` / `abort`）になる。5 件とも `tier: "basic"` で、どのモードでも解放される。
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
| `wing_mobility` | 回路（能力） | 入力なし。僚機が移動できるか | `brain.ts decideWingman` 冒頭の分岐（§3.1） |

僚機方針は id を分けてある。解放判定は現行実装どおり機体ごとで、隊長のコマンドは `leader` の回路、対象僚機を指定した方針はその僚機の回路を見る（`isCommandUnlockedFor`）。どの回路がどの id を解放するかの対応表は未決定（Phase 3。本番の `CIRCUIT_COMMAND_UNLOCKS` は空）。

### 対象外（ゲートしない）と理由

- **カバー（V / 旧カバーボタン）**: #120 以降カバーはオブジェクト接触式（移動の一部）。旧グローバルトグルは `keyboardOverlay.ts` のガードで無効化済み。カバー挙動は変更しない。
- **ショートカット表示（? / 「隠す」「キー」）**: UI 表示切替でゲームプレイに影響しない。
- **カメラ**: 自動追従で、プレイヤーコマンドではない。
- **出撃・結果画面の CTA（Sort へ／格納庫へ／再出撃）**: モジュール遷移であり Explore の行動ではない。
- **システムが行う自動方針変更**（抽出要請時の僚機哨戒、回収完了後の帯同復帰、僚機 AI）: プレイヤーコマンドではないのでゲートしない。
- **僚機の帯同（出撃に連れて行くこと）自体**: ゲートしない。回路がなくても僚機は常に出撃に同行する（移動できるかは `wing_mobility`）。

## 3. API

```ts
// commandUnlock.ts（純関数）
isCommandUnlocked(commandId, equippedCircuits, { mode?: "all_unlocked" | "release", table? }): boolean
isCommandUnlockedFor(world, commandId, unitId?): boolean  // world.commandUnlock を使う
CIRCUIT_COMMAND_UNLOCKS: CircuitCommandUnlockTable     // 本番の対応表 = 空（Phase 3 で決める）

// commands.ts（実行側ゲート）
executeExploreCommand(world, { id, wingId?, rally? }): { status: "locked" | "done", ... }
dispatchExploreKey(world, key, { repeat? })            // main.ts keydown はここを通る
```

- ボタンもキー入力も **必ず** `executeExploreCommand` を通る。ロック中は実行されず、戦術ログに `🔒 …：回路未装備のためロック中` を 1 回出す。
- 基本 4（ゲート上は `BASIC_COMMAND_IDS` の 5 件）はどのモードでも常に true。
- UI: ロック中のボタンは `disabled` + 破線 + 「🔒」付き（`.cmd-locked` / `data-cmd-locked="1"`）。ショートカット表の行も「🔒 …（回路）」表示。

### 3.1 僚機の移動（`wing_mobility`）

```ts
isWingmanMobilityUnlocked(wingmanId, equippedCircuits, { mode, table }): boolean
isWingmanMobileFor(world, wingmanId): boolean
```

- `isWingmanMobilityUnlocked(wingmanId, equippedCircuits, …)` は純関数である。僚機 ID は受け取るが判定には使わない。渡された回路 ID の配列と対応表だけを見る。
- `isWingmanMobileFor(world, wingmanId)` が `equippedByUnit` からその僚機の配列を取り、上の純関数へ渡す。`release` で `commandUnlock` があるとき、機体ごとに装備が異なれば移動可否も独立する。`all_unlocked`、または `commandUnlock` が無いときは、装備にかかわらず移動する。
- **all_unlocked（プレビュー既定）**: 従来どおり移動する。
- **release・回路なし**: 僚機は同行するが **移動しない**（追従・方針ごとの移動・探索・回収なし）。出撃開始地点に留まり、**武器射程内の敵だけをその場から撃つ（自衛）**。追いかけない。
  - 実装は `decideWingman` 冒頭の 1 分岐のみ: `moveTarget: null`・`trySalvage: false`・`fireAt` = 射程（`weaponRange`）内の最寄りの敵。回収チャネル中なら中断。それ以外の僚機 AI は変更なし。
  - 視界による発見（`revealVision`）は位置ベースの受動処理なので、立っている場所の周囲は従来どおり見える。
- 方針コマンド（帯同／哨戒／回収／遊撃・1–4）は `wing_*` として従来どおり別にロック。
- UI: 僚機カードに「🔒 回路なし：自衛のみ」、状態バッジ「自衛のみ」、マップ上のラベルも「僚機A·自衛のみ」。
- **出撃中のモード切替**: 毎 tick 判定するので **即時反映**。release に切り替えるとその場で止まり（回収チャネルは中断）、戻すと再び動く。
- **抽出・撤退**: 既存ルールのまま。搭乗円は隊長位置に展開されるため、動けない僚機が円外なら離昇時に「置き去り」（既存ルール・意図された失敗体験。救済ロジックは入れない）。撤退は従来どおり。Hub への摩耗出力は従来どおり returnKind ごとの一律減で、配備した全機が同じ形で出力される。
- **置き去りの結果画面表示**: 決めた失敗体験はプレイヤーが気づかないと成立しないため、離昇時に搭乗円外だった僚機ごとに結果画面へ 1 行だけ出す（`game/leftBehind.ts`、`#result-left-behind`）。
  - 回路なし（`wing_mobility` 未解放で動けなかった）: 「僚機Aを置き去り（回路なし・搭乗円の外）」
  - 回路あり・単に搭乗円の外: 「僚機Aを置き去り（搭乗円の外）」
  - 置き去りなし・撤退時: 行は出ない。
  - 判定は離昇の瞬間の `isWingmanMobileFor`。記録は Explore 内部の `world.leftBehind` のみで、`ExploreResult`／`ExploreSortieOutcome`／Sort・Hub 摩耗 URL には含めない（Hub への出力形式は不変）。隊長が円外で脱出失敗の場合も、円外の僚機は既存ログと同じく列挙される。
  - 救済処理・大破機体の持ち帰りは設計中のため入れていない。

## 4. 回路装備状態の出どころ（現行契約）

- `World.commandUnlock` は **Explore ローカルの判定状態**であり、HubSaveそのものを保存する契約ではない。
- 現行の型は `CommandUnlockState = { mode, equippedByUnit: Record<unitId, string[]>, table? }`。旧 `equippedCircuits: string[]` ではない。
- `packages/explore/src/game/circuitJudgement.ts` の `buildEquippedByUnit()` が、Trade→Explore の `mechCircuits`（`instanceId` keyed）を、出撃順に `leader` / `wing-a` / `wing-b` の Explore unitIdへ変換する。
- この変換時、`restoreState` が `fully_awakened` または `bypass` の回路だけを `equippedByUnit` に入れる。 `offline` と `unrestored` は回路判定の対象にならない。
- `packages/shared` 側の canonical ownership は引き続き `HubSave.circuits` と `equippedTo = instanceId`。Explore は受け取った出撃対象だけを機体単位へ写像する。
- `mechCircuits` は任意の後方互換フィールドである。旧 URL などでこのフィールドが無いとき、`buildEquippedByUnit()` は `{}` を返す。`createWorld` はその場合も `commandUnlock` を必ず作る。プレビュー既定の `all_unlocked` では、装備が空でも全コマンドが動く。`release`（`VITE_EXPLORE_RELEASE_LOCKS`、または DEBUG の release）で `mechCircuits` が無いと、`equippedByUnit` は空のまま回路コマンドはロックされる。
- `commandUnlock` 自体が無い呼び出しでは、`isCommandUnlockedFor()` と `isWingmanMobileFor()` は全解放の旧挙動を返す。これは World を持たない呼び出し向けの保険で、`mechCircuits` の有無とは別の条件である。
- 本番の `CIRCUIT_COMMAND_UNLOCKS` は現在も空。回路→コマンドの具体的な対応表は未決定であり、この文書では新しい対応を定義しない。

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
純関数判定、モード解決・保存、`wing_mobility`（両モード、暫定表での解放、静止・自衛射撃・追跡なし・回収なし、出撃中切替、既存抽出ルールでの置き去りと出力形の不変）、置き去り結果行（回路なし／回路あり・円外／置き去りなし／撤退の各ケース、handoff・Hub 出力に漏れないこと）、all_unlocked で全実行、release・回路なしで回路コマンドがボタン／キー経路ともブロックされ基本 4（`BASIC_COMMAND_IDS` の 5 件）は動作、テスト専用の暫定対応表で装備時に解放、ショートカット表のロック表示。暫定対応表はテスト内にのみ存在し、本番の `CIRCUIT_COMMAND_UNLOCKS` は空であることもテストで固定している。
