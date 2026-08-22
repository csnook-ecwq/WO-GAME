# 🦥 Sloth Mode — the lazy workout game

A workout app for people who do not want to work out. **Every single exercise is
done lying down** — on your back, on your side, or face down. Pick a body part,
put your phone on the floor next to you, and the camera counts your reps while
you lie there. Your score climbs with every rep.

No account, no cloud, no equipment, and at no point are you asked to stand up.

<!-- screens: home (body map) → routine list → camera with AR overlay → summary -->

## What it does

- **Pick a target area** — tap a body part on the figure (legs, glutes, core,
  arms) or choose cardio / full body from the list. Every area has three
  routines, all of them floor-only.
- **Pick your effort level** — from "Horizontal" (ankle pumps and snow angels)
  to "Actually Trying" (leg lowers, floor sprints). The lazy ones are real
  workouts, just short.
- **The camera counts for you** — a pose model tracks your knees, ankles, hips
  and elbows and marks each rep automatically, with an AR overlay on your feet,
  a live score that ticks up per rep, sound and spoken counting.
- **It keeps score** — points during the workout, then XP, levels (Fully
  Horizontal → Legend of the Rug), day streaks, badges, per-area mastery and a
  14-day history.

24 exercises across six areas: knee tucks, flutter kicks, bicycles, dead bugs
and leg lowers for core; floor bridges, clamshells and side leg lifts for
glutes; ceiling presses, heel curls and ankle pumps for legs; floor presses,
ceiling punches, snow angels and skull crushers for arms; plus lying jacks and
floor knee drives when you want your heart rate up without standing.

Everything runs in the browser. Add it to your home screen and it behaves like
an app, offline included.

## Quick start

```bash
npm start          # http://localhost:8080
npm test           # unit tests for the rep-counting logic
```

`localhost` counts as a secure context, so camera access works straight away on
your laptop. **To use it on your phone you need HTTPS** — see below.

## Getting it on your phone

Camera access requires `https://` (or localhost). Pick whichever is easiest:

| Option | How |
| --- | --- |
| **GitHub Pages** (easiest) | Push this repo, then Settings → Pages → Source: *GitHub Actions*. The included workflow publishes on every push to `main`. |
| **Tunnel** | `npm start` then `ngrok http 8080` (or `cloudflared tunnel --url http://localhost:8080`) and open the https URL on your phone. |
| **Any static host** | Netlify, Vercel, Cloudflare Pages — drop the folder in, there is no build step. |

Then open it in Safari/Chrome on the phone and use *Add to Home Screen*.

## How to actually use it

1. Lie down. Put the phone on the floor **about 2 metres away, side-on**, so
   your whole body from head to feet is in shot. Leaning it against a wall or a
   shoe works well.
2. Lie still during the `3 · 2 · 1` countdown. That is when the app figures out
   which way up you are and measures your resting position.
3. Move. Each rep pops, blips, adds points and counts itself. If tracking loses
   you, the overlay turns red and tells you what to fix.
4. Between moves you get a rest timer, which tells you if the next move needs
   you to roll onto your side or your front.
5. `+1` counts a rep by hand any time — if the light is bad, the camera is
   blocked, or you just want to lie about it.

## How the rep counting works

There is no machine learning specific to this app and no "AI trainer" guessing
at video. It is deliberately simple and inspectable:

1. **Pose landmarks** — MediaPipe Pose Landmarker returns 33 body points per
   frame, entirely on-device (`js/pose.js`).
2. **Auto-rotation** — pose models are trained almost entirely on upright
   people, and a body lying horizontally in frame detects far worse. So at the
   start of each move the app briefly tries the frame at 0°, 90°, 270° and 180°,
   scores each by how confidently it finds a head-up body, keeps the winner, and
   maps the landmarks back for drawing. If you roll onto your side mid-routine
   and tracking drops out, it re-runs that search automatically.
3. **One signal per exercise** — each move reduces those points to a single
   number meaning "how far into the rep are you" (`SIGNALS` in
   `js/detectors.js`). Bicycles use which knee is drawn further up the body;
   bridges use how far the hips sit off the shoulder-to-knee line; knee tucks
   use the hip angle; floor presses use elbow angle.
4. **Body-frame measurement** — no signal uses raw image axes. They are joint
   angles, or projections onto your own spine axis and its perpendicular, all
   divided by your body scale. That means the numbers are identical whether you
   are lying head-left, head-right or diagonally across the frame, and whether
   the phone is near or far. There is a unit test asserting exactly this for
   every signal at five different body angles.
5. **Calibration** — the countdown measures your resting value, so thresholds
   are relative to *your* start position, not an assumed one.
6. **A state machine counts reps** — `cycle` moves (bridges, knee tucks) count
   one rep per out-and-back swing; `alternate` moves (bicycles, flutter kicks)
   count each side as it crosses the middle. A minimum interval rejects
   impossible rep rates, and a visibility gate refuses to count anything while
   your legs are out of frame.
7. **Adaptive thresholds** — after a couple of reps the counter re-tunes to the
   range of motion you are actually producing. Half-range knee tucks still
   count. That is the whole point of the app.

The detectors are pure functions with no DOM or camera dependency, so they are
unit tested against synthetic bodies: `npm test`.

## Privacy

Video never leaves your device — the pose model runs locally in WebAssembly and
no frame is uploaded anywhere. Progress lives in `localStorage` in your browser.
Clearing site data erases it; there is no backup and no account.

The MediaPipe library and model weights are fetched from a CDN the first time
you start a workout, then cached by the browser. To run fully offline, self-host
them (see below).

## Self-hosting the pose model (fully offline)

```bash
npm pack @mediapipe/tasks-vision@0.10.14      # or npm install it
# copy vision_bundle.mjs and wasm/ into ./vendor
curl -o vendor/pose_landmarker_lite.task \
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
```

Then open the app once with `?poseBase=/vendor`. The choice is remembered.
Serve `.wasm` as `application/wasm` — the included dev server already does.

## Adding your own exercise

Add an entry to `EXERCISES` in `js/exercises.js` and reference it from a routine:

```js
{
  id: 'heel-taps',
  name: 'Heel Taps',
  area: 'core', emoji: '👣', position: 'back',   // back | side | front only
  laziness: 2,
  cue: 'On your back, tap alternate heels out along the floor.',
  framing: 'Phone on the floor about 2m away, pointed at your legs and feet.',
  tips: ['Each tap counts as a rep'],
  signal: 'ankleAlternate',                 // any key from SIGNALS
  needs: [23, 24, 25, 26, 27, 28],          // landmarks that must be visible
  detector: { mode: 'alternate', enter: 0.12, minIntervalMs: 260 },
  xp: 1,
}
```

If none of the existing signals fit, add one to `SIGNALS` in `js/detectors.js` —
it maps a frame to a number where bigger means more effort. Build it from
`f.along()`, `f.across()` and `angleAt()` rather than raw `x`/`y`, or it will
break the moment someone lies down the other way round. `npm test` checks that
every exercise is lying-down, wired to a real signal, and rotation-independent.

## Project layout

```
index.html            app shell
styles.css            all styling (dark arcade theme, mobile first)
js/detectors.js       pose signals + rep state machines (pure, tested)
js/exercises.js       areas, lying-down moves and routines — the content layer
js/pose.js            camera + MediaPipe wiring, rotation search, throttled loop
js/session.js         the camera game screen: countdown, tracking, rest
js/store.js           XP, levels, streaks, badges, history (localStorage)
js/fx.js              blips, spoken counting, particles, confetti
js/app.js             screens and routing
sw.js                 offline app shell
tests/                unit tests (node --test)
```

## Known limits

- Rep counting depends on the camera seeing you. Bad light, baggy clothes, a
  cluttered background or legs out of frame all degrade it — hence the `+1`
  button and the on-screen framing warnings.
- Lying-down tracking is harder than standing tracking, even with the rotation
  search: side-lying and face-down poses hide half your joints from the camera,
  so clamshells and prone leg lifts are the least reliable moves in the app.
  Point the phone at your legs for those.
- Arm moves (floor presses, skull crushers) are counted from elbow angle, so the
  camera needs a view of your arms rather than your feet.
- On older phones the pose model can cost 100ms+ per frame. The detect loop
  throttles itself so the interface stays responsive, at the cost of tracking
  fast movements less precisely.
- It cannot judge your form. It counts reps. Sloth Mode has no opinions.
