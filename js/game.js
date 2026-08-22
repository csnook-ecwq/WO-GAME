/**
 * game.js — the part you actually play.
 *
 * Glowing orbs appear where your knees or feet have to travel, you pop them by
 * moving there, and a combo builds while you keep hitting them. The orbs are
 * positioned in *your body's* coordinate system rather than on the screen, so
 * they stay glued to you when the phone drifts — which it does constantly,
 * because you are holding it.
 *
 * Underneath, the rep counter from detectors.js keeps running. If tracking has a
 * bad moment and an orb is missed, a detected rep still counts: the orbs are the
 * fun, the counter is the truth.
 */

import { EXERCISE_BY_ID, VIEWS, repPoints, POINTS_PER_XP } from './exercises.js';
import { createExerciseTracker, LM } from './detectors.js';
import { getLandmarker, startCamera, stopCamera, createPoseLoop } from './pose.js';
import { createGhostRenderer, SKINS } from './ghost.js';
import * as store from './store.js';
import { sfx, say, stopSpeaking, burst, drawParticles, clearParticles, vibrate, unlockAudio } from './fx.js';

const el = (id) => document.getElementById(id);

/** Combo multiplier tiers — generous, because losing a streak should sting mildly. */
export function comboMultiplier(combo) {
  if (combo >= 20) return 4;
  if (combo >= 10) return 3;
  if (combo >= 5) return 2;
  return 1;
}

/** Stars for a finished level, from the share of orbs actually popped. */
export function starsFor(hits, spawned) {
  if (!spawned) return 1;
  const rate = hits / spawned;
  if (rate >= 0.9) return 3;
  if (rate >= 0.65) return 2;
  return 1;
}

/** Is this joint inside the orb? Everything is in body-scale units. */
export function isHit(jointAlong, jointAcross, target) {
  const da = jointAlong - target.along;
  const dc = jointAcross - target.across;
  return Math.hypot(da, dc) <= target.radius;
}

const SIDES = { L: 1, R: -1 };
const jointIndex = (name) => LM[name];
const sideOf = (name) => (name.startsWith('L_') ? 'L' : 'R');

/**
 * Where an orb goes for one joint: the joint's resting spot plus the travel the
 * move demands. `across` is mirrored for the right side so "outward" means
 * outward on both sides.
 */
export function targetFor(spec, rest, jointName) {
  const dir = SIDES[sideOf(jointName)];
  return {
    joint: jointName,
    along: rest.along + (spec.along || 0),
    across: rest.across + (spec.across || 0) * dir,
    radius: spec.radius ?? 0.34,
    born: 0,
    hit: false,
  };
}

const ui = {};
let ghost = null;
let poseLoop = null;
let wakeLock = null;
let cameraOk = false;
let stream = null;

/** Everything the render loop reads. */
const S = {
  phase: 'idle',
  tracker: null,
  exercise: null,
  target: 0,
  reps: 0,
  score: 0,
  combo: 0,
  bestCombo: 0,
  hits: 0,
  spawned: 0,
  orbs: [],
  rest: {},          // jointName -> { along, across } captured at calibration
  progress: 0,
  basePoints: 20,
  lastFrame: null,
  probing: false,
  lastTracking: false,
  lastReason: '',
  showCamera: false,
  style: { color: '#FF8FB1', skin: 'glow' },
  paused: false,
  resolveMove: null,
};

function cacheUi() {
  if (ui.root) return;
  Object.assign(ui, {
    root: el('game'),
    video: el('video'),
    canvas: el('stage'),
    move: el('gameMove'),
    step: el('gameStep'),
    coach: el('gameCoach'),
    countdown: el('gameCountdown'),
    score: el('gameScore'),
    combo: el('gameCombo'),
    reps: el('gameReps'),
    repTarget: el('gameRepTarget'),
    bar: el('gameBar'),
    quit: el('gameQuit'),
    cameraBtn: el('gameCamera'),
    pause: el('gamePause'),
    manual: el('gameManual'),
    skip: el('gameSkip'),
    rest: el('gameRest'),
    restTimer: el('gameRestTimer'),
    restNext: el('gameRestNext'),
    restSkip: el('gameRestSkip'),
    loading: el('gameLoading'),
    loadingText: el('gameLoadingText'),
    loadingCancel: el('gameLoadingCancel'),
  });
  ghost = createGhostRenderer(ui.canvas);
}

/* ------------------------------------------------------------------ canvas */

let view = { w: 0, h: 0, dpr: 1 };

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = ui.canvas.getBoundingClientRect();
  ui.canvas.width = Math.round(rect.width * dpr);
  ui.canvas.height = Math.round(rect.height * dpr);
  const ctx = ui.canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view = { w: rect.width, h: rect.height, dpr };
}

/* ------------------------------------------------------------------- orbs */

function spawnOrbs(frame, now) {
  const spec = S.exercise.target;
  if (!spec) return;
  const joints = spec.joints;
  S.orbs = [];
  if (spec.pairing === 'mirror') {
    for (const j of joints) {
      const rest = S.rest[j];
      if (rest) S.orbs.push({ ...targetFor(spec, rest, j), born: now });
    }
  } else {
    // Alternating moves show one orb at a time, swapping sides after each pop.
    const j = joints[S.spawned % joints.length];
    const rest = S.rest[j];
    if (rest) S.orbs.push({ ...targetFor(spec, rest, j), born: now });
  }
  S.spawned += S.orbs.length;
}

function orbScreenPos(orb, frame, project) {
  return project(frame.place(orb.along, orb.across));
}

function popOrb(orb, frame, project) {
  orb.hit = true;
  S.hits += 1;
  S.combo += 1;
  S.bestCombo = Math.max(S.bestCombo, S.combo);
  const mult = comboMultiplier(S.combo);
  S.score += Math.round(S.basePoints * mult);
  paintScore();

  const pt = orbScreenPos(orb, frame, project);
  burst(pt.x, pt.y, { color: S.style.color, count: 16, speed: 4 });
  if (store.getState().settings.sound) sfx.rep(S.combo);
  vibrate(14);
}

function breakCombo() {
  if (S.combo >= 5 && store.getState().settings.sound) sfx.fail();
  S.combo = 0;
  paintScore();
}

/* -------------------------------------------------------------------- HUD */

function paintScore() {
  ui.score.textContent = S.score.toLocaleString();
  const mult = comboMultiplier(S.combo);
  ui.combo.textContent = S.combo >= 2 ? `${S.combo} · ${mult}×` : '';
  ui.combo.classList.toggle('is-hot', mult > 1);
}

function paintReps() {
  ui.reps.textContent = S.reps;
  ui.repTarget.textContent = `/ ${S.target}`;
  ui.bar.style.width = `${Math.min(100, (S.reps / Math.max(1, S.target)) * 100)}%`;
}

function setCoach(text, warn = false) {
  if (!text) { ui.coach.hidden = true; return; }
  if (ui.coach.textContent !== text) ui.coach.textContent = text;
  ui.coach.classList.toggle('warn', warn);
  ui.coach.hidden = false;
}

/* ------------------------------------------------------------- frame loop */

function countRep(frame, fromOrb) {
  S.reps += 1;
  paintReps();
  if (!fromOrb) {
    // Tracking lost the orb but the rep was real — credit it, no combo bonus.
    S.score += S.basePoints;
    paintScore();
    if (store.getState().settings.sound) sfx.rep(1);
  }
  const remaining = S.target - S.reps;
  const settings = store.getState().settings;
  if (settings.voice && remaining >= 0 && (remaining <= 3 || S.reps % 5 === 0)) {
    say(remaining === 0 ? 'Done' : String(S.reps), { rate: 1.3 });
  }
  if (S.reps >= S.target) finishMove('done');
}

function onFrame(landmarks, tMs, meta) {
  S.probing = !!meta?.probing;
  const calibrating = S.phase === 'countdown';
  const people = meta?.people || [];
  let res = null;

  if (S.tracker && (S.phase === 'active' || calibrating)) {
    res = S.tracker.update(landmarks, tMs, calibrating);
    S.lastTracking = !!res.tracking;
    S.lastReason = res.reason || '';
    S.progress = res.progress || 0;
    if (res.frame && res.tracking) S.lastFrame = res.frame;
  }

  // Draw the world: background + your glowing body.
  const { project } = ghost.render({
    video: ui.video,
    people,
    styles: [S.style],
    showCamera: S.showCamera,
    time: tMs,
    view,
  });

  const ctx = ui.canvas.getContext('2d');
  const frame = res?.frame;

  if (S.phase === 'active' && frame && res?.tracking) {
    setCoach(S.exercise.cue);

    let poppedThisFrame = false;
    if (S.exercise.target) {
      if (!S.orbs.length) spawnOrbs(frame, tMs);
      for (const orb of S.orbs) {
        if (orb.hit) continue;
        const idx = jointIndex(orb.joint);
        const jp = frame.p(idx);
        if (jp) {
          if (isHit(frame.along(jp), frame.across(jp), orb)) {
            popOrb(orb, frame, project);
            // The orb sat where we guessed the joint would reach; now we know
            // where it actually reached, so nudge the next one toward reality.
            const spec = S.exercise.target;
            const rest = S.rest[orb.joint];
            if (rest && spec) {
              rest.learnAlong = frame.along(jp) - (spec.along || 0);
              rest.learnAcross = frame.across(jp) - (spec.across || 0) * SIDES[sideOf(orb.joint)];
              rest.along = rest.along * 0.6 + rest.learnAlong * 0.4;
              rest.across = rest.across * 0.6 + rest.learnAcross * 0.4;
            }
            poppedThisFrame = true;
            countRep(frame, true);
          }
        }
      }
      // All popped, or the set expired: bring the next one out.
      const alive = S.orbs.filter((o) => !o.hit);
      const oldest = S.orbs.length ? tMs - S.orbs[0].born : 0;
      if (!alive.length) {
        S.orbs = [];
      } else if (oldest > (S.exercise.detector?.minIntervalMs ?? 400) * 7) {
        breakCombo();
        S.orbs = [];
      }
    }

    // The rep counter is the safety net: it only scores when the orbs missed it.
    if (res.repDelta > 0 && !poppedThisFrame) countRep(frame, false);

    drawOrbs(ctx, frame, project, tMs);
  } else if (S.phase === 'active') {
    if (S.probing) setCoach('Finding you…', true);
    else if (S.lastReason === 'tier') setCoach(VIEWS[S.exercise.view]?.hint || 'Move the phone back a little', true);
    else if (S.lastReason === 'nobody') setCoach('I cannot see you — is your body in shot?', true);
    else setCoach('Move the phone so your hips and legs are in frame', true);
  }

  drawParticles(ctx, tMs);
}

function drawOrbs(ctx, frame, project, tMs) {
  const spec = S.exercise.target;
  if (!spec) {
    // Moves too small to aim at get a power ring that fills as you go.
    drawPowerRing(ctx, frame, project);
    return;
  }
  for (const orb of S.orbs) {
    if (orb.hit) continue;
    const pt = orbScreenPos(orb, frame, project);
    const jp = frame.p(jointIndex(orb.joint));
    const r = orb.radius * frame.scale * Math.min(view.w, view.h) * 0.9;
    // How close the joint is, so the orb can swell as you approach it.
    let nearness = 0;
    if (jp) {
      const d = Math.hypot(frame.along(jp) - orb.along, frame.across(jp) - orb.across);
      nearness = Math.max(0, 1 - d / (orb.radius * 3));
    }
    const pulse = 1 + Math.sin(tMs * 0.006) * 0.05 + nearness * 0.18;

    // Orbs have to read against the player's own glow, which may be any colour,
    // so they are drawn white-cored with a coloured halo rather than in the
    // player colour — otherwise a pink orb vanishes into a pink body.
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.scale(pulse, pulse);

    ctx.shadowColor = 'rgba(42,35,51,0.35)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = `rgba(255,255,255,${0.3 + nearness * 0.45})`;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.lineWidth = 4 + nearness * 4;
    ctx.strokeStyle = `rgba(255,255,255,${0.75 + nearness * 0.25})`;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = S.style.color;
    ctx.globalAlpha = 0.55 + nearness * 0.45;
    ctx.shadowColor = S.style.color;
    ctx.shadowBlur = 14 + nearness * 24;
    ctx.beginPath();
    ctx.arc(0, 0, r + 5 + nearness * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPowerRing(ctx, frame, project) {
  const centre = project(frame.place(1.1, 0));
  const r = Math.min(view.w, view.h) * 0.12;
  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(20,16,32,0.10)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = S.style.color;
  ctx.shadowColor = S.style.color;
  ctx.shadowBlur = 20;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, S.progress));
  ctx.stroke();
  ctx.restore();
}

function finishMove(outcome) {
  if (!S.resolveMove) return;
  const resolve = S.resolveMove;
  S.resolveMove = null;
  S.phase = 'idle';
  resolve(outcome);
}

/* ---------------------------------------------------------------- helpers */

const sleepers = new Set();
function sleep(ms) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); sleepers.delete(done); resolve(); };
    const timer = setTimeout(done, ms);
    sleepers.add(done);
  });
}
function wakeSleepers() { [...sleepers].forEach((fn) => fn()); }

async function runCountdown(ctl) {
  S.phase = 'countdown';
  ui.countdown.hidden = false;
  poseLoop?.probeOrientation();
  // Hold the countdown while we look for you — but not for long. If the camera
  // genuinely cannot find a body, starting anyway with the +1 button beats
  // staring at "Finding you…".
  const graceUntil = Date.now() + 6000;
  let n = 3;

  while (n > 0 && !ctl.quit && !ctl.skip) {
    if (cameraOk && !S.lastTracking && (Date.now() < graceUntil || (S.probing && Date.now() < graceUntil + 4000))) {
      ui.countdown.textContent = '·';
      setCoach(S.probing ? 'Finding you…' : VIEWS[S.exercise.view]?.hint || 'Get into frame', true);
      await sleep(200);
      continue;
    }
    setCoach(cameraOk ? S.exercise.cue : 'Tracking off — tap +1 for each rep', !cameraOk);
    ui.countdown.textContent = String(n);
    ui.countdown.style.animation = 'none';
    void ui.countdown.offsetWidth;
    ui.countdown.style.animation = '';
    if (store.getState().settings.sound) sfx.countdown();
    if (n === 3 && store.getState().settings.voice) say(S.exercise.cue, { rate: 1.05 });
    await sleep(900);
    n -= 1;
  }

  if (!ctl.quit) {
    ui.countdown.textContent = 'GO';
    if (store.getState().settings.sound) sfx.go();
    vibrate([30, 40, 30]);
    await sleep(400);
  }
  ctl.skip = false;
  ui.countdown.hidden = true;
  setCoach(S.exercise.cue);
}

async function runRest(seconds, nextLabel, ctl) {
  return new Promise((resolve) => {
    S.phase = 'rest';
    let left = seconds;
    const done = () => {
      clearInterval(timer);
      sleepers.delete(done);
      ui.rest.hidden = true;
      ui.restSkip.onclick = null;
      resolve();
    };
    sleepers.add(done);
    if (ctl.quit) { done(); return; }
    ui.restNext.textContent = nextLabel || 'Last one done';
    ui.restTimer.textContent = String(left);
    ui.rest.hidden = false;
    const timer = setInterval(() => {
      left -= 1;
      ui.restTimer.textContent = String(Math.max(0, left));
      if (left <= 0) done();
    }, 1000);
    ui.restSkip.onclick = done;
  });
}

async function setupCamera(facing, players) {
  ui.loading.hidden = false;
  ui.loadingText.textContent = 'Waking up the camera…';
  stream = await startCamera(ui.video, { facing });
  ui.loadingText.textContent = 'Loading the body tracker (first time only)…';
  const model = await getLandmarker({ model: 'lite', segmentation: true, players });
  poseLoop = createPoseLoop(ui.video, model, onFrame);
  poseLoop.start();
  cameraOk = true;
  ui.loading.hidden = true;
}

async function requestWakeLock() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); }
  catch { /* not critical */ }
}


/* -------------------------------------------------------------- demo mode */

/**
 * `?demo=1` plays the game against a synthetic body instead of the camera.
 *
 * It exists because the thing hardest to check without a person in front of a
 * phone is exactly this: does the ghost, the orbs and the HUD compose into
 * something readable. It also lets you look at the game on a laptop with no
 * camera. It never runs unless the flag is in the URL.
 */
export const isDemo = () => {
  try { return new URLSearchParams(location.search).has('demo'); } catch { return false; }
};

function demoBody(t, exercise) {
  const P = (x, y) => ({ x, y, z: 0, visibility: 0.95 });
  // A body lying with its head up the frame, hips centred.
  const lm = Array.from({ length: 33 }, () => P(0.5, 0.5));
  const beat = Math.sin(t / 520);                 // one slow rep cycle
  const swing = Math.max(0, beat);
  const alt = Math.sin(t / 420);

  lm[LM.NOSE] = P(0.5, 0.12);
  lm[LM.L_SHOULDER] = P(0.42, 0.26); lm[LM.R_SHOULDER] = P(0.58, 0.26);
  lm[LM.L_ELBOW] = P(0.36, 0.40); lm[LM.R_ELBOW] = P(0.64, 0.40);
  lm[LM.L_WRIST] = P(0.34, 0.53); lm[LM.R_WRIST] = P(0.66, 0.53);
  lm[LM.L_HIP] = P(0.44, 0.56); lm[LM.R_HIP] = P(0.56, 0.56);

  const sig = exercise?.signal || 'kneeAlternate';
  let lKnee = [0.44, 0.74], rKnee = [0.56, 0.74];
  let lAnkle = [0.44, 0.92], rAnkle = [0.56, 0.92];

  if (sig === 'hipTuck') {                        // both knees to the chest
    lKnee = [0.44, 0.74 - swing * 0.22]; rKnee = [0.56, 0.74 - swing * 0.22];
    lAnkle = [0.44, 0.92 - swing * 0.16]; rAnkle = [0.56, 0.92 - swing * 0.16];
  } else if (sig === 'kneeAlternate') {           // knees alternate up the body
    lKnee = [0.44, 0.74 - Math.max(0, alt) * 0.20];
    rKnee = [0.56, 0.74 - Math.max(0, -alt) * 0.20];
    lAnkle = [0.44, 0.92 - Math.max(0, alt) * 0.12];
    rAnkle = [0.56, 0.92 - Math.max(0, -alt) * 0.12];
  } else if (sig === 'ankleSplit') {              // feet flutter side to side
    lAnkle = [0.44 - alt * 0.10, 0.92]; rAnkle = [0.56 + alt * 0.10, 0.92];
  } else if (sig === 'legSpread') {               // legs slide apart and back
    lAnkle = [0.44 - swing * 0.16, 0.92]; rAnkle = [0.56 + swing * 0.16, 0.92];
  } else if (sig === 'kneeExtendAlternate' || sig === 'kneeExtend') {
    lAnkle = [0.44, 0.92 + Math.max(0, alt) * 0.05];
    rAnkle = [0.56, 0.92 + Math.max(0, -alt) * 0.05];
    lKnee = [0.44, 0.74]; rKnee = [0.56, 0.74];
  } else if (sig === 'anklePump') {
    lAnkle = [0.44, 0.92]; rAnkle = [0.56, 0.92];
  }

  lm[LM.L_KNEE] = P(...lKnee); lm[LM.R_KNEE] = P(...rKnee);
  lm[LM.L_ANKLE] = P(...lAnkle); lm[LM.R_ANKLE] = P(...rAnkle);
  lm[LM.L_HEEL] = P(lAnkle[0] - 0.01, lAnkle[1] + 0.02);
  lm[LM.R_HEEL] = P(rAnkle[0] + 0.01, rAnkle[1] + 0.02);
  const toe = sig === 'anklePump' ? 0.03 + swing * 0.03 : 0.03;
  lm[LM.L_FOOT] = P(lAnkle[0] + 0.02, lAnkle[1] + toe);
  lm[LM.R_FOOT] = P(rAnkle[0] - 0.02, rAnkle[1] + toe);
  return lm;
}

/** A body-shaped mask so the demo ghost looks like the real one. */
function demoMask(landmarks) {
  const W = 128, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.strokeStyle = '#fff';
  const at = (i) => ({ x: landmarks[i].x * W, y: landmarks[i].y * H });
  const bone = (a, b, w) => {
    const p = at(a), q = at(b);
    g.lineWidth = w;
    g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
  };
  bone(LM.L_SHOULDER, LM.R_SHOULDER, 16);
  bone(LM.L_SHOULDER, LM.L_HIP, 16); bone(LM.R_SHOULDER, LM.R_HIP, 16);
  bone(LM.L_HIP, LM.R_HIP, 16);
  bone(LM.L_SHOULDER, LM.L_ELBOW, 8); bone(LM.L_ELBOW, LM.L_WRIST, 7);
  bone(LM.R_SHOULDER, LM.R_ELBOW, 8); bone(LM.R_ELBOW, LM.R_WRIST, 7);
  bone(LM.L_HIP, LM.L_KNEE, 11); bone(LM.L_KNEE, LM.L_ANKLE, 9); bone(LM.L_ANKLE, LM.L_FOOT, 6);
  bone(LM.R_HIP, LM.R_KNEE, 11); bone(LM.R_KNEE, LM.R_ANKLE, 9); bone(LM.R_ANKLE, LM.R_FOOT, 6);
  const head = at(LM.NOSE);
  g.beginPath(); g.arc(head.x, head.y, 9, 0, Math.PI * 2); g.fill();
  const px = g.getImageData(0, 0, W, H).data;
  const data = new Uint8Array(W * H);
  for (let i = 0; i < data.length; i++) data[i] = px[i * 4 + 3];
  return { data, width: W, height: H };
}

function startDemoLoop() {
  let raf = 0;
  let running = true;
  const tick = () => {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const t = performance.now();
    const lm = demoBody(t, S.exercise);
    onFrame(lm, t, { probing: false, rotation: 0, people: [{ landmarks: lm, mask: demoMask(lm), maskRotation: 0 }] });
  };
  raf = requestAnimationFrame(tick);
  return { start() { running = true; tick(); }, stop() { running = false; cancelAnimationFrame(raf); }, probeOrientation() {} };
}

/* -------------------------------------------------------------- the level */

/**
 * Plays one level (a routine) and resolves with what happened.
 * @returns {Promise<null|object>} null if quit before doing anything
 */
export async function playLevel(level, { style } = {}) {
  cacheUi();
  unlockAudio();

  const settings = store.getState().settings;
  S.showCamera = !!settings.showCamera;
  S.style = style || { color: '#FF8FB1', skin: 'glow' };
  S.score = 0; S.combo = 0; S.bestCombo = 0; S.hits = 0; S.spawned = 0;
  cameraOk = false;
  clearParticles();

  ui.root.hidden = false;
  document.body.classList.add('playing');
  resize();
  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  requestWakeLock();
  paintScore();

  const ctl = { quit: false, skip: false };
  const perMove = [];
  const startedAt = Date.now();

  ui.quit.onclick = () => {
    if (S.reps > 0 || perMove.length) {
      if (!confirm('Finish here? Everything you have done still counts.')) return;
    }
    ctl.quit = true; wakeSleepers(); finishMove('quit');
  };
  ui.cameraBtn.onclick = () => {
    S.showCamera = !S.showCamera;
    store.setSetting('showCamera', S.showCamera);
    ui.cameraBtn.setAttribute('aria-pressed', String(S.showCamera));
  };
  ui.manual.onclick = () => { if (S.phase === 'active') countRep(null, false); };
  ui.skip.onclick = () => {
    if (S.phase === 'active') finishMove('skip');
    else if (S.phase === 'countdown') { ctl.skip = true; wakeSleepers(); }
  };
  ui.pause.onclick = () => {
    S.paused = !S.paused;
    ui.pause.textContent = S.paused ? 'Resume' : 'Pause';
    if (S.paused) { poseLoop?.stop(); setCoach('Paused', true); }
    else { poseLoop?.start(); setCoach(S.exercise?.cue || ''); }
  };
  ui.loadingCancel.onclick = () => { ctl.quit = true; wakeSleepers(); finishMove('quit'); };

  // Every move in a level shares one camera setup, so open with the first one.
  const firstView = VIEWS[EXERCISE_BY_ID[level.moves[0][0]]?.view] || VIEWS.handheld;
  try {
    if (isDemo()) {
      ui.loading.hidden = true;
      poseLoop = startDemoLoop();
      cameraOk = true;
    } else {
      await setupCamera(firstView.facing, 1);
    }
  } catch (err) {
    console.warn('Camera unavailable', err);
    ui.loading.hidden = true;
    cameraOk = false;
    setCoach(/denied|not allowed|permission/i.test(err?.message || '')
      ? 'Camera blocked — tap +1 to count reps by hand'
      : 'No camera available — tap +1 to count reps by hand', true);
  }

  for (let i = 0; i < level.moves.length && !ctl.quit; i++) {
    const [exId, reps] = level.moves[i];
    const ex = EXERCISE_BY_ID[exId];
    S.exercise = ex;
    S.target = reps;
    S.reps = 0;
    S.orbs = [];
    S.rest = {};
    S.progress = 0;
    S.lastFrame = null;
    S.lastTracking = false;
    S.basePoints = repPoints(ex.id, level.xpMultiplier || 1);
    S.tracker = cameraOk ? createExerciseTracker(ex) : null;

    ui.move.textContent = `${ex.emoji} ${ex.name}`;
    ui.step.textContent = `${i + 1} of ${level.moves.length}`;
    paintReps();

    await runCountdown(ctl);
    if (ctl.quit) break;

    // Capture resting positions for the orbs from the first good frame.
    S.phase = 'active';
    captureRest();

    const outcome = await new Promise((resolve) => { S.resolveMove = resolve; });
    perMove.push({ id: ex.id, name: ex.name, emoji: ex.emoji, reps: S.reps, target: reps });
    if (outcome === 'quit') { ctl.quit = true; break; }
    if (outcome === 'done') {
      if (store.getState().settings.sound) sfx.complete();
      vibrate([40, 60, 40]);
    }

    const isLast = i === level.moves.length - 1;
    if (!isLast) {
      const next = EXERCISE_BY_ID[level.moves[i + 1][0]];
      await runRest(outcome === 'done' ? 12 : 8, next ? `Next: ${next.name}` : '', ctl);
    }
  }

  // Teardown
  S.phase = 'ended';
  sleepers.clear();
  poseLoop?.stop();
  poseLoop = null;
  stopCamera(ui.video);
  stream = null;
  stopSpeaking();
  try { wakeLock?.release(); } catch { /* ignore */ }
  wakeLock = null;
  clearParticles();
  window.removeEventListener('resize', onResize);
  window.removeEventListener('orientationchange', onResize);
  ui.root.hidden = true;
  ui.rest.hidden = true;
  ui.countdown.hidden = true;
  ui.coach.hidden = true;
  ui.pause.textContent = 'Pause';
  S.paused = false;
  document.body.classList.remove('playing');

  if (!perMove.length) return null;
  const reps = perMove.reduce((n, m) => n + m.reps, 0);
  const targetReps = level.moves.reduce((n, [, r]) => n + r, 0);
  return {
    levelId: level.id,
    reps,
    targetReps,
    score: S.score,
    bestCombo: S.bestCombo,
    hits: S.hits,
    spawned: S.spawned,
    stars: reps === 0 ? 0 : starsFor(S.hits, S.spawned || reps),
    xp: Math.round(S.score / POINTS_PER_XP),
    seconds: Math.round((Date.now() - startedAt) / 1000),
    perfect: perMove.length === level.moves.length && perMove.every((m) => m.reps >= m.target),
    perMove,
  };
}

/**
 * Snapshots where each tracked joint sits at rest, using the last frame seen
 * during the countdown. The orbs are placed relative to these.
 */
function captureRest() {
  const spec = S.exercise?.target;
  const frame = S.lastFrame;
  if (!spec || !frame) return;
  for (const j of spec.joints) {
    const p = frame.p(jointIndex(j));
    if (p) S.rest[j] = { along: frame.along(p), across: frame.across(p) };
  }
}
