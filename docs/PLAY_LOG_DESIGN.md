# 復元可能プレイログ：保存責務と接続設計（実装前棚卸し）

起点main `16ab1fdfaafd7808aafe1fe0f412ef56549849b6`。神宮直接指示（2026-10-27）。既存セーブの途中移行・補完を行わず、既存データを無断で削除しない。IndexedDBに全件保持し、書き出し後も削除しない。

## 永続状態と現行経路

| モジュール | 状態変更・保存経路 | 復元対象 |
|---|---|---|
| shared/hub-save.ts | HubSave読込/正規化/保存、初期値、取引の最終保存 | Hub全体：credits、inventory、unopenedContainers、fleet、circuits、sortieSelection、学習値、進行、lostMechs、fieldDrops、fieldCells、精算済みID等 |
| Trade/hangar.ts | 作成/購入/売却/修理/復活/充電/装備/出撃準備、帰還・Sort・Restore取込 | 各取引のHub差分とM45引渡しスタッシュ |
| Trade/*-ui.ts / *-guard.ts | 資源売買、回路作成/購入/装備、未開封コンテナ引渡し・戻りガード | Hubと引渡しの永続データ |
| Sort/hubContainerBridge.ts / sort-handoff-guard.ts | 開封時の未開封在庫消費、未確定引渡し | 在庫消費、開封抽選結果/引渡し。途中操作は戦闘完全リプレイの対象ではない |
| Restore/puzzle.ts / session.ts / app.ts | 配線途中のedgesキー、完成結果のURL引渡し | 配線途中、回路状態と完成結果。表示文言を解析しない |
| Explore/main.ts / game/hubDirectSave.ts / preSortieAmmo.ts / directFieldEntry.ts / forcedBackWipe.ts / circuitPlay.ts | 出撃準備、開始、途中チェックポイント、終了精算・救助・戻る損失、直接戦場作成 | 開始基準と終了精算、学習、資産・フィールド移動。途中Worldは再開補助として分離 |
| Invade/hub-persist.ts / forced-combat.ts | 盤面進行/段位/初回クリア/共有戦場、強制戻り | Hub.frontProgress等と関連資産 |
| debug-storage / alpha-lab | 隔離セーブ・検証プリセット・自由編集 | 通常プレイ履歴とは隔離し、本機能では混ぜない |

表示用ログ、ショートカット表示、エディタ名、単なる視点は復元対象外。戦闘の移動/射撃/命中等は記録しない。Sort/Restoreの抽選済み結果は候補・差分に保持し、再試行・復元では再抽選しない。

## 確定責務

既存操作は同期関数が多いため、全画面の起動前に共通保存アダプターを接続する。アダプター上の書込は候補領域であり確定ではない。候補が発生したタスク内で画面と後続操作を遮蔽し、同期操作を取引候補としてまとめる。既存localStorageへ候補状態を先行保存しない。成功表示・ナビゲーションはIDB確定後に解放する。画面内のJS状態も確定前は隔離された候補であり、失敗時は後続操作を拒否する。

IndexedDBの同一readwrite transactionで、ゲームの確定状態、連番付き履歴、操作IDを保存する。連番と前状態が一致しないタブからの候補は拒否し、上書き合成しない。localStorageは互換キャッシュであり正本ではない。起動時にIDB正本から復旧する。キャッシュ更新失敗をログ失敗と混同しない。

操作前状態・結果候補・操作IDは再試行ジャーナルへ保持する。ログ保存失敗時は「記録を保存できません」と表示し、同じ候補を再試行する。失敗した画面から取引や出撃精算を続けず、再抽選・二重報酬を防ぐ。復旧手段がないときは成功扱いにしない。

履歴は操作種別、ゲームID、連番、操作ID、形式/ルール/ビルド、前提差分と実現結果を持つ。復元は記録された構造化差分だけを適用し、順序・ID重複・前提・最終状態を検証する。価格や乱数を再計算しない。出撃開始は既存sortieNonceを識別基準として一度だけ記録し、終了は既存精算ID/Hub差分と関連付ける。戦闘中のWorldは再開用であり、全イベント履歴にしない。

書き出しはreadonly transactionのスナップショットを用い、初期状態から指定headまでの一貫したJSONと復元比較結果を出力する。再インポート/通常セーブ上書きUIは作らない。端末内の改ざん防止を保証しない。

ここまでは実装前に作成した棚卸し。以下が実装済みの具体的な形式・責務であり、実測はverification/play-log.jsonとPR本文に分ける。

## 実装された形式と責務

- DB名 `wreckline.playLog.v1`、schema 1。`games`（gameId主キー）、`entries`（[gameId,seq]、[gameId,operationId] unique）、`pending`（gameId主キー）、`meta`（active gameId）。過去ゲーム/履歴の削除処理なし。
- `PlayState.files` はHub v3、M45スタッシュ、Restore edges、Sortの開始/結果、引渡し/戻りガード、誤射学習履歴等。`PlayState.sorties[sortieNonce]` は開始Worldと終了payload。開始基準には参加機・装備・持込資源・学習・進行・既に抽選された配置を含む。終了payloadの既存sortieIdとHub差分を対応させる。
- `entries[0]` は `game.start`。各記録はformat/rules/build/gameId/seq/operationId/at/kind/module/context、beforeHash/afterHash、構造化patch（pathとbefore/afterの存在/値）、recordHashを持つ。pathには機体別学習ID等が残り、配列では対象IDを含む実現値を保持する。
- 復元は初期状態を複製してpatchを順番に適用。型版/ルール版、連番、ゲーム、重複操作ID、前提値、checksum、最終状態との完全比較を検証する。ゲームの価格・抽選・学習計算・正規化は再実行しない。checksumは端末内の診断用で、署名や改ざん防止ではない。

## 保存・障害・競合

全5本のHTMLをboot.tsから起動し、補助スクリプトもアダプター接続後に読み込む。同期保存APIは候補受理を返す。最初の候補書込で画面を遮蔽し、ポインター等の後続操作と戦闘進行を停止する。同じDOMイベントのcapture/target/bubbleをまとめるため、確定は次のtaskで開始する。成功表示と内部遷移は確定後だけ許可する。

候補は操作ID・抽選済み結果・復旧先を含めてlocalStorage/sessionStorageの再試行ジャーナルへ保持し、IDB.pendingにも準備する。IDBの同じtransactionでhead・entry・重複防止index・pending解消を確定する。active gameId、期待連番/前hash、準備した候補の一致を条件にする。複数候補が残っていても、IDBが準備済みとして受理した操作を先に復旧する。遷移先も記録した結果として保持する。競合タブの上書きや合成はしない。

IDB失敗時は「記録を保存できません」として画面を止め、同じ候補を再試行。確定済みoperationIdの再試行は再適用しない。競合した候補は保持したまま、利用者の明示操作で最新状態へ戻せる。新規ゲーム切替後の古いタブも別ゲームへ書き込めない。

IDB成功後だけ互換キャッシュを更新する。キャッシュだけが失敗しても正本と履歴は保存済みで、次回はIDBから再作成する。IDB不可/履歴欠落・不正時は無記録保存へ切替えない。全保存領域が拒否されて候補も保持できない場合は、その旨を出して未確定のまま止める。再読込で直せるような成功表示はしない。

新規の空の環境から自動記録する。既存Hub/スタッシュ/配線/途中操作/既存引渡しだけがある場合は途中記録せず、既存データを維持する。新規ゲーム/初期化は確認後に別gameIdで開始し、記録済みの旧ゲームを残す。実験室は従来の隔離領域のままで、通常履歴と混ぜない。

## 再開と対象外

`games.resume` は最後に保存した出撃チェックポイント。World進行は履歴patchへ毎フレーム入れない。開始履歴は一度だけ、終了精算は既存IDの契約で一度だけ。再開用snapshotは同じ確定単位で保持するが、移動/射撃/命中の完全再現はしない。非表示/離脱時は候補を同期ジャーナルへ残し、完了前にページが終われば次回に再試行を求める。履歴から比較する正本は `games.state`（確定資産/進行/学習/フィールドと開始・終了記録）であり、戦闘経緯の証明ではない。

Sortは抽選した開始状態と終了結果を保存し、同じrouteの再読込で開始の袋を引き直さない。途中の全スワップ履歴は本機能に含めない。別モジュールを異なるoriginの開発ポートで起動した場合は従来同様に保存が分かれる。一連の検証は同一originの本番URL構成で実施する。

## 利用・書き出し

各画面の「プレイ記録」を開き、対象ゲームを選んで「JSONを書き出す」。readonly transactionで固定した初期状態〜headの範囲と、その時点の確定snapshotを出力する。書出し中の後続取引と混ざらず、出力後も全件残る。新規ゲーム後も旧ゲームを選べる。再インポート/セーブ上書きUI、サーバー送信、認証機能は追加しない。

JSONをCLIで検証：`npx tsx scripts/verify-play-log-export.ts <JSONファイル>`。検証の一致は記録と確定状態の整合であり、戦闘の細部や実プレイの正当性を保証するものではない。

## 検証の再現

- `npm test` / `npm run typecheck` / 全5本番ビルド。
- `npx vite --host 127.0.0.1 --port 5188` をrepo rootで起動し、`node scripts/verify-play-log.cjs` と `node scripts/verify-play-log-faults.cjs`。`PLAYWRIGHT_MODULE` にplaywright-coreの場所を指定。実際の保存関数と使い捨てfixtureを使い、IDBをmockしない。
- 本番各moduleをGitHub Pagesと同じVITE_BASEでbuildし、`node scripts/verify-play-log-production.cjs`。PC/390x844、全5画面、実UI購入/修復/開封/進行/出撃開始再開、保存失敗表示・再試行・JSONを確認。公開サイトを書き換えない。
- 失敗・競合・件数増加・物理実機/公開版の実施区分は `docs/verification/play-log.json` とPR本文に記録する。

タブ単位の引渡し予約は `session:<tabId>:<key>` として正本に分け、別タブへコピーしない。`wreckline.playLog.tab.v1` は再読込をまたぐ論理タブID。未確定操作の復旧はその操作が記録したタブ文脈を引き継ぎ、既に後続操作まで確定済みの古いack再試行では古い遷移を繰り返さず最新の格納庫状態へ戻す。
