# Preview Hosting v0（Modules プレビュー配信 — explore / sort / trade）

**ステータス:** PLAN / PREP → Pages 有効時はライブ URL あり。  
**日付:** 2026-09-18  
**対象:** `packages/explore` · `packages/sort` · `packages/trade`（単一 GitHub Pages サイト、サブパス分割）

関連: [`TRADE_HANGAR_V0.md`](./TRADE_HANGAR_V0.md)、ルート [`README.md`](../README.md)。

---

## 1. ゴール

Android 端末（実機ブラウザ）から **ローカル `npm` / Grok Build なし** で三モジュールを開けるようにする。  
同一オリジン（`*.github.io`）上でハンドオフ URL と localStorage（HubSave）を共有する。

現状:

- デプロイ用 GitHub Actions ワークフローと各パッケージの Vite `base`（`VITE_BASE`）対応
- `MODULE_URLS` は GitHub Pages サブパスを正とする（旧 `.grok.me` は `LEGACY_GROK_MODULE_URLS`）
- ホスト選定チェックリストと受け入れ条件を文書化

---

## 2. スコープ

| 今やる | やらない |
|---|---|
| explore / sort / trade の build → 単一 Pages artifact | wear I/O 実装（別トラック） |
| サブパス `/explore/` · `/sort/` · ルート=trade | カスタムドメイン契約の自動化 |
| `docs` + workflow + `VITE_BASE` + `MODULE_URLS` | Cloudflare / Vercel の本番切替自動化 |

---

## 3. 公開 URL（GitHub Pages）

リポジトリ名 `-explore-sort-trade-game`（先頭ハイフン付き）の project Pages:

| モジュール | URL |
|---|---|
| trade（Hangar） | `https://xyngwie.github.io/-explore-sort-trade-game/` |
| explore | `https://xyngwie.github.io/-explore-sort-trade-game/explore/` |
| sort | `https://xyngwie.github.io/-explore-sort-trade-game/sort/` |

`packages/shared` の `MODULE_URLS` が上記を指す。ローカル開発時は `resolveModuleBaseUrl()` が `localhost:5173/5174/5175` に切り替える。

---

## 4. ホスト選択肢

### (A) GitHub Pages（推奨・現行）

チェックリスト:

1. リポジトリが **public**（または有料プランで private Pages）
2. Settings → Pages → **Source: GitHub Actions**
3. Settings → Secrets and variables → Actions → Variables に  
   `ENABLE_GITHUB_PAGES` = `true`
4. `main` へ push、または Actions で **Deploy Modules Preview** を Run workflow
5. 上表 URL を Android で開いて §7 を確認

任意の override 変数:

| Variable | デフォルト | 用途 |
|---|---|---|
| `TRADE_VITE_BASE` | `/-explore-sort-trade-game/` | trade の Vite `base` |
| `EXPLORE_VITE_BASE` | `/-explore-sort-trade-game/explore/` | explore の Vite `base` |
| `SORT_VITE_BASE` | `/-explore-sort-trade-game/sort/` | sort の Vite `base` |

ワークフロー正本（この PR）: [`docs/ci/deploy-modules-preview.yml`](./ci/deploy-modules-preview.yml)

**重要:** 使用中の PAT に `workflow` スコープが無いため、この PR は `.github/workflows/` を変更しない。
マージ後（またはマージ前）に GitHub Web UI で §9 の手順どおり `.github/workflows/deploy-modules-preview.yml` を追加し、
旧 `.github/workflows/deploy-trade-preview.yml` を削除すること。

### (B) Cloudflare Pages / (C) Vercel

ルート配信なら各アプリを別プロジェクトにするか、ビルド後にサブディレクトリへ配置する。  
単体ビルド例（trade）:

- **Build command:** `npm ci && VITE_BASE=/ npm run build:trade`
- **Output:** `packages/trade/dist`

explore / sort も同様（`VITE_BASE=/` または独自サブパス）。

---

## 5. ローカルビルド

```bash
npm ci
npm run build:trade
npm run build:explore
npm run build:sort
```

Pages と同じ base で試す:

```bash
VITE_BASE=/-explore-sort-trade-game/ npm run build:trade
VITE_BASE=/-explore-sort-trade-game/explore/ npm run build:explore
VITE_BASE=/-explore-sort-trade-game/sort/ npm run build:sort

mkdir -p _site/explore _site/sort
cp -a packages/trade/dist/. _site/
cp -a packages/explore/dist/. _site/explore/
cp -a packages/sort/dist/. _site/sort/
```

### Vite `base`

各 `packages/{explore,sort,trade}/vite.config.ts` は次を読む（優先は `VITE_BASE`）:

| 変数 | デフォルト | 用途 |
|---|---|---|
| `VITE_BASE` | `/` | 推奨。CI / ホストで設定 |
| `BASE_PATH` | （`VITE_BASE` が無いとき） | 互換用エイリアス |

| ホスト | 推奨 `VITE_BASE` |
|---|---|
| GitHub Pages trade | `/-explore-sort-trade-game/` |
| GitHub Pages explore | `/-explore-sort-trade-game/explore/` |
| GitHub Pages sort | `/-explore-sort-trade-game/sort/` |
| Cloudflare / Vercel ルート | `/` |

---

## 6. ハンドオフ URL（MODULE_URLS）

| 定数 / 関数 | 役割 |
|---|---|
| `MODULE_URLS` | Pages 正本（本番プレビュー） |
| `LOCAL_DEV_MODULE_URLS` | `localhost` 開発ポート |
| `LEGACY_GROK_MODULE_URLS` | 旧 split `.grok.me`（参照のみ） |
| `resolveModuleBaseUrl(key)` | localhost → local、それ以外 → `MODULE_URLS` |

アプリ側（explore / sort / trade）はハンドオフ生成時に `resolveModuleBaseUrl` を渡す。  
フォークや独自ホストでは、呼び出し側で `overrides` を渡すか、handoff builder の `baseUrl` 引数を明示する。

---

## 7. 受け入れ条件（ライブ URL）

1. スマホで trade / explore / sort の各 URL が開く（白画面・アセット 404 なし）
2. 同一オリジンで **localStorage**（HubSave）が共有される
3. trade → explore → sort → trade のクエリハンドオフが Pages URL 同士でつながる
4. （任意）ローカル `npm run dev:*` では引き続き `localhost:517x` にハンドオフする

---

## 8. ワークフローの動き

1. **build** — `main` の該当 path push / `workflow_dispatch`  
   `npm ci` → 三モジュールを各 `VITE_BASE` で build → `_site/{,explore/,sort/}` に集約 → `upload-pages-artifact`
2. **deploy** — `vars.ENABLE_GITHUB_PAGES == 'true'` のときだけ `deploy-pages`

Pages 未設定でも **build は緑**のままにできる。

---

## 9. ワークフローファイルの設置（必須・UI コピー）

本 PR の PAT では `.github/workflows/*` を push できない（`workflow` スコープ不足）。  
正本 YAML は [`docs/ci/deploy-modules-preview.yml`](./ci/deploy-modules-preview.yml) のみがリポジトリに入る。

**GitHub Web UI（必須）:**

1. ブランチ `chore/pages-explore-sort`（またはマージ後の `main`）で **Add file → Create new file**
2. パス: `.github/workflows/deploy-modules-preview.yml`
3. [`docs/ci/deploy-modules-preview.yml`](./ci/deploy-modules-preview.yml) の内容をすべて貼り付けて commit
4. 旧 [`.github/workflows/deploy-trade-preview.yml`](../.github/workflows/deploy-trade-preview.yml) を **Delete file**（二重デプロイ防止）
5. Actions で **Deploy Modules Preview** を Run（`ENABLE_GITHUB_PAGES=true` なら deploy まで進む）

**または:** `GH_TOKEN` を `repo` + `workflow` 付きで再発行し、同じ内容を `.github/workflows/` に置いて push。
