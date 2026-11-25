# Drift — an arrow-untangling puzzle

Open `index.html` on a phone. It is one self-contained file: no network, no ads, no payments.

- Tap an arrow: it flies off the board if every cell in its path is empty; otherwise nothing happens.
- Ringed arrows turn a quarter clockwise when a neighbour next to them leaves (amber ones turn the other
  way, dashed ones flip). This is what makes order matter: a careless tap can turn an arrow to face a wall it
  can never get past.
- No timer, no lives. A locked board just offers Replay. Progress is kept in the browser on that device.

- The board fills the screen edge to edge; bigger boards get smaller cells. Pinch to zoom, drag to pan,
  ⤢ zooms back out. A tap lands on the arrow under your finger, or the nearest one within half a cell.

## Levels
Every board is 15x15 or bigger and dense from level 1. Set 1 (`levels.json`) runs 15x15 → 17x17,
from 62% full to completely full on levels 14–15; random tapping never clears any of them. Each board is
built backwards from an empty grid, so it always has a solution (stored with the level and checked by
`npm test`). After Set 1, each new set of 15 is generated on the phone (15x15 → 18x18), scaled to a skill
rating that moves with how often you replay before clearing.

## Files
- `game.src.html`, `engine.cjs`, `levels.json`: the sources. `node build.mjs` combines them into `index.html`.
- `tools/set1.cjs`: builds Set 1 and writes `levels.json`.
