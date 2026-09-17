# @estg/trade

Module 3（BASE HUB）の最小ハンガー実装。

## 動かす

リポジトリルートで:

```bash
npm install
npm run dev:trade
```

## データの流れ

1. localStorage `wreckline.hubSave.v1` から HubSave v2 をロード  
2. （任意）sort からの `?importMaterials=&yieldBag=` / explore からの `?returnKind=&mechWear=` を取り込み  
3. 健在機だけ出撃リンク（`deployedInstanceIds`）を生成  
4. 修理（集計 / 型付き）・スクラップ・シミュ帰還でセーブ更新  

詳細: [`docs/TRADE_HANGAR_V0.md`](../../docs/TRADE_HANGAR_V0.md)
