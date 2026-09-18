# @estg/trade

Module 3（BASE HUB）の最小ハンガー実装。

## 動かす

リポジトリルートで:

```bash
npm install
npm run dev:trade
```

## データの流れ

1. localStorage `wreckline.hubSave.v1` から HubSave v2 をロード（+ `wreckline.hubM45Stash.v0`）  
2. （任意）sort / explore wear / invade / restore クエリを取り込み  
3. 健在機だけ出撃リンク（`deployedInstanceIds` + `mechDurability`）を生成  
4. explore から `returnKind`/`mechWear` 帰還、またはシミュ帰還で摩耗適用・セーブ更新  
5. 修理（集計 / 型付き）· スクラップ  
6. 「戦線へ」「回路修復へ」で invade / restore プレビュー URL（HANDOFF_M45）  

localhost 往復: trade `:5175` ↔ explore `:5173` / invade `:5176` / restore `:5177`  

詳細: [`docs/TRADE_HANGAR_V0.md`](../../docs/TRADE_HANGAR_V0.md)
