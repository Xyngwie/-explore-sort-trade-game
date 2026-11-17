# WRECKLINE の BGM と効果音

曲と効果音は、ここにある Python のプログラムで作る（2026-11-15。神宮の依頼で Claude Code が作曲）。音源の録音や外部サービスは使っていない。同じプログラムからは同じ音ができる。

- `synth.py` … 発振器・エンベロープ・フィルタ・リバーブ・ディレイの小さなシンセ
- `songs.py` … 「Hangar - Rust and Warmth」「Contact」
- `songs2.py` … 残りの 9 曲
- `sfx.py` … 効果音 39 種（音量の段: ui < combat < work < event）
- `build.py` … 全部を `packages/shared/src/audio/` に書き出し、`manifest.json` を作る

```bash
pip install numpy scipy   # ffmpeg（libmp3lame）も要る
python3 tools/audio/build.py          # 全部
python3 tools/audio/build.py sfx      # 効果音だけ
python3 tools/audio/build.py bgm      # BGM だけ
```

ループする曲は、前に自分の終わり、後ろに自分の始まりを 0.5 秒ずつ付けて保存する。`manifest.json` の `loop` は、ちょうど 1 周期の区間（秒）。ブラウザの MP3 の復号が先頭を何サンプルずらしても、1 周期ぶんの窓は継ぎ目なく回る。タイトル（`title`）だけはアウトロ付きでループしない。

再生のしかたとシーンへの割り当ては [`docs/AUDIO_V0.md`](../../docs/AUDIO_V0.md)。
