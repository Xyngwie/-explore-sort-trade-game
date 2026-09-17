# @estg/explore

Module 1（探索 / WRECKLINE）振る舞い垂直スライス。

正本は本パッケージ。旧 `.grok.me` Module1 は練習用／退役（URL 非依存）。

仕様: [`docs/EXPLORE_BEHAVIOR_V0.md`](../../../docs/EXPLORE_BEHAVIOR_V0.md)  
入出力: [`docs/EXPLORE_IO_V2.md`](../../../docs/EXPLORE_IO_V2.md)

## 動かす

リポジトリルートで:

```bash
npm install
npm run dev:explore
npm run test -w @estg/explore
```

## 操作

| 入力 | 効果 |
|---|---|
| WASD / 矢印 | 隊長移動 |
| マップクリック | 隊長移動目標 |
| Space / F | 射撃 |
| E | 回収チャネル（接触時） |
| 右パネル | 僚機 帯同／哨戒／回収／遊撃／召還（画面外でも可） |

## データの流れ

1. （任意）`?deployableMechs=&startingAmmo=&deployedInstanceIds=` を trade から受取  
2. 出撃 → 探索発見 → 回収（完了で自動帯同）→ 脱出  
3. sort へサルベージ URL、ids があるとき hub へ摩耗 URL（フラット returnKind scaffold）
