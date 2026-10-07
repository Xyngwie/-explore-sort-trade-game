# Explore コマンド回路解放 — 基盤 v0

**ステータス:** 基盤のみ実装（2026-09-28）。回路→コマンドの対応表・レア度は **未決定**（別タスク / Phase 3。レア度は 2026-10-07 に後回しと決定）。回路なしのベースラインは **決定**（2026-10-07 神宮、§1.1。~~今の実装との差は実装待ち~~ → 変更（10/7・神宮）: 画面の表示と `wing_mobility` の前提は C20-a で実装。残りは §1.1.1）。**未解放のコマンドは見せない**（10/7 8:07 神宮、§1.2）。  
**正本コード:** `packages/explore/src/game/commandUnlock.ts`（判定）、`game/commands.ts`（実行側ゲート）、`game/unlockMode.ts`（モード切替）

**関連する設計決定（回路・部隊 v0、本書との差分つき）:** [`CIRCUIT_SQUAD_DESIGN_V0.md`](./CIRCUIT_SQUAD_DESIGN_V0.md)

## 1. 目的

隊長機は初期状態では意図的に制限され、回路を入手・装備・強化するほど Explore の行動が広がる。本書はその **共通基盤** だけを定める。

- 回路なしでも常に使える **基本 4**: 歩く（移動）／戦う（射撃）／回収する／帰還する（抽出要請・撤退）
- プレイヤー向けの「基本 4」は行動のまとまりである。帰還はコマンド ID が `extract` と `abort` の 2 件なので、ゲートの `BASIC_COMMAND_IDS` は 5 件（`move` / `fire` / `collect` / `extract` / `abort`）になる。5 件とも `tier: "basic"` で、どのモードでも解放される。
- それ以外のプレイヤー発行コマンドは原則 **回路で解放**（circuit tier）
- 回路なしでも最低限プレイ可能であること

## 1.1 回路なしのベースライン（2026-10-07 神宮）

- 回路なしでできること:
  - **隊長**: 移動・攻撃・回収・帰還（上の「基本 4」と同じ）。
  - **僚機**: 攻撃だけ。移動もしない。
- それ以外はすべて回路で解放する。帯同・哨戒・遊撃は高レベルの行動。→ 変更（10/7・神宮）: 帯同・哨戒・遊撃・回収と召還は、その僚機の `wing_mobility` の解放が前提。
- 背負い: 隊長はいつでも背負える。僚機は ~~`wing_recover` を解放したときだけ~~ `wing_mobility` と `wing_recover` を両方解放したときだけ背負える（→ 変更（10/7・神宮）。[`CIRCUIT_SQUAD_DESIGN_V0.md`](./CIRCUIT_SQUAD_DESIGN_V0.md) §6）。
- 今後の解放の予定（未実装。コマンド ID も挙動も未定）: 回避・接近・離脱。武器の種類を変える回路。
- レア度とチャーム型回路は計画として残すが後回し。特殊効果は今は入れない。

### 1.1.1 今の実装との比較（2026-10-07、main `c197b4a` のコードを読んだ範囲 → C20-a で更新）

「今の実装」は release（`VITE_EXPLORE_RELEASE_LOCKS=1` のビルド、またはプレビューの DEBUG トグル「リリース相当」）で回路なしのときの挙動。~~表の「要ること」はすべて **実装待ち**（STATUS 項目16）。~~ → 変更（10/7・神宮）: 表示と `wing_mobility` の前提は C20-a で実装済み。残りは表の「要ること」（STATUS 項目16）。ここでは新しい遊び方を決めない。

**ベースラインの追加決定（2026-10-07・神宮）:**

1. 移動できない僚機（`wing_mobility` なし）の離昇時の扱いは **今のまま**（搭乗円の内側なら回収、外なら置き去り）。
2. 攻撃だけの僚機は、その場で武器射程内の敵だけ撃つ。**今のまま**。
3. 帯同・哨戒・遊撃は `wing_mobility` の解放が前提。→ 変更（10/7 14:13・神宮）: **回収と召還も** `wing_mobility` が前提。僚機ごとに判定する（`isCommandUnlockedFor` の僚機指定と小隊単位の両方。C20-a で実装）。僚機が背負うには `wing_mobility` と `wing_recover` の両方が要る（背負いは未実装なので文書だけ。STATUS 項目4）。
4. 公開プレビューは、対応表ができるまで **全解放のまま**。
5. 隊長の「帰還」は抽出要請と撤退の両方を含む。撤退が回路なしで使えるのは正しい。

**表の設計でそろえる（差として残す）:** カバー（V）と散開捜索は回路でゲートしていない（散開捜索は未解放の僚機も動かす）。本番の対応表 `CIRCUIT_COMMAND_UNLOCKS` は空。

| 項目 | 決定 | 今の実装 | 一致 | 要ること（実装待ち） |
|---|---|---|---|---|
| 隊長の移動・攻撃・回収・帰還 | 回路なしで可 | `move`・`fire`・`collect`・`extract`・`abort` は `tier: "basic"` で常に可 | 一致（帰還＝抽出要請と撤退の 2 件、という §1 の読み方のまま → 決定（10/7・神宮）: 帰還は両方を含み、撤退が回路なしなのは正しい） | なし |
| 隊長のその他（キャンプ設置・小隊荷下ろし・キャンプから積込・パージ・散開捜索） | 回路で解放 | `tier: "circuit"`。回路なしはロック（→ 変更（10/7・神宮）: ボタン・キー・ショートカット表・ヘルプから消え、ログも出ない。C20-a） | ロックは一致 | 本番の対応表 `CIRCUIT_COMMAND_UNLOCKS` が空なので、回路を付けても解放されない。対応表が要る |
| 僚機の攻撃 | 回路なしで可（攻撃だけ） | `brain.ts decideWingman` の冒頭: `wing_mobility` が無ければその場で、武器射程（`weaponRange`）内の最寄りの敵だけ撃つ（§3.1） | 一致（→ 決定（10/7・神宮）: 今のまま） | なし |
| 僚機の移動・追従 | 回路なしでは動かない | 能力 `wing_mobility` が、追従・方針ごとの移動・コンテナ回収をまとめてゲート。回路なしは出撃地点で静止 | 一致 | 対応表が空なので、回路で移動を解放できない |
| 小隊方針 帯同・哨戒・回収・遊撃（キー 1〜4・僚機カード） | 回路で解放。帯同・哨戒・遊撃は高レベル（→ 変更（10/7・神宮）: 4 つとも、召還も `wing_mobility` が前提） | `wing_escort`・`wing_patrol`・`wing_recover`・`wing_raid` を僚機ごとにゲート。回路なしはロック。~~方針を解放しても `wing_mobility` が無ければ動かない（解放は別々）~~ → 変更（10/7・神宮）: その僚機に `wing_mobility` が無ければ方針・召還もロック。小隊単位の判定は生きている僚機だけを数える。ロック中のボタンは出さない（C20-a） | 一致 | 対応表が空。~~「高レベル」をどう表すか（どの回路で、`wing_mobility` とどう組むか）は対応表と一緒に決める~~ → どの回路で解放するかは対応表と一緒に決める |
| システムの自動方針（抽出要請で円の中心を哨戒、回収後に帯同へ戻る） | ~~決定なし~~ → 変更（10/7・神宮）: 移動できない僚機の離昇時は今のまま | ゲートしない。`wing_mobility` が無い僚機は動かないので、搭乗円の外なら離昇で置き去り（結果画面に ~~「回路なし」~~ 「搭乗円の外・自衛のみ」） | 一致 | ~~決定なし（神宮の確認待ち）~~ → なし |
| 隊長が背負う | いつでも可 | コンテナの回収（`collect`）は常に可。大破機・僚機を背負う処理は無い（`outcome.ts`: 背負いは未実装なので、大破機はすべて「背負わなかった」扱い） | コンテナは一致。機体は未実装 | 背負い（STATUS 項目4）の実装で入れる |
| 僚機が背負う | ~~`wing_recover` を解放したときだけ~~ → 変更（10/7・神宮）: `wing_mobility` と `wing_recover` の両方 | コンテナは方針 `recover`（`wing_recover`。動くには `wing_mobility` も要る）でだけ運ぶ。機体を背負う処理は無い | コンテナは一致。機体は未実装 | 背負いの実装で ~~`wing_recover`~~ `wing_mobility`＋`wing_recover` を条件にする |
| 回避・接近・離脱 | 今後の解放 | コマンド ID なし | 未実装 | ID と挙動（未定） |
| 武器の種類を変える回路 | 今後の解放 | なし | 未実装 | 未定 |
| プレビュー（GitHub Pages）の既定 | — | `all_unlocked`。回路なしでも僚機は動き、全コマンドが使える。ベースラインは DEBUG トグル「リリース相当」か release ビルドでだけ見える | 差あり（→ 決定（10/7・神宮）: 対応表ができるまで全解放のまま） | ~~既定を変えるかは神宮の確認待ち~~ → なし（対応表ができてから） |

## 1.2 未解放のコマンドは見せない（2026-10-07 8:07 神宮・C20-a）

**方針:** 「未解放のコマンドは見せない。主人公はどんな回路があるか知らず、何ができるようになるかも知らない（10/7 8:07 神宮）」

C20-a（14:13 に確定）で実装したこと（release、または DEBUG「リリース相当」のとき。全解放のプレビューは見た目が今までと同じ）:

- ロック中のボタンは出さず、レイアウトを詰める（空きは残さない）。対象は隊長のボタン 5 つ（キャンプ設置・小隊荷下ろし・パージ・キャンプから積込・散開捜索）、小隊方針のボタン、僚機カードの方針と召還。
- ボタンが 1 つも残らない小隊方針バーは、2 か所（地図の下・僚機パネルの上）ともバーごと消す。
- 僚機カードのボタンは僚機ごとに判定する（`isCommandUnlockedFor(id, w.id)`）。
- ロック中のキー（C/U/G/P/1–4）は何もしない。ログも出さない（🔒 のロックメッセージは廃止）。
- ショートカット表と地図の下のヘルプは、解放済みのコマンドだけを載せる（解放状態から組み立てる）。
- 僚機カードの「🔒 回路なし：自衛のみ」とツールチップ「移動は回路で解放…」は消す。バッジ「自衛のみ」とマップのラベルは残す。
- 結果画面は「僚機Aを置き去り（搭乗円の外・自衛のみ）」。
- 帯同・哨戒・遊撃・回収と召還は、その僚機の `wing_mobility` が前提（§1.1.1 の決定 3）。
- 小隊単位の判定は、生きている僚機の回路だけを数える。
- ツールチップ「🔒 回路で解放（未装備）」（`LOCK_TITLE`）は廃止。
- 一部の僚機だけ解放済みの小隊方針は main と同じ: 解放済みの僚機だけが従い、未解放の僚機はそのまま（ログなし）。
- DEBUG トグルの帯と、公開プレビューの全解放の既定はそのまま（§5）。

**続き（PR-b）:** 一部の僚機だけ解放済みの小隊方針で、従えない僚機が頭の上に「？」を出し、50/50 で「止まる」か「無視」する反応は、次の PR（C20-b）で入れる（[`CIRCUIT_SQUAD_DESIGN_V0.md`](./CIRCUIT_SQUAD_DESIGN_V0.md) §9.2 C20）。

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

- ボタンもキー入力も **必ず** `executeExploreCommand` を通る。ロック中は実行されず、~~戦術ログに `🔒 …：回路未装備のためロック中` を 1 回出す。~~ → 変更（10/7・神宮）: 何もログに出さない（`lockedCommandMessage` は削除）。ロック中のキーは `dispatchExploreKey` が `null` を返し、何もしない。
- 基本 4（ゲート上は `BASIC_COMMAND_IDS` の 5 件）はどのモードでも常に true。
- UI: ~~ロック中のボタンは `disabled` + 破線 + 「🔒」付き（`.cmd-locked` / `data-cmd-locked="1"`）。ショートカット表の行も「🔒 …（回路）」表示。~~ → 変更（10/7・神宮）: ロック中のボタンもショートカット表の行も出さない（§1.2）。出撃中に小隊単位の判定が変わったら（僚機の撃破など）、出撃画面を組み直す。
- `isCommandUnlockedFor` の僚機コマンド: 帯同・哨戒・回収・遊撃（召還は `wing_escort`）は、その僚機の `wing_mobility` も要る。小隊単位（`unitId` なし）は `world.wingmen` の生きている僚機のどれかが通れば true（`wingmen` を持たない呼び出しは従来どおり `wing-*` の回路の配列で判定）。

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
- 方針コマンド（帯同／哨戒／回収／遊撃・1–4）は `wing_*` として従来どおり別にロック。→ 変更（10/7・神宮）: そのうえで `wing_mobility` も前提（召還も）。
- UI: ~~僚機カードに「🔒 回路なし：自衛のみ」、~~ 状態バッジ「自衛のみ」、マップ上のラベルも「僚機A·自衛のみ」。→ 変更（10/7・神宮）: カードの「🔒 回路なし：自衛のみ」の行とツールチップは削除。
- **出撃中のモード切替**: 毎 tick 判定するので **即時反映**。release に切り替えるとその場で止まり（回収チャネルは中断）、戻すと再び動く。
- **抽出・撤退**: 既存ルールのまま。搭乗円は隊長位置に展開されるため、動けない僚機が円外なら離昇時に「置き去り」（既存ルール・意図された失敗体験。救済ロジックは入れない）。撤退は従来どおり。Hub への摩耗出力は従来どおり returnKind ごとの一律減で、配備した全機が同じ形で出力される。
- **置き去りの結果画面表示**: 決めた失敗体験はプレイヤーが気づかないと成立しないため、離昇時に搭乗円外だった僚機ごとに結果画面へ 1 行だけ出す（`game/leftBehind.ts`、`#result-left-behind`）。
  - 回路なし（`wing_mobility` 未解放で動けなかった）: ~~「僚機Aを置き去り（回路なし・搭乗円の外）」~~ → 変更（10/7・神宮）: 「僚機Aを置き去り（搭乗円の外・自衛のみ）」
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
純関数判定、モード解決・保存、`wing_mobility`（両モード、暫定表での解放、静止・自衛射撃・追跡なし・回収なし、出撃中切替、既存抽出ルールでの置き去りと出力形の不変）、置き去り結果行（回路なし／回路あり・円外／置き去りなし／撤退の各ケース、handoff・Hub 出力に漏れないこと）、all_unlocked で全実行、release・回路なしで回路コマンドがボタン／キー経路ともブロックされ基本 4（`BASIC_COMMAND_IDS` の 5 件）は動作、テスト専用の暫定対応表で装備時に解放、~~ショートカット表のロック表示~~ → 変更（10/7・神宮）: ロック中のキーは何もせずログも出ない・ショートカット表はロック中の行を出さない（全解放では従来と同じ HTML）・`explore C20-a mobility prerequisite + alive-only squad check`（方針と召還の `wing_mobility` 前提、生きている僚機だけで小隊単位を判定、混在小隊にロックの文言が出ないこと）。暫定対応表はテスト内にのみ存在し、本番の `CIRCUIT_COMMAND_UNLOCKS` は空であることもテストで固定している。
