# Arrow Unwind

Open `index.html` in any modern browser (phone, tablet or desktop). It is one self-contained file:
no network, accounts, ads or purchases. Progress, settings and statistics are saved on the device.

## Play
- **Tap an arrow** and it slides out head-first, its body following its own winding path. It only goes
  if nothing is in the way between its head and the edge; otherwise it bumps, and it and its blocker flash red.
- **2D**: 15 silhouettes (square, rectangle, circle, heart, star, flower, butterfly, cat, fish, turtle,
  diamond, ring, cross, wave, maze). Drag to pan, pinch or scroll to zoom.
- **3D**: arrows cover all six faces of a cube or prism (slab, tower, bar, brick) and wrap over edges.
  An arrow leaves at the edge of the face its head is on, so arrows crossing from neighbouring faces can block it.
  Drag to turn (with a little momentum), pinch or scroll to zoom, two fingers to pan.
- **Difficulties**: Easy → Impossible. Boards grow (2D Impossible: 50×50 cells, ~400 arrows), arrows get
  longer and twistier, and dependency chains get deeper.
- **Modes**: Relax (no pressure), Classic (three hearts, a blocked tap costs one), Challenge (countdown or
  stopwatch, move count, personal bests), Endless (next puzzle starts by itself, harder every three).
- Daily 2D and 3D puzzles, levels per difficulty, undo, hint, restart, pause, autosave and continue,
  statistics, light/dark theme, arrow colours, grid, animation speed, sound, vibration.

## How puzzles are made
`src/engine.cjs` covers the shape with winding paths, then peels them off one at a time, giving each path
the end that can get out as its head (cutting a path in two when nothing can). The peeling order is a
solution, so every puzzle is solvable; the solver checks every puzzle again before it is shown. Removing an
arrow only ever frees space, so any arrow that can leave is a safe move — hints pick, among those, the one
the most other arrows are waiting on.

## Files
- `src/engine.cjs`: surfaces, generation, solver (no DOM; also used by `npm test`).
- `src/app.js`, `src/index.src.html`: rendering (Canvas 2D, with its own 3D projection), input, modes, menus.
- `node build.mjs` combines them into `index.html`.
