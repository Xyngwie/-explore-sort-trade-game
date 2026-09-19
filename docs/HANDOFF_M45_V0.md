# Handoff M4/M5 v0（trade ↔ invade / restore キー契約）

**ステータス:** 共有 KEY CONTRACT のみ（`packages/shared`）· 2026-09-19  
**目的:** Module 4（invade）・Module 5（restore）と Hub（Module 3 trade）の間で使う **URL クエリ鍵・型・build/parse** を先に固定する。  
**非ゴール（契約ドキュメント）:** モジュール間ナビの本配線・二重払い salvage。**追記:** 回路永続は HubSave v2 加算（`hub.circuits`）で Module 3 実装済み。

関連: [`INVADE_V0.md`](./INVADE_V0.md)、[`RESTORE_V0.md`](./RESTORE_V0.md)、[`TRADE_HANGAR_V0.md`](./TRADE_HANGAR_V0.md)、[`EXPLORE_IO_V2.md`](./EXPLORE_IO_V2.md)、`packages/shared` の `handoff.ts` / `constants.ts` / `circuit-board.ts`。

既存ハンドオフ（explore ↔ sort ↔ trade / wear）は **互換のまま**。本契約は加算のみ。

---

## 1. ひとことで

**invade は任意のルート選択（intel／sector）。restore は回路インスタンスの往復。どちらも本 salvage（YieldBag 満額）を払わない。**

---

## 2. クエリキー表

`HANDOFF_QUERY_KEYS`（`packages/shared/src/constants.ts`）:

| 方向 | キー定数 | クエリキー | ペイロード型 |
|---|---|---|---|
| trade → invade | `tradeToInvade` | `fromHub`, `deployableMechs?`, `startingAmmo?` | `TradeToInvadePayload` |
| invade → trade | `invadeToTrade` | `sectorX`, `sectorY`, `density`, `intelFlags?` | `InvadeToTradePayload` |
| invade → explore | `invadeToExplore` | `sectorX`, `sectorY`, `density`, `intelFlags?` | `InvadeToExplorePayload` |
| trade → restore | `tradeToRestore` | `circuitId?`, `circuitBoard?` | `TradeToRestorePayload` |
| restore → trade | `restoreToTrade` | `circuitId?`, `circuitBoard`, `circuitOutcome` | `RestoreToTradePayload` |

既存（変更なし）:

| 方向 | キー定数 |
|---|---|
| explore → sort | `exploreToSort` |
| sort → trade | `sortToTrade` |
| trade → explore | `tradeToExplore` |
| explore → hub wear | `exploreToHubWear` |

---

## 3. 方向ごとの契約

### 3.1 trade → invade（任意）

```ts
type TradeToInvadePayload = {
  fromHub: true;           // URL: fromHub=1
  deployableMechs?: number; // 健在機数の要約（配備コミットではない）
  startingAmmo?: number;    // 任意の弾薬スナップショット
};
```

例:

```text
?fromHub=1&deployableMechs=2&startingAmmo=28
```

- invade は **毎ループ必須ではない**（quick-battle / 直接 trade→explore を残す）。
- `deployedInstanceIds` は載せない（配備は trade→explore のまま）。

### 3.2 invade → trade（セクター結果）

```ts
type InvadeToTradePayload = {
  sectorX: number;
  sectorY: number;
  density: number;       // 0..1
  intelFlags?: string[]; // 短トークン。本 salvage ではない
};
```

例:

```text
?sectorX=3&sectorY=-2&density=0.300&intelFlags=routeHint,rareSignal
```

**禁止:** `yieldBag` / `importMaterials` / `salvagedContainers` を invade 成果として載せない（二重払い防止）。

### 3.3 invade → explore（後続配備コンテキスト）

キーは invade→trade と同じセクター組。explore が後で読めるよう `sectorX` / `sectorY` / `density` / `intelFlags?` を渡す。

- trade→explore の配備キー（`deployableMechs` / `deployedInstanceIds` / …）と **衝突しない**。
- 将来の結合用ヘルパ: `mergeInvadeSectorOntoExploreUrl(exploreUrl, sector)`。

### 3.4 trade → restore

```ts
type TradeToRestorePayload = {
  circuitId?: string;
  circuitBoard?: CircuitBoardState; // compact: encodeCircuitBoardCompact
};
```

例:

```text
?circuitId=board_demo&circuitBoard=1|8|8|<edgeState>|stub-8|
```

compact 形: `v|cols|rows|edgeState|puzzleId|outcome`（`circuit-board.ts`）。

### 3.5 restore → trade

```ts
type RestoreToTradePayload = {
  circuitId?: string;
  circuitBoard: CircuitBoardState; // outcome 埋め込み可
  outcome: "fully_awakened" | "bypass" | "offline";
};
```

例:

```text
?circuitId=board_demo&circuitBoard=1|8|8|<edge>|stub-8|bypass&circuitOutcome=bypass
```

`circuitOutcome` は strip / 存在検出用の明示キー。盤の `outcome` と一致させる。

---

## 4. 明示的非ゴール

| 非ゴール | 理由 |
|---|---|
| invade / restore の **本ナビ配線**（ボタンで実遷移） | 契約先行。UI はスタブコメントまで |
| invade からの **本 salvage / 満額 YieldBag** | 報酬分割（PRODUCT_VISION §4 / INVADE_V0） |
| invade **必須化** | quick-battle / 直接 explore を残す |
| HubSave v3 版上げ | 回路は HubSave v2 加算（`hub.circuits`）。セクター永続は後続 |
| 既存 explore/sort/trade/wear キーの破壊的変更 | 互換維持 |

---

## 5. shared API 一覧

| API | 役割 |
|---|---|
| `buildTradeToInvadeUrl` / `parseTradeToInvadeSearch` | hub → invade |
| `buildInvadeToTradeUrl` / `parseInvadeToTradeSearch` | invade → hub |
| `buildInvadeToExploreUrl` / `parseInvadeToExploreSearch` | invade → explore |
| `mergeInvadeSectorOntoExploreUrl` | セクターを既存 explore URL に加算 |
| `buildTradeToRestoreUrl` / `parseTradeToRestoreSearch` | hub → restore |
| `buildRestoreToTradeUrl` / `parseRestoreToTradeSearch` | restore → hub |
| `encodeCircuitBoardCompact` / `parseCircuitBoardCompact` | 盤のクエリ用圧縮 |

`stripHandoffParams` + 対応する `HANDOFF_QUERY_KEYS.*` で取込後のクエリ削除（配線時）。

---

## 6. 受け入れ（本 PR）

1. `npm run test -w @estg/shared` が通る（M45 往復セルフテスト含む）  
2. 既存 explore/sort/trade/wear ハンドオフのセルフテストが落ちない  
3. `docs/HANDOFF_M45_V0.md` と INVADE / RESTORE / TRADE への短いポインタがある  
4. UI 本配線なし（任意の stub コメントのみ可）

---

## 7. 後続（配線チケット案）

1. ~~trade ハンガーに「戦線へ（任意）」「回路修復へ」リンク（上記 builder）~~ → `packages/trade` で取込・リンク実装（結果は `hubM45Stash`、HubSave 未拡張）  
2. ~~invade → explore セクターを explore が読んで脅威に反映~~ → `packages/explore`（density→敵数/距離/速度 · strip）。invade 側ナビは既存リンク  
3. restore 完了 → trade（`circuitOutcome` 取込）※ restore 側ナビは別チケット · Hub 在庫更新はスタッシュ表示まで  
4. HubSave への `CircuitBoardState` 永続（版上げ要否は別判断）
