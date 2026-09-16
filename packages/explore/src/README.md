# @estg/explore

Module 1（探索）の最小実装。

## 動かす

リポジトリルートで:

```bash
npm install
npm run dev:explore
```

## データの流れ

1. （任意）`?deployableMechs=&startingAmmo=` を trade から受取  
2. 出撃 → コンテナ回収 → 脱出  
3. `buildExploreToSortUrl` で精製炉へ渡すリンクを生成  

本編 WRECKLINE のグラフィック／リアルタイム戦闘は後続PR。
