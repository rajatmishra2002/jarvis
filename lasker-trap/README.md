# Lasker Trap — chess edit

A 1080×1350 (4:5), 60 fps edit of the Albin Countergambit **Lasker Trap**, cut to the supplied 59-second song and
styled after the "ChessFXs"-type reference clip (close-up tilted board, glowing last-move squares, move-quality badges,
arrow/ray trails, ember-and-fire second half, kinetic text finale).

```
1.d4 d5 2.c4 e5 3.dxe5 d4 4.e3 Bb4+ 5.Bd2 dxe3 6.Bxb4 exf2+ 7.Ke2 fxg1=N+ 8.Rxg1 Bg4+
"You thought it was over…"  →  "BUT I'M NOT DONE!"  →  "LASKER TRAP!"
```

The line is validated move-by-move with python-chess (`tools/make_moves.py`). In the final position every legal
White reply (Ke1, Kf2, Ke3) loses the queen to the Bg4 pin – that is what the "nowhere to run" marks show.

## How the sync works

The song is *sung* and the lyrics narrate the trap, so every move is locked to a sung word / audible hit, not to a
loose grid. Lyric timing was recovered with an offline speech model, hit times with onset analysis
(`tools/analyze_audio.py`). Landing times (seconds, the frame where the piece arrives and the impact fires):

| move | t (s) | cue |
|---|---|---|
| 1.d4 | 3.64 | first crash hit ("come a little closer") |
| 1…d5 | 6.81 | riser → crash |
| 2.c4 | 10.28 | "I'll meet you there" |
| 2…e5 | 13.46 | "push a little more" (the two-square push) |
| 3.dxe5 | 17.49 | "you **took** my pawn" |
| 3…d4 | 19.62 | "but missed my **plan**" |
| 4.e3 | 21.40 | "you closed the **door**" |
| 4…Bb4+ | 25.88 | sung **"Check!"** (beam charges during the held "I'm breaking…" note, 22.6–25.3) |
| drop | 26.74 | the board ignites |
| 5.Bd2 | 31.13 | "you **bring** a guardian" (shield ring on "guardian", 32.36) |
| 5…dxe3 | 34.49 | "I **push** inside" |
| 6.Bxb4 | 35.31 | "you **take** my bishop" |
| 6…exf2+ | 36.93 | the second drop ("Trick!") |
| 7.Ke2 | 39.00 | "keep running" (big low hit) |
| – | 43.4→46.3 | promotion menu: queen highlighted on "you thought I'd **queen**", selector hops to the knight on "but I chose…" |
| 7…fxg1=N+ | 46.39 | "…the **knight**" (triple-hit stutter 46.39 / 46.67 / 46.93) |
| 8.Rxg1 | 46.93 | "you take it **back**" |
| 8…Bg4+ | 48.81 | "**check** again" (red pulses again on 50.29 and 51.13 – "one more check") |
| nowhere to run | 52.34 | after the stop, flight squares marked on the hits |
| YOU THOUGHT IT WAS OVER… | 53.39 / 53.60 / 54.24 / 54.85 / 55.69 | one word per kick; dots on the stop (55.95–56.21) |
| BUT I'M NOT DONE! | 56.49 / 56.68 / 56.92 / 57.16 | one word per hit (matches "but that's the trick") |
| LASKER / TRAP! | 57.75 / 58.19 | the two biggest closing hits; fade-out follows the song |

Move-quality badges (book / ★ best / ! great / !! brilliant / ? mistake) are *stylistic* — assigned by hand to tell the
story (Black's sacrifices shine, White's 5.Bd2 and 7.Ke2 are the errors), not produced by an engine. Edit `CLASS` in
`engine/state.mjs` to change them.

All of these live in `engine/state.mjs` (`LAND`, `HITS`) and `engine/finale.mjs` (word times, flashes) — change a number
and re-render to nudge anything.

## Rebuild

```bash
npm install                       # skia-canvas + fonts
# put the song at data/song.mp3, then:
python3 tools/extract_pieces.py   # piece art -> data/pieces.json   (needs python-chess)
python3 tools/make_moves.py       # validates the line -> data/moves.json
python3 tools/analyze_audio.py    # envelopes/onsets -> data/audio_events.json (needs librosa)
ffmpeg -i data/song.mp3 -ar 48000 -ac 2 data/song_full.wav
node tools/render_all.mjs out/lasker_trap.mp4 4      # 4 parallel workers, ~7 min on 4 cores
SCALE=0.5 node tools/preview.mjs /tmp/p 3.7 26.9 57.9 # quick half-res stills
```

Piece silhouettes are the cburnett set from python-chess (GPLv2+), restyled; fonts are Anton / Inter (OFL).
