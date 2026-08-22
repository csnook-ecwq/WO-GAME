# 🦥 Sloth Mode — the lazy workout game

A workout app for people who do not want to work out. Pick a body part, pick a
routine, prop your phone against something, and the camera counts your reps by
watching your feet. No account, no cloud, no equipment, no getting off the floor
if you do not want to.

<!-- screens: home (body map) → routine list → camera with AR overlay → summary -->

## What it does

- **Pick a target area** — tap a body part on the figure (legs, glutes, core,
  arms) or choose cardio / full body from the list.
- **Pick your effort level** — every area has routines from "Horizontal" to
  "Actually Trying". The lazy ones are real workouts, just short.
- **The camera counts for you** — a pose model tracks your ankles, heels, knees
  and hips and marks each rep automatically, with an AR overlay on your feet,
  a rep counter, sound and spoken counting.
- **It keeps score** — XP, levels (Fully Horizontal → Legend of the Rug), day
  streaks, badges, per-area mastery and a 14-day history.

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

1. Prop the phone against a wall, a book, a water bottle — anything. Aim it at
   the space you will be in.
2. Get **2–3 metres back** so your whole body, and especially your feet, are in
   frame. Floor exercises: put the phone on the floor, side-on.
3. Hold still during the `3 · 2 · 1` countdown — that is when the app measures
   your resting position and calibrates.
4. Move. Each rep pops, blips and counts itself. If tracking loses you, the
   overlay turns red and tells you what to fix.
5. `+1` counts a rep by hand any time — if the light is bad, the camera is
   blocked, or you just want to lie about it.

## How the rep counting works

There is no machine learning specific to this app and no "AI trainer" guessing
at video. It is deliberately simple and inspectable:

1. **Pose landmarks** — MediaPipe Pose Landmarker returns 33 body points per
   frame, entirely on-device (`js/pose.js`).
2. **One signal per exercise** — each move reduces those points to a single
   number that means "how far into the rep are you" (`SIGNALS` in
   `js/detectors.js`). High knees use the height difference between the knees;
   calf raises use how far the heels sit above the toes; jacks use the gap
   between the ankles; squats use hip height relative to the ankles.
3. **Scale normalisation** — every signal is divided by your torso length, so
   standing closer to the phone does not change the numbers.
4. **Calibration** — the countdown measures your resting value, so thresholds
   are relative to *your* start position, not an assumed one.
5. **A state machine counts reps** — `cycle` moves (squats, calf raises) count
   one rep per out-and-back swing; `alternate` moves (high knees, flutter kicks)
   count each side as it crosses the middle. A minimum interval rejects
   impossible rep rates, and a visibility gate refuses to count anything while
   your feet are out of frame.
6. **Adaptive thresholds** — after a couple of reps the counter re-tunes to the
   range of motion you are actually producing. Half-depth squats still count.
   That is the whole point of the app.

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
  area: 'core', emoji: '👣', position: 'floor', laziness: 2,
  cue: 'Lying down, tap alternate heels out in front of you.',
  framing: 'Phone on the floor, side-on, feet in shot.',
  tips: ['Each tap counts as a rep'],
  signal: 'ankleAlternate',                 // any key from SIGNALS
  needs: [27, 28, 29, 30, 31, 32],          // landmarks that must be visible
  detector: { mode: 'alternate', enter: 0.08, minIntervalMs: 260 },
  xp: 1,
}
```

If none of the existing signals fit, add one to `SIGNALS` in `js/detectors.js` —
it just maps a frame to a number where bigger means more effort. `npm test`
checks that every exercise and routine is wired up correctly.

## Project layout

```
index.html            app shell
styles.css            all styling (dark arcade theme, mobile first)
js/detectors.js       pose signals + rep state machines (pure, tested)
js/exercises.js       areas, moves and routines — the content layer
js/pose.js            camera + MediaPipe wiring, throttled detect loop
js/session.js         the camera game screen: countdown, tracking, rest
js/store.js           XP, levels, streaks, badges, history (localStorage)
js/fx.js              blips, spoken counting, particles, confetti
js/app.js             screens and routing
sw.js                 offline app shell
tests/                unit tests (node --test)
```

## Known limits

- Rep counting depends on the camera seeing you. Bad light, baggy clothes, a
  cluttered background or feet out of frame all degrade it — hence the `+1`
  button and the on-screen framing warnings.
- Wall push-ups and couch dips are counted from elbow bend, so the camera needs
  a side view of your arms rather than your feet.
- On older phones the pose model can cost 100ms+ per frame. The detect loop
  throttles itself so the interface stays responsive, at the cost of tracking
  fast movements less precisely.
- It cannot judge your form. It counts reps. Sloth Mode has no opinions.
