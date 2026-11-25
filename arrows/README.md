# Drift — an arrow-untangling puzzle

Open `index.html` on a phone. It is one self-contained file: no network, no ads, no payments.

- Tap an arrow: it flies off the board if every cell in its path is empty; otherwise nothing happens.
- Ringed arrows turn a quarter clockwise when a neighbour next to them leaves (amber ones turn the other
  way, dashed ones flip). This is what makes order matter: a careless tap can turn an arrow to face a wall it
  can never get past.
- No timer, no lives. A locked board just offers Replay. Progress is kept in the browser on that device.

## Levels
Set 1 is the 15 hand-checked boards in `levels.json`. Levels 7–15 have exactly one solution (taps that don't
affect each other may come in any order). Levels 14–15 fill every cell. After Set 1, each new set
of 15 is generated on the phone, scaled to a skill rating that moves with how often you replay before clearing.

## Files
- `game.src.html`, `engine.cjs`, `levels.json`: the sources. `node build.mjs` combines them into `index.html`.
- `tools/`: the offline searches that produced Set 1 (`levels.cjs`, `nightmare.cjs`, `traces.cjs`, `assemble.cjs`).
