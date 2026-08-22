# ✦ Aura

A game you play lying down.

Hold your phone above your hips, look down your own legs, and glowing orbs appear
where your knees and feet have to travel. Pop them by moving there. Your body
shows up on screen as a glowing silhouette — your aura — that follows your exact
outline, and a combo builds while you keep hitting orbs.

Every exercise in the app is done on your back, your side, or your front. Nothing
asks you to stand up.

## How it works

1. **Pick a level** from the map. Each level opens with a card showing where the
   phone goes.
2. **Get into position** — a framing card shows the live camera with a checklist
   (`hips ✓ · knees ✓ · ankles ✗`) that ticks off as each joint the move needs
   comes into shot, then rolls straight into the countdown. It only ever asks for
   what that move actually needs, so a feet-only move asks for feet. Three setups,
   and a level never mixes them:
   - **Phone in your hands** — on your back, phone above your hips, looking down
     your legs. The default.
   - **Face down, selfie camera** — on your front, phone in front of you, seeing
     past you to your legs. Glutes.
   - **Phone propped up** — leaned against something beside you. Arms, bridges,
     crunches.
3. **Lie still for the 3-2-1.** That is when it works out which way up you are
   and learns your resting position.
4. **Move.** Orbs pop, aura points climb, the combo multiplier grows. Miss too
   long and the combo resets — nothing worse than that.

By default you only see your glowing self on a soft background, not your room.
Tap ◉ to bring the camera picture back for a filter-over-the-room look.

## What's in it

- **16 levels** across four worlds, each earning up to three stars based on how
  many orbs you actually hit.
- **26 moves**, from ankle pumps to face-down donkey kicks.
- **Quick play** — every routine in the library, no unlocking, whenever you want.
- **Seven auras** to unlock with stars: Glow, Rainbow, Sparkle, Galaxy, Mermaid,
  Ice, Ember. All drawn in code, nothing to download.
- **Profiles** — separate stars, streaks and skins per person on the same phone.

## Try it without a camera

`?demo=1` runs the game against a synthetic body, so you can see how it plays on
a laptop or before you get up. It never activates without the flag.

## Running it

```bash
npm start          # http://localhost:8080
npm test           # unit tests for the tracking and game maths
```

Camera access needs `https://` (or localhost). The published build lives on
GitHub Pages; pushing to `main` redeploys it.

## How the tracking works

There is no "AI trainer" guessing at video. It is geometry, and it is inspectable.

1. **Pose landmarks** — MediaPipe Pose Landmarker returns 33 body points plus a
   **segmentation mask** per frame, entirely on-device. The mask is what makes
   the ghost follow your real outline instead of being a stick figure.
2. **Auto-rotation** — pose models are trained on upright people, and a body
   lying sideways in frame detects badly. At the start of each move the app tries
   the frame at 0°, 90°, 270° and 180°, keeps whichever finds a confident
   head-up body, and maps the landmarks back. If tracking drops out mid-level it
   searches again.
3. **Three reference frames** — with the phone in your hands your shoulders are
   out of shot, so the usual shoulder-to-hip body axis does not exist. The app
   falls back through tiers, and asks for no more than the move needs:

   | Tier | Built from | Covers |
   |---|---|---|
   | `torso` | shoulders + hips | everything, including propped levels |
   | `pelvis` | hips + knees | all leg and knee work, hand-held |
   | `limb` | knees + ankles | pure joint angles — ankle pumps, knee extension |

   The hip line is rigid, so its perpendicular is a stable body axis. Which way is
   head-ward is locked during the countdown, since "knees are below the hips"
   stops being true the moment you tuck them. The `limb` tier is what lets you
   point the phone at your own feet from a chair and still play.
4. **Body-frame signals** — no signal uses screen axes. They are joint angles or
   projections onto your own spine axis, divided by your body scale. The numbers
   come out identical whether you are lying head-left, head-right or diagonally,
   near or far. There is a test asserting exactly that for every signal at five
   body angles.
5. **Orbs live in body coordinates** too, which is why they stay glued to you
   while the phone drifts in your hands. After each hit the orb's position is
   nudged toward where your joint actually reached.
6. **The rep counter is the safety net.** A hysteresis state machine counts reps
   independently, adapting to whatever range of motion you are producing. If an
   orb is missed but the rep was real, it still counts.
7. **Nothing is trusted until it is plausible.** Pose models will happily find a
   person in a chair. Every detection has to clear a gate before it is drawn or
   scored: required joints inside the frame rather than pinned to its edge, a
   body big enough to be a body, no teleporting between frames, and a few
   consecutive good frames before lock-on. A detection that fails is drawn as
   nothing at all and counts nothing — an empty frame with a prompt beats a blob
   pretending to be you.

## Where your progress lives

`localStorage`, in the browser you played in — and on iOS that is the catch: a
Safari tab and the home-screen app are separate stores that cannot see each
other. If your profile "disappears", it is almost always that. The **You** tab
tells you which one you are in, and offers a **transfer code**: copy it in one,
paste it in the other, and your stars, streak and skins come across. The app also
asks iOS to keep the data permanently and keeps a backup key, so a storage sweep
does not take your progress with it.

## Numbers, when something feels wrong

**You → Tracking numbers** puts a small line on the play screen: fps,
inference and draw cost in ms, whether the ghost is running from the segmentation
mask, whether the current detection was **accepted or rejected**, which reference
frame tier is in use, the rotation it settled on, and the live orb count. Off by
default. It exists so "it's laggy" can be answered by one screenshot instead of a
code read.

## Privacy

Video never leaves your device — the model runs locally in WebAssembly. Progress
lives in `localStorage` in this browser. There is no account and no server.

The MediaPipe library and model are fetched from a CDN on first use, then cached.
To run fully offline, self-host them and open the app once with `?poseBase=/vendor`
(see `js/pose.js`).

## Project layout

```
index.html            app shell
styles.css            the light glass design system
js/detectors.js       body frames, signals, rep counters (pure, tested)
js/ghost.js           segmentation-mask ghost + procedural skins
js/game.js            orbs, hit detection, combo scoring, the play loop
js/levels.js          worlds, levels, unlock rules
js/exercises.js       the move library
js/pose.js            camera + MediaPipe + rotation search
js/store.js           profiles, stars, streaks, badges
js/app.js             screens and routing
js/fx.js              sounds and particles
tests/                unit tests (node --test)
```

## Known limits

- **Hand-held tracking is the hard case.** Your shoulders are out of shot and the
  phone moves. The pelvis and limb frames and body-relative measurement are built
  for exactly this, but bad light or blankets over your legs will still lose you.
  The `+1` button always counts a rep by hand.
- **The plausibility gate is a judgement call.** Too strict and it refuses a real
  body in a dim room; too loose and the furniture comes back. If it misjudges in
  your room, the stats line says which way — `pose rejected` while you are plainly
  in frame means too strict.
- **Face-down is the least reliable view** — your own torso hides part of your
  legs from the lens.
- Segmentation costs frames. The renderer measures itself and steps down to an
  outline, then to a skeleton-built silhouette, rather than dropping frames.
- It counts reps and pops orbs. It cannot judge your form.
