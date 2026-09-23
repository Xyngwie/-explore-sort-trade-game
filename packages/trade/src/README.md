# @estg/trade

Module 3（BASE HUB）の最小ハンガー実装。

## 動かす

リポジトリルートで:

```bash
npm install
npm run dev:trade
```

## データの流れ

1. localStorage `wreckline.hubSave.v1` から HubSave v2 をロード（`hub.circuits` 含む；旧 `wreckline.hubM45Stash.v0` の回路は移行）  
2. （任意）sort / explore wear / invade / restore クエリを取り込み（restore → `hub.circuits` upsert）  
3. 「次の出撃」パネルで配備予定・要修理・戻りインテルを要約し、健在機だけ出撃リンク（`deployedInstanceIds` + `mechDurability`）を生成  
4. explore から `returnKind`/`mechWear` 帰還、またはシミュ帰還で摩耗適用・セーブ更新  
5. 修理（集計 / 型付き）· スクラップ  
5b. レア YieldBag 売却（明示仮価格表 `RARE_SELL_PRICE_TABLE` · TBD）  
5c. 保有回路: 効果値表示 + 売却（仮 = 最低30c + 有効値×3c · 共通スコア / 効果0は +30c 可）  
6. 「戦線へ」「回路修復へ」で invade / restore プレビュー URL（HANDOFF_M45）  

localhost 往復: trade `:5175` ↔ explore `:5173` / invade `:5176` / restore `:5177`  

詳細: [`docs/TRADE_HANGAR_V0.md`](../../docs/TRADE_HANGAR_V0.md)
