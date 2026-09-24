# Preview Hosting v0（Modules プレビュー配信 — explore / sort / trade / invade / restore）

**ステータス:** PLAN / PREP → Pages 有効時はライブ URL あり。  
**日付:** 2026-09-18  
**対象:** `packages/explore` · `packages/sort` · `packages/trade` · `packages/invade` · `packages/restore`（単一 GitHub Pages サイト、サブパス分割）

関連: [`TRADE_HANGAR_V0.md`](./TRADE_HANGAR_V0.md)、[`INVADE_V0.md`](./INVADE_V0.md)、[`RESTORE_V0.md`](./RESTORE_V0.md)、ルート [`README.md`](../README.md)。

---

## 1. ゴール

Android 端末（実機ブラウザ）から **ローカル `npm` / Grok Build なし** で各モジュールを開けるようにする。  
同一オリジン（`*.github.io`）上でハンドオフ URL と localStorage（HubSave）を共有する（explore ↔ sort ↔ trade）。  
invade / restore は **静的プレビューのみ**（モジュール間 **UI ナビ未配線**；キー契約は [`HANDOFF_M45_V0.md`](./HANDOFF_M45_V0.md)）。

現状:

- デプロイ用 GitHub Actions ワークフローと各パッケージの Vite `base`（`VITE_BASE`）対応
- `MODULE_URLS` は GitHub Pages サブパスを正とする（旧 `.grok.me` は `LEGACY_GROK_MODULE_URLS`）
- ホスト選定チェックリストと受け入れ条件を文書化

---

## 2. スコープ

| 今やる | やらない |
|---|---|
| explore / sort / trade / invade / restore の build → 単一 Pages artifact | wear I/O 実装（別トラック） |
| サブパス `/explore/` · `/sort/` · `/invade/` · `/restore/` · ルート=trade | invade/restore のハンドオフ配線 |
| `docs` + workflow + `VITE_BASE` + `MODULE_URLS` | Cloudflare / Vercel の本番切替自動化 |

---

## 3. 公開 URL（GitHub Pages）

リポジトリ名 `-explore-sort-trade-game`（先頭ハイフン付き）の project Pages:

| モジュール | URL |
|---|---|
| trade（Hangar） | `https://xyngwie.github.io/-explore-sort-trade-game/` |
| explore | `https://xyngwie.github.io/-explore-sort-trade-game/explore/` |
| sort | `https://xyngwie.github.io/-explore-sort-trade-game/sort/` |
| invade | `https://xyngwie.github.io/-explore-sort-trade-game/invade/` |
| restore | `https://xyngwie.github.io/-explore-sort-trade-game/restore/` |

`packages/shared` の `MODULE_URLS` が上記を指す。ローカル開発時は `resolveModuleBaseUrl()` が `localhost:5173`〜`5177` に切り替える。

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
| `INVADE_VITE_BASE` | `/-explore-sort-trade-game/invade/` | invade の Vite `base` |
| `RESTORE_VITE_BASE` | `/-explore-sort-trade-game/restore/` | restore の Vite `base` |

ワークフロー正本（この PR）: [`docs/ci/deploy-modules-preview.yml`](./ci/deploy-modules-preview.yml)

**重要:** 使用中の PAT に `workflow` スコープが無いため、この PR は `.github/workflows/` を変更しない場合がある。
マージ後（またはマージ前）に GitHub Web UI で §9 の手順どおり `.github/workflows/deploy-modules-preview.yml` を
[`docs/ci/deploy-modules-preview.yml`](./ci/deploy-modules-preview.yml) の内容で上書きすること。

### (B) Cloudflare Pages / (C) Vercel

ルート配信なら各アプリを別プロジェクトにするか、ビルド後にサブディレクトリへ配置する。  
単体ビルド例（trade）:

- **Build command:** `npm ci && VITE_BASE=/ npm run build:trade`
- **Output:** `packages/trade/dist`

explore / sort / invade / restore も同様（`VITE_BASE=/` または独自サブパス）。

---

## 5. ローカルビルド

```bash
npm ci
npm run build:trade
npm run build:explore
npm run build:sort
npm run build:invade
npm run build:restore
```

Pages と同じ base で試す:

```bash
VITE_BASE=/-explore-sort-trade-game/ npm run build:trade
VITE_BASE=/-explore-sort-trade-game/explore/ npm run build:explore
VITE_BASE=/-explore-sort-trade-game/sort/ npm run build:sort
VITE_BASE=/-explore-sort-trade-game/invade/ npm run build:invade
VITE_BASE=/-explore-sort-trade-game/restore/ npm run build:restore

mkdir -p _site/explore _site/sort _site/invade _site/restore
cp -a packages/trade/dist/. _site/
cp -a packages/explore/dist/. _site/explore/
cp -a packages/sort/dist/. _site/sort/
cp -a packages/invade/dist/. _site/invade/
cp -a packages/restore/dist/. _site/restore/
```

### Vite `base`

各 `packages/{explore,sort,trade,invade,restore}/vite.config.ts` は次を読む（優先は `VITE_BASE`）:

| 変数 | デフォルト | 用途 |
|---|---|---|
| `VITE_BASE` | `/` | 推奨。CI / ホストで設定 |
| `BASE_PATH` | （`VITE_BASE` が無いとき） | 互換用エイリアス |

| ホスト | 推奨 `VITE_BASE` |
|---|---|
| GitHub Pages trade | `/-explore-sort-trade-game/` |
| GitHub Pages explore | `/-explore-sort-trade-game/explore/` |
| GitHub Pages sort | `/-explore-sort-trade-game/sort/` |
| GitHub Pages invade | `/-explore-sort-trade-game/invade/` |
| GitHub Pages restore | `/-explore-sort-trade-game/restore/` |
| Cloudflare / Vercel ルート | `/` |

---

## 6. ハンドオフ URL（MODULE_URLS）

| 定数 / 関数 | 役割 |
|---|---|
| `MODULE_URLS` | Pages 正本（本番プレビュー） |
| `LOCAL_DEV_MODULE_URLS` | `localhost` 開発ポート |
| `LEGACY_GROK_MODULE_URLS` | 旧 split `.grok.me`（参照のみ・explore/sort/trade） |
| `resolveModuleBaseUrl(key)` | localhost → local、それ以外 → `MODULE_URLS` |

アプリ側（explore / sort / trade）はハンドオフ生成時に `resolveModuleBaseUrl` を渡す。  
invade / restore キーは URL 解決用に追加済みだが、**モジュール間ハンドオフは未配線**。  
フォークや独自ホストでは、呼び出し側で `overrides` を渡すか、handoff builder の `baseUrl` 引数を明示する。

---

## 7. 受け入れ条件（ライブ URL）

1. スマホで trade / explore / sort / invade / restore の各 URL が開く（白画面・アセット 404 なし）
2. 同一オリジンで **localStorage**（HubSave）が共有される（explore ↔ sort ↔ trade）
3. trade → explore → sort → trade のクエリハンドオフが Pages URL 同士でつながる
4. invade / restore は単体で開けること（他モジュールとのハンドオフは対象外）
5. （任意）ローカル `npm run dev:*` では引き続き `localhost:517x` にハンドオフする

---

## 8. ワークフローの動き

1. **build** — `main` の該当 path push / `workflow_dispatch`  
   `npm ci` → 五モジュールを各 `VITE_BASE` で build → `_site/{,explore/,sort/,invade/,restore/}` に集約 → `upload-pages-artifact`
2. **deploy** — `vars.ENABLE_GITHUB_PAGES == 'true'` のときだけ `deploy-pages`

Pages 未設定でも **build は緑**のままにできる。

---

## 9. ワークフローファイルの設置（必須・UI コピー）

本 PR の PAT では `.github/workflows/*` を push できない場合がある（`workflow` スコープ不足）。  
正本 YAML は [`docs/ci/deploy-modules-preview.yml`](./ci/deploy-modules-preview.yml) がリポジトリに入る。

**GitHub Web UI（必須・既存 workflow の上書き）:**

1. ブランチ `chore/pages-invade-restore`（またはマージ後の `main`）で  
   `.github/workflows/deploy-modules-preview.yml` を開く（または Add file）
2. [`docs/ci/deploy-modules-preview.yml`](./ci/deploy-modules-preview.yml) の内容をすべて貼り付けて commit（既存を上書き）
3. Actions で **Deploy Modules Preview** を Run（`ENABLE_GITHUB_PAGES=true` なら deploy まで進む）

**または:** `GH_TOKEN` を `repo` + `workflow` 付きで再発行し、同じ内容を `.github/workflows/` に置いて push。

---

## CTA 用語（横断）

モジュール間の主ボタン表記は `@estg/shared` の `CTA_COPY` / `CTA_CHIP` に統一する。

| 行き先 | Primary |
|---|---|
| Sort | 仕分へ |
| Hub (trade) | 格納庫へ |
| Explore | 探索へ |
| Invade | 戦線へ |
| Restore | 修復へ |

- Secondary retry: `もう一度`（出撃リトライのみ `再出撃`）
- 結果ステータスはボタン文に埋め込まず chip / note へ
- すべての `<a>` に `target="_top"`（fullscreen shell リーク防止）
- ハンドオフ URL キー契約は変更しない（copy / 階層 / `_top` のみ）
