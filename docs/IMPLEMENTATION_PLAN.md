# 現行実装計画

**基準日:** 2026-09-26  
**ステータス:** 現行計画  
**目的:** 現在のコードを基準に、次に何を実装・確認するかを短く追えるようにする。

> この文書は「未来の願望」ではなく、現在のリポジトリを前提にした作業計画です。将来構想は [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) に分離します。

---

## 1. 現在の実装地図

| Module | パッケージ | 現在地 | 次の主な焦点 |
|---|---|---|---|
| 1 | `packages/explore` | プレイ可能な探索垂直スライス | 探索／帰還ループの厚み、契約との継続整合 |
| 2 | `packages/sort` | プレイ可能な精製ループ | Yield・経済・結果導線の整合、必要な磨き込み |
| 3 | `packages/trade` | プレイ可能な Hub / Hangar | フリート・在庫・修理／解体と各 Module の受け口の整合 |
| 4 | `packages/invade` | 薄いプレイアブル・スタブ | `INVADE_V0` に沿ったルート／インテル体験の段階的実装 |
| 5 | `packages/restore` | 薄いプレイアブル・スタブ | `RESTORE_V0` に沿った回路復元体験の段階的実装 |

### 共通基盤

- `packages/shared` が共通型・ハンドオフ・セーブ関連型・共有 UI コピーの境界。
- Module 間の契約は `docs/` と shared 型を合わせて確認する。
- GitHub Pages は全 Module の確認用プレビュー。

---

## 2. 完了済みとして扱う基盤

直近の実装では、次の基盤が main に入っていることを前提にする。

- モノレポの `packages/*` 構成
- Explore / Sort / Trade の基本プレイ経路
- Invade / Restore の薄いプレイアブル・スタブ
- GitHub Pages による全 Module のプレビュー
- `packages/shared` による CTA コピーの共通化
- Explore / Sort / Trade / Invade / Restore の主要結果導線の CTA 用語統一
- Module 4/5 と Hub のキー契約

ここを再実装するのではなく、以降は「実装済み部分を壊さず厚くする」ことを優先する。

---

## 3. 次の開発順序

### Step 1 — ドキュメントとコードの同期を維持する

- 新しい実装が入ったら、該当する V0/V2／契約文書の「現在地」を必要に応じて更新する。
- README は入口として保ち、詳細仕様を重複記載しない。
- `PRODUCT_VISION.md` にある未実装の願望を、現在仕様と混ぜない。

### Step 2 — Module 1〜3 の契約を固める

優先して確認するもの:

1. Explore → Sort の成果物受け渡し
2. Sort → Trade の Yield / inventory 受け渡し
3. Trade の HubSave とフリート状態
4. 再出撃時に必要な状態が Hub に戻っているか
5. UI 上の遷移と契約上の遷移が一致しているか

### Step 3 — Module 4 `invade` を段階的に厚くする

`INVADE_V0.md` を正として、次の順で実装する。

1. ルート／フィールド選択
2. 密度・危険度の表現
3. インテル／ヒント成果
4. Explore への出撃導線
5. Hub への帰還・成果受け渡し

実コンテナを別 Module と二重計上しないこと、任意でスキップできる設計を維持する。

### Step 4 — Module 5 `restore` を段階的に厚くする

`RESTORE_V0.md` を正として、次の順で実装する。

1. CircuitBoard の状態表現
2. Slitherlink 系の基本操作
3. Fully Awakened / Bypass / Offline の成果表現
4. Hub への成果受け渡し
5. Perfect / 高価値成果の扱い

タイマー圧や、まだ決まっていない役割解放などを先回りして実装しない。

### Step 5 — 統合確認

Module 4/5 の厚みが増えた段階で、次を通しで確認する。

```text
Hub
 ↓
任意のルート／作業
 ↓
Explore / Sort / Invade / Restore
 ↓
成果・摩耗・状態
 ↓
Hub
 ↓
次の出撃
```

この確認では「各 Module 単体が動く」だけでなく、**状態が一周して破綻しないこと**を重視する。

---

## 4. 優先順位の付け方

優先順位は原則として次の順で決める。

1. **壊れている契約／データフロー**
2. **既存プレイ経路を壊す回帰**
3. **現在仕様とのドキュメント不整合**
4. **既存 Module のプレイ体験を厚くする作業**
5. **Module 4/5 の新規深掘り**
6. **将来ビジョン・大型リファクタリング**

同じ優先度なら、変更範囲が小さく検証しやすいものから行う。

---

## 5. 変更単位

原則として 1 PR = 1 目的。

### 良い例

- `docs: refresh current implementation plan`
- `feat(invade): add route result state`
- `fix(shared): preserve handoff contract`
- `feat(restore): persist board outcome`

### 避ける例

- UI コピー変更 + 経済調整 + セーブ形式変更を一つの PR に詰め込む
- 未実装のビジョンをまとめて実装する大型 PR
- 無関係なリファクタリングを機能 PR に混ぜる

---

## 6. 検証基準

最低限:

```bash
npm run typecheck
npm test
```

UI / ビルドを変更した Module は該当 build も実行する。

```bash
npm run build:explore
npm run build:sort
npm run build:trade
npm run build:invade
npm run build:restore
```

契約変更を伴う場合は、該当する docs と型の整合も確認する。

---

## 7. やらないこと（現時点）

- `.grok.me` を新しいソース正本として復活させる
- 未決定の大型統合を先に実装する
- マルチプレイヤー／ソーシャル機能を先行実装する
- Wingman の学習プロフィールを、仕様が決まる前に作り込む
- Restore の役割解放など、ビジョン段階の仕組みを先行実装する
- 契約変更を UI の小変更に隠して投入する

---

## 8. 計画の更新ルール

実装の節目ごとにこの文書を見直す。ただし、細かな TODO を無制限に増やさない。

- 「今すぐやること」だけを上位に置く。
- 完了したものは「完了済みとして扱う基盤」に移す。
- 新しい仕様が決まったら、まず対応する契約文書を更新し、その後この計画へ反映する。
- 大きな方針変更は PR の本文に理由を残す。
