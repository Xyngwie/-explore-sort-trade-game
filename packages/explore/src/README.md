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
| Space / F | 射撃（任意・明示）。隊長は射程内なら自動反応射撃 |
| （自動）/ E | 発見済みコンテナに接触すると隊長は自動で回収チャネル（E は任意の明示） |
| X / 抽出ボタン | 抽出要請（どこからでも）。搭乗円展開 → 貨物 10s → 離昇 15s |
| C / キャンプ設置 | 隊長位置に仮設キャンプ設置／空キャンプ移設 |
| U / 小隊荷下ろし | 隊長がキャンプ付近なら**小隊全機**の積載を置場へ預ける |
| P / パージ | **小隊全機**：キャンプ付近は置場へ／それ以外は戦場投下して軽装化 |
| G / キャンプから積込 | キャンプ付近で置場から取り上げ |
| 右パネル／小隊バー | 僚機 帯同／哨戒／回収／遊撃／召還。小隊方針バー＋キー 1–4 で全僚機 |
| 上端 EXTRACT HUD | マップ上端：未要請はコンパクト、要請中は離昇秒・必須（隊長円内）・円内人数 |
| 時間切れ | 即失敗せず移動・積み下ろしロック。戦闘継続。進行中搭乗のみ脱出可 |

## データの流れ

1. （任意）`?deployableMechs=&startingAmmo=&deployedInstanceIds=&mechDurability=` を trade から受取  
1b. （任意）invade→explore: `?sectorX=&sectorY=&density=&intelFlags=&engage=&enemyCells=` → 脅威バイアス + 漁場バナー（`invadeIntelBannerText`）  
2. 出撃 → 探索発見 → 回収（完了で自動帯同）→ 抽出要請（搭乗円）／撤退  
3. sort へサルベージ URL、ids があるとき hub へ摩耗 URL（フラット returnKind + MechWearReport）  
4. localhost では「拠点へ摩耗報告」が `http://localhost:5175/` を向く  

試し方: [`docs/EXPLORE_IO_V2.md`](../../../docs/EXPLORE_IO_V2.md) §9
