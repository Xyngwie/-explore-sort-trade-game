# Preview Hosting v0（Trade Hangar プレビュー配信 — 準備のみ）

**ステータス:** PLAN / PREP（workflow + ドキュメント）。**ライブ公開 URL はまだ不要。**  
**日付:** 2026-09-17  
**対象:** `packages/trade`（Hangar）のみ。explore / sort / フルループは対象外。

関連: [`TRADE_HANGAR_V0.md`](./TRADE_HANGAR_V0.md)、ルート [`README.md`](../README.md)。

---

## 1. ゴール

Android 端末（実機ブラウザ）から **ローカル `npm` / Grok Build なし** で Trade Hangar を開けるようにする。

現状（この PR）:

- デプロイ用 GitHub Actions ワークフローと Vite `base` の環境変数対応を入れる
- ホスト選定チェックリストと受け入れ条件を文書化する
- **公開 URL の確定・有効化はユーザーが後で行う**

---

## 2. スコープ

| 今やる | やらない |
|---|---|
| Trade Hangar の build → artifact / Pages 向け plumbing | explore / sort のデプロイ |
| `docs` + workflow + `VITE_BASE` | フルループ結合デプロイ |
| ホスト選択肢のチェックリスト | 実際の本番ドメイン契約・課金判断の自動化 |

---

## 3. なぜ GitHub Pages が今ブロックされているか

リポジトリは **private**。GitHub Pages API / 設定で次の趣旨の拒否が返る:

> このリポジトリのプランでは Pages がサポートされない（private リポジトリ向け Pages は有料プラン等）

つまり **workflow を置いただけでは URL は出ない**。Pages を使うには次のいずれかが必要:

- リポジトリを **public** にする（無料プランでも project Pages が使える）
- または **GitHub Pro / Team / Enterprise** 等で private Pages を有効にする

本リポ名は `-explore-sort-trade-game`（先頭ハイフン付き）のため、project Pages の典型 URL は:

`https://<owner>.github.io/-explore-sort-trade-game/`

Vite の `base` はワークフローで `VITE_BASE=/-explore-sort-trade-game/` を渡す想定（下記 §5）。

---

## 4. 次のホスト選択肢（ユーザーが後で選ぶ）

### (A) public 化 + GitHub Pages

チェックリスト:

1. Settings → General → Danger Zone で **Change visibility → Public**（または有料プランで private Pages）
2. Settings → Pages → **Source: GitHub Actions**
3. Settings → Secrets and variables → Actions → Variables に  
   `ENABLE_GITHUB_PAGES` = `true` を追加（deploy ジョブのゲート）
4. `main` へ push、または Actions で `Deploy Trade Preview` を **Run workflow**
5. 成功後、Pages URL を Android で開いて §6 を確認

ワークフロー: [`.github/workflows/deploy-trade-preview.yml`](../.github/workflows/deploy-trade-preview.yml)

### (B) Cloudflare Pages

チェックリスト:

1. Cloudflare アカウント + Pages プロジェクト作成
2. この GitHub リポを接続（private 可。Cloudflare 側に GitHub App 権限）
3. Build 設定例:
   - **Build command:** `npm ci && npm run build:trade`
   - **Build output directory:** `packages/trade/dist`
   - **Root directory:** リポジトリルート（モノレポ）
   - **Environment variable:** `VITE_BASE=/`（独自ドメイン or `*.pages.dev` のルート配信）
4. Production branch: `main`
5. 発行された `*.pages.dev`（またはカスタムドメイン）を Android で確認

### (C) Vercel

チェックリスト:

1. Vercel アカウント + プロジェクト作成、GitHub リポを接続
2. 設定例:
   - **Framework Preset:** Other / Vite
   - **Root Directory:** `.`（リポルート）
   - **Build Command:** `npm ci && npm run build:trade`
   - **Output Directory:** `packages/trade/dist`
   - **Env:** `VITE_BASE=/`
3. `main` デプロイ後、`*.vercel.app` を Android で確認

---

## 5. ローカルビルド

```bash
npm ci
npm run build:trade
```

- **出力ディレクトリ:** `packages/trade/dist`
- **プレビュー（任意）:** `npm run preview -w @estg/trade`

### Vite `base`（サブパス配信）

`packages/trade/vite.config.ts` は次を読む（どちらも可、優先は `VITE_BASE`）:

| 変数 | デフォルト | 用途 |
|---|---|---|
| `VITE_BASE` | `/` | 推奨。GitHub Actions / Cloudflare / Vercel で設定 |
| `BASE_PATH` | （`VITE_BASE` が無いとき） | 互換用エイリアス |

**採用方針（本リポ）:**

| ホスト | 推奨 `VITE_BASE` | 理由 |
|---|---|---|
| GitHub Pages（project site） | `/-explore-sort-trade-game/` | `https://<user>.github.io/<repo>/` に合わせる |
| Cloudflare Pages / Vercel（ルート） | `/` | プロジェクトルートで配信するため |

サブパス `/trade/` は使わない（Pages artifact はサイトルートに載る前提。別パスが必要ならホスト側の rewrite と合わせて再検討）。

ローカルで Pages と同じ base を試す例:

```bash
VITE_BASE=/-explore-sort-trade-game/ npm run build:trade
```

---

## 6. 後での受け入れ条件（ライブ URL 取得後）

1. スマホのブラウザで **発行 URL** を開く
2. Hangar UI が読み込まれる（白画面・404・アセット 404 がない）
3. 同じオリジンで **localStorage**（HubSave 等）が動く  
   - 機体受領 → リロードしても残る、など
4. （任意）出撃リンクや sort 取込クエリが、そのオリジン前提で破綻しないこと

---

## 7. ワークフローの動き（今）

ジョブ構成:

1. **build** — `main` への該当 path push / `workflow_dispatch` で常に実行  
   `npm ci` → `npm run build:trade`（`VITE_BASE` 付き）→ `actions/upload-pages-artifact`
2. **deploy** — `vars.ENABLE_GITHUB_PAGES == 'true'` のときだけ  
   `actions/deploy-pages` + `environment: github-pages`

したがって:

- Pages 未設定・private 無料プランでも **build は緑のまま**にできる
- ライブ URL が欲しくなったら §4 (A) のチェックリスト（または B/C）を実施

explore / sort 用 workflow はこのドキュメントの対象外（後続 PR）。

---

## 8. ワークフローファイルの設置

本リポへ Actions workflow を **git push するには PAT に `workflow` スコープが必要**です。  
準備用の同一 YAML を [`docs/ci/deploy-trade-preview.yml`](./ci/deploy-trade-preview.yml) に置いてあります。

**推奨（GitHub Web UI）:**

1. この PR のブランチ上で **Add file → Create new file**
2. パス: `.github/workflows/deploy-trade-preview.yml`
3. [`docs/ci/deploy-trade-preview.yml`](./ci/deploy-trade-preview.yml) の内容を貼り付けて commit
4. PR をマージ

**または:** `card.GH_TOKEN` を `repo` + `workflow` 付きで再発行し、同じ内容を `.github/workflows/` に置いて push。
