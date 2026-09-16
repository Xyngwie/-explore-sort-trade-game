# Module 3→1 / Module 1→2 仮アダプタ — Build向け指示文

日付: 2026-09-15  
方針: M2→M3（`?importMaterials=`）と同型の **URLクエリ薄いアダプタ**  
固定URL（変更時は定数1か所）:

| モジュール | URL |
|---|---|
| M1 WRECKLINE | `https://blend-honey-branch-scarlet.grok.me` |
| M2 Athanor | `https://brush-green-zinc-crystal.grok.me` |
| M3 BASE HUB | `https://mist-river-velvet-drum.grok.me` |

---

## A. Module 3 → Module 1

### クエリ契約

```
https://blend-honey-branch-scarlet.grok.me/?deployableMechs={1..3}&startingAmmo={n}
```

| パラメータ | 意味 | M1での仮マッピング |
|---|---|---|
| `deployableMechs` | 出撃機数（fleet.length） | 隊長1 + 僚機 `clamp(N-1, 0, 2)`。機種IDは無視 |
| `startingAmmo` | 弾薬合計 | `balance.ammoStock` / ワールド初期 `ammo` にセット |

クエリ無し → 現行デモ（弾薬28・僚機2）のまま。

### → BASE HUB（Module 3）に貼る文

```
【改修】Module 1（WRECKLINE）へ出撃パラメータを渡す仮アダプタを足してください。

定数（1か所）:
  M1_URL = "https://blend-honey-branch-scarlet.grok.me"

expeditionOutputs の deployableMechs / startingAmmo はそのまま使う。

出撃確定（commitSortie）のあと、または Sortie 画面に「Module 1 へ出撃」ボタンを追加し、
  M1_URL + ?deployableMechs={N}&startingAmmo={ammo}
で開く（location.assign または window.open）。

既存の commitSortie ログ（Handoff → Module 1）は残してよい。
機種カタログや弾種の詳細は送らない（合算数値のみ）。
クエリ無しの通常動作は壊さないこと。
```

### → WRECKLINE（Module 1）に貼る文（3→1 受取）

```
【改修】Module 3（BASE HUB）からの出撃パラメータを受け取る仮アダプタを足してください。

起動時（ブリーフィング／出撃開始前）に URL を読む:
  ?deployableMechs= & startingAmmo=

あれば:
  - startingAmmo → balance.ammoStock（およびワールド初期弾薬）に反映
  - deployableMechs → 隊長1固定 + 僚機数 = clamp(deployableMechs - 1, 0, 2)
    （1なら僚機0、2なら僚機1、3以上なら僚機2。機種IDは無視）
  - 受取後は replaceState 等でクエリを消す

クエリ無しの通常起動は現行どおり（DEFAULT_BALANCE・僚機2）を壊さないこと。
createWorld が常に僚機2固定なら、翼機配列を N に合わせて生成するよう調整すること。
```

---

## B. Module 1 → Module 2

### クエリ契約

```
https://brush-green-zinc-crystal.grok.me/?salvagedContainers={n}&totalStockPieces={n*25}&isExtracted=1
```

| パラメータ | 意味 | 備考 |
|---|---|---|
| `salvagedContainers` | 回収缶数 | `exportExpeditionResult.salvagedContainers` |
| `totalStockPieces` | ピース数 | 通常 `containers * 25`。省略時は M2側で ×25 |
| `isExtracted` | 生還 | `1`/`true` / `0`/`false`。未生還なら精製ブロック想定 |

### → WRECKLINE（Module 1）に貼る文（1→2 送出）

```
【改修】Module 2（Athanor）へ探索結果を渡す仮アダプタを足してください。

定数（1か所）:
  M2_URL = "https://brush-green-zinc-crystal.grok.me"

SORTIE CLOSED / 結果画面で exportExpeditionResult の値を表示しているところに
「精製炉へ渡す」ボタンを追加。

押すと:
  M2_URL + ?salvagedContainers={n}&totalStockPieces={n*25}&isExtracted={0|1}
で開く。

isExtracted が false / 回収0 のときもボタンは出してよいが、
プレビュー数値を見せ、M2側でブロックされる旨が分かるとよい。
exportExpeditionResult の計算ロジックは変えない。
```

### → Athanor（Module 2）に貼る文（1→2 受取）

```
【改修】Module 1（WRECKLINE）からの探索結果を受け取る仮アダプタを足してください。

起動時に URL を読む:
  ?salvagedContainers= & totalStockPieces= & isExtracted=

あれば PlayerExpeditionState / workshop の初期状態をそれで上書きし、
puzzleInputFromExpedition 経由で精製を開始できるようにする。
totalStockPieces 省略時は salvagedContainers * 25。
isExtracted が false または totalStockPieces<=0 なら、既存どおり精製ブロックでよい。

受取後はクエリを消す。
クエリ無しの通常起動（デモ回収便レシピ一覧）は壊さないこと。
既存の「格納庫へ渡す」（Module 3向け）は残すこと。
```

---

## C. 通しテスト手順

1. M3で資材売却→機体配備→弾薬補充→出撃確定→「Module 1 へ出撃」  
2. M1が弾薬・僚機数を反映して出撃 → 回収して生還  
3. 結果画面「精製炉へ渡す」→ M2が缶数・ピースを受け取って精製可能  
4. 精製完了「格納庫へ渡す」→ M3が materials 加算（既存）

---

## D. 受け入れ条件

**3→1:** クエリ付きでM1を開くと弾薬・僚機が変わる。クエリ無しは従来どおり。  
**1→2:** クエリ付きでM2を開くと当該缶数で精製に入れる。クエリ無しはデモ一覧のまま。  
**回帰:** M2→M3「格納庫へ渡す」が壊れていないこと。
