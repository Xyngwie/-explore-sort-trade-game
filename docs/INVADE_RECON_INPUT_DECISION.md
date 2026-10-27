# Invade偵察操作改善の決定記録

神宮直接指示 TASK_ASSIGNMENT「Invade操作改善：300ms長押し予告・即時パン・偵察アイコン」（2026-10-27）。起点main: `16ab1fdfaafd7808aafe1fe0f412ef56549849b6`。

#329の480ms、長押し待ちパン、タッチ固定8px判定を更新する。正式な現行操作は [INVADE_V0.md](INVADE_V0.md) 末尾を参照。

- 長押し300msは表示予告のみ。指離しで一回確定。開始マスの変換済み画面範囲内は指ぶれを許容し、外へ出たら即パンへ移る。境界通過サンプルをパンの新基準として跳ねを防ぎ、戻してもマス操作しない。
- 白スコープは推定敵位置、赤三角は確認された敵。数字は斥候の感知数。半透明のスコープ設置/解除予告と、未開放パネルの反転予告を用いる。未開放の敵・数字を予告へ渡さない。
- パン、ピンチ、pointercancel、blur、非表示化、拠点復帰で予告と保留操作を消す。拠点復帰はHQ中央・倍率1へ視点だけを戻す。
- Ctrl＋左は右と同じマーク操作。通常左/右/左右同時押し、数字タップ、ピンチ、広域ダブルタップ、中ドラッグ、ホイールは維持する。
- 内部flaggedと保存形式は変更しない。マーク数一致だけで周囲開放し、誤推定では敵に接触し得る。最初の敵接触で追加開放を止める。

変更しないもの：敵配置・数字・偵察範囲・勝利条件・報酬、Invade/Explore統合、部隊/学習/経済。操作反転・視点の永続化を追加しない。Automationsを起動しない。マージ・デプロイを行わず、Draftで監査を待つ。

再現手順：`npm run test -w @estg/invade`、`VITE_BASE=/-explore-sort-trade-game/invade/ npm run build:invade` の後、`PLAYWRIGHT_MODULE=<playwright-coreの場所> node scripts/verify-invade-input.cjs`。Chromiumは`CHROMIUM_PATH`で指定可能。スクリプトはローカル本番ビルドと使い捨てブラウザープロファイル・保存済み盤面fixtureを使用する。通常ユーザーのセーブや公開サイトを書き換えない。

実測と未実施項目は [verification/invade-recon-input.json](verification/invade-recon-input.json) とPR本文に記録する。
