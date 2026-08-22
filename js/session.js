/**
 * session.js — the camera game screen.
 *
 * Runs one routine end to end: countdown + calibration, live rep tracking with
 * an AR overlay, rest between moves, then resolves with what actually happened.
 */

import { EXERCISE_BY_ID, routineReps, repPoints, POSITIONS, POINTS_PER_XP } from './exercises.js';
import { createExerciseTracker, LM } from './detectors.js';
import { getLandmarker, startCamera, stopCamera, createPoseLoop, POSE_CONNECTIONS, FOOT_POINTS } from './pose.js';
import * as store from './store.js';
import { sfx, say, stopSpeaking, burst, drawParticles, clearParticles, vibrate, unlockAudio } from './fx.js';

const el = (id) => document.getElementById(id);

const ui = {};
let ctx = null;
let poseLoop = null;
let wakeLock = null;
let cameraOk = false;

/** Live session state, read by the render loop. */
const S = {
  phase: 'idle',        // idle | countdown | active | rest | paused | ended
  tracker: null,
  exercise: null,
  target: 0,
  reps: 0,
  lastTracking: false,
  lastReason: '',
  lastSpokeAt: 0,
  score: 0,
  points: 20,
  probing: false,
  resolveMove: null,
  paused: false,
  accent: '#7CFF6B',
  progress: 0,
  facing: 'user',
};

function cacheUi() {
  if (ui.root) return;
  Object.assign(ui, {
    root: el('session'),
    video: el('video'),
    canvas: el('overlay'),
    move: el('sessionMove'),
    step: el('sessionStep'),
    coach: el('coach'),
    scoreValue: el('scoreValue'),
    scorePop: el('scorePop'),
    countdown: el('countdown'),
    repCount: el('repCount'),
    repTarget: el('repTarget'),
    repBar: el('repBar'),
    repCue: el('repCue'),
    pauseBtn: el('pauseBtn'),
    manualBtn: el('manualBtn'),
    skipBtn: el('skipBtn'),
    quitBtn: el('quitBtn'),
    flipBtn: el('flipBtn'),
    rest: el('restPanel'),
    restTimer: el('restTimer'),
    restNext: el('restNext'),
    restSkip: el('restSkip'),
    loading: el('sessionLoading'),
    loadingText: el('loadingText'),
    loadingCancel: el('loadingCancel'),
  });
  ctx = ui.canvas.getContext('2d');
}

/* ------------------------------------------------------------------ canvas */

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = ui.canvas.getBoundingClientRect();
  ui.canvas.width = Math.round(rect.width * dpr);
  ui.canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: rect.width, h: rect.height };
}

let viewSize = { w: 0, h: 0 };

/** Normalized landmark -> canvas pixels, matching the video's object-fit:cover. */
function project(p) {
  const vw = ui.video.videoWidth || 1280;
  const vh = ui.video.videoHeight || 720;
  const { w, h } = viewSize;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  return { x: (w - dw) / 2 + p.x * dw, y: (h - dh) / 2 + p.y * dh };
}

function drawOverlay(landmarks, res) {
  const { w, h } = viewSize;
  ctx.clearRect(0, 0, w, h);
  const showSkeleton = store.getState().settings.skeleton;

  if (landmarks && showSkeleton) {
    const pts = landmarks.map(project);
    const tracking = res?.tracking;

    ctx.lineWidth = 4;
    ctx.strokeStyle = tracking ? '#FFFFFF55' : '#FF6B6B55';
    ctx.lineCap = 'round';
    for (const [a, b] of POSE_CONNECTIONS) {
      const p = pts[a], q = pts[b];
      if (!p || !q) continue;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }

    ctx.fillStyle = tracking ? '#FFFFFFAA' : '#FF6B6BAA';
    for (let i = 11; i < pts.length; i++) {
      if (FOOT_POINTS.includes(i)) continue;
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Feet get the hero treatment: glowing markers plus a progress ring that
    // fills as you approach the top of the rep.
    const progress = S.phase === 'active' ? (res?.progress || 0) : 0;
    for (const idx of [LM.L_ANKLE, LM.R_ANKLE]) {
      const p = pts[idx];
      if (!p) continue;
      ctx.save();
      ctx.shadowColor = S.accent;
      ctx.shadowBlur = 18;
      ctx.strokeStyle = S.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.stroke();
      if (progress > 0.02) {
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const idx of [LM.L_FOOT, LM.R_FOOT, LM.L_HEEL, LM.R_HEEL]) {
      const p = pts[idx];
      if (!p) continue;
      ctx.fillStyle = S.accent;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawParticles(ctx);
}

function repFlash(landmarks) {
  if (!landmarks) {
    burst(viewSize.w / 2, viewSize.h * 0.6, { color: S.accent, count: 22 });
    return;
  }
  for (const idx of [LM.L_ANKLE, LM.R_ANKLE]) {
    const p = project(landmarks[idx]);
    burst(p.x, p.y, { color: S.accent, count: 14, speed: 4.5 });
  }
}

/* --------------------------------------------------------------- HUD bits */

function setCoach(text, warn = false) {
  if (!text) { ui.coach.hidden = true; return; }
  if (ui.coach.textContent !== text) ui.coach.textContent = text;
  ui.coach.classList.toggle('warn', warn);
  ui.coach.hidden = false;
}

function paintReps() {
  ui.repCount.textContent = S.reps;
  ui.repTarget.textContent = `/ ${S.target}`;
  ui.repBar.style.width = `${Math.min(100, (S.reps / Math.max(1, S.target)) * 100)}%`;
}

function bumpRepCount() {
  ui.repCount.parentElement.classList.remove('hit');
  void ui.repCount.parentElement.offsetWidth;   // restart the animation
  ui.repCount.parentElement.classList.add('hit');
}

/* ------------------------------------------------------------- frame loop */

function onFrame(landmarks, tMs, meta) {
  S.probing = !!meta?.probing;
  const calibrating = S.phase === 'countdown';
  let res = null;

  if (S.tracker && (S.phase === 'active' || calibrating)) {
    res = S.tracker.update(landmarks, tMs, calibrating);
    S.lastTracking = !!res.tracking;
    S.lastReason = res.reason || '';
    S.progress = res.progress || 0;

    if (S.phase === 'active') {
      if (S.probing) {
        setCoach('Working out which way up you are — hold still', true);
      } else if (!res.tracking) {
        setCoach(
          res.reason === 'nobody'
            ? 'I cannot see you — is your whole body in shot?'
            : 'Move back a little so your legs and feet are in frame',
          true
        );
      } else {
        setCoach(S.exercise.cue);
        if (res.repDelta > 0) countRep(landmarks);
      }
    }
  } else if (landmarks && S.tracker) {
    res = { tracking: true, progress: 0 };
  }

  drawOverlay(landmarks, res);
}

function showScorePop(points) {
  const pop = ui.scorePop;
  pop.textContent = `+${points}`;
  pop.hidden = true;
  void pop.offsetWidth;          // restart the float animation
  pop.hidden = false;
  clearTimeout(showScorePop.timer);
  showScorePop.timer = setTimeout(() => { pop.hidden = true; }, 900);
}

function countRep(landmarks) {
  S.reps += 1;
  S.score += S.points;
  ui.scoreValue.textContent = S.score;
  showScorePop(S.points);
  paintReps();
  bumpRepCount();
  repFlash(landmarks);
  const settings = store.getState().settings;
  if (settings.sound) sfx.rep(S.reps);
  vibrate(18);

  const now = performance.now();
  const remaining = S.target - S.reps;
  if (settings.voice && now - S.lastSpokeAt > 650) {
    S.lastSpokeAt = now;
    if (remaining === 0) say('Done');
    else if (remaining <= 3) say(String(S.reps));
    else say(String(S.reps), { rate: 1.35 });
  }
  if (remaining === Math.floor(S.target / 2) && S.target >= 10) {
    if (settings.sound) sfx.milestone();
  }
  if (S.reps >= S.target) finishMove('done');
}

function finishMove(outcome) {
  if (!S.resolveMove) return;
  const resolve = S.resolveMove;
  S.resolveMove = null;
  S.phase = 'idle';
  resolve(outcome);
}

/* -------------------------------------------------------------- countdown */

/**
 * Sleeps that can be cut short. Quitting or skipping must work during the
 * countdown and the rest timer, not just while reps are being counted.
 */
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
  // Every move can be in a different position (back, side, face down), so work
  // out which way the body is lying before counting anything.
  poseLoop?.probeOrientation();
  let n = 3;
  // Wall-clock deadline: on a slow phone each inference can eat hundreds of
  // milliseconds, so counting nominal sleeps would stretch this to half a minute.
  const graceUntil = Date.now() + 8000;

  while (n > 0 && !ctl.quit && !ctl.skip) {
    // Hold until the camera can actually see a body, but never past the grace —
    // except while the orientation probe is still running, which is work in
    // progress rather than a failure to find you.
    if (cameraOk && !S.lastTracking && (Date.now() < graceUntil || (S.probing && Date.now() < graceUntil + 6000))) {
      ui.countdown.textContent = '·';
      setCoach(
        S.probing ? 'Finding you…'
          : S.lastReason === 'nobody' ? 'Lie down where the camera can see you'
          : 'Shuffle back so your legs are in frame',
        true
      );
      await sleep(200);
      continue;
    }
    setCoach(cameraOk ? S.exercise.framing : 'Tracking off — tap +1 for each rep', !cameraOk);
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

/* -------------------------------------------------------------------- rest */

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
    ui.restNext.textContent = nextLabel ? `Next: ${nextLabel}` : 'Last one done';
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

/* ------------------------------------------------------------------ camera */

async function setupCamera(facing) {
  ui.loading.hidden = false;
  ui.loadingText.textContent = 'Waking up the camera…';
  await startCamera(ui.video, { facing });
  ui.loadingText.textContent = 'Loading the pose tracker (first time only)…';
  const model = await getLandmarker({ model: 'lite' });
  poseLoop = createPoseLoop(ui.video, model, onFrame);
  poseLoop.start();
  cameraOk = true;
  ui.loading.hidden = true;
}

async function flipCamera() {
  if (!cameraOk) return;
  S.facing = S.facing === 'user' ? 'environment' : 'user';
  ui.root.classList.toggle('mirrored', S.facing === 'user' && store.getState().settings.mirror);
  poseLoop?.stop();
  stopCamera(ui.video);
  try {
    await startCamera(ui.video, { facing: S.facing });
    poseLoop?.start();
  } catch (err) {
    console.warn('Could not switch camera', err);
  }
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* not critical */ }
}

function releaseWakeLock() {
  try { wakeLock?.release(); } catch { /* ignore */ }
  wakeLock = null;
}

/* ------------------------------------------------------------ main routine */

/**
 * @returns {Promise<null|{routineId, reps, targetReps, xp, seconds, perfect, perMove}>}
 *          null when the user quits before doing anything.
 */
export async function runSession(routine) {
  cacheUi();
  unlockAudio();

  const settings = store.getState().settings;
  S.facing = settings.facing || 'user';
  S.phase = 'idle';
  S.reps = 0;
  S.score = 0;
  cameraOk = false;
  clearParticles();

  ui.scoreValue.textContent = '0';
  ui.scorePop.hidden = true;
  ui.root.hidden = false;
  ui.root.setAttribute('aria-hidden', 'false');
  ui.root.classList.toggle('mirrored', S.facing === 'user' && settings.mirror);
  document.body.style.overflow = 'hidden';
  viewSize = resizeCanvas();
  const onResize = () => { viewSize = resizeCanvas(); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  requestWakeLock();

  // Shared control flags: the buttons flip these, and every phase watches them.
  const ctl = { quit: false, skip: false };
  const perMove = [];
  const startedAt = Date.now();

  ui.quitBtn.onclick = () => {
    if (S.reps > 0 || perMove.length > 0) {
      if (!confirm('End the workout? Your reps so far still count.')) return;
    }
    ctl.quit = true;
    wakeSleepers();          // cuts short a countdown or rest timer
    finishMove('quit');
  };
  ui.flipBtn.onclick = flipCamera;
  ui.manualBtn.onclick = () => {
    if (S.phase !== 'active') return;
    countRep(null);
  };
  ui.skipBtn.onclick = () => {
    if (S.phase === 'active') finishMove('skip');
    else if (S.phase === 'countdown') { ctl.skip = true; wakeSleepers(); }
  };
  ui.pauseBtn.onclick = () => {
    S.paused = !S.paused;
    ui.pauseBtn.textContent = S.paused ? 'Resume' : 'Pause';
    if (S.paused) { poseLoop?.stop(); setCoach('Paused', true); }
    else { poseLoop?.start(); setCoach(S.exercise?.cue || ''); }
  };
  ui.loadingCancel.onclick = () => { ctl.quit = true; wakeSleepers(); finishMove('quit'); };

  try {
    await setupCamera(S.facing);
  } catch (err) {
    console.warn('Camera unavailable', err);
    ui.loading.hidden = true;
    cameraOk = false;
    setCoach(
      err && /denied|not allowed|permission/i.test(err.message || '')
        ? 'Camera blocked — tap +1 to count reps by hand'
        : 'No camera available — tap +1 to count reps by hand',
      true
    );
  }

  for (let i = 0; i < routine.moves.length && !ctl.quit; i++) {
    const [exId, target] = routine.moves[i];
    const ex = EXERCISE_BY_ID[exId];
    S.exercise = ex;
    S.target = target;
    S.reps = 0;
    S.progress = 0;
    S.lastTracking = false;
    S.accent = accentFor(routine.area);
    S.tracker = cameraOk ? createExerciseTracker(ex) : null;

    S.points = repPoints(ex.id, routine.xpMultiplier || 1);
    ui.move.textContent = `${ex.emoji} ${ex.name}`;
    ui.step.textContent = `Move ${i + 1} of ${routine.moves.length} · ${POSITIONS[ex.position]?.label || ''}`;
    ui.repCue.textContent = cameraOk ? (ex.tips[0] || ex.cue) : 'Tracking off — tap +1 for each rep';
    paintReps();

    await runCountdown(ctl);
    if (ctl.quit) break;

    S.phase = 'active';
    const outcome = await new Promise((resolve) => { S.resolveMove = resolve; });

    perMove.push({ id: ex.id, name: ex.name, emoji: ex.emoji, reps: S.reps, target });

    if (outcome === 'quit') { ctl.quit = true; break; }
    if (outcome === 'done') {
      if (store.getState().settings.sound) sfx.complete();
      vibrate([40, 60, 40]);
      say(pickPraise(), { rate: 1.1 });
    }

    const isLast = i === routine.moves.length - 1;
    if (!isLast) {
      const [nextId] = routine.moves[i + 1];
      const next = EXERCISE_BY_ID[nextId];
      const rollOver = next && next.position !== ex.position;
      const label = next ? `${next.name}${rollOver ? ` — roll ${POSITIONS[next.position]?.label.toLowerCase()}` : ''}` : '';
      await runRest(outcome === 'done' ? 15 : 8, label, ctl);
    }
  }

  // Teardown
  S.phase = 'ended';
  sleepers.clear();
  poseLoop?.stop();
  poseLoop = null;
  stopCamera(ui.video);
  stopSpeaking();
  releaseWakeLock();
  clearParticles();
  window.removeEventListener('resize', onResize);
  window.removeEventListener('orientationchange', onResize);
  ui.root.hidden = true;
  ui.root.setAttribute('aria-hidden', 'true');
  ui.rest.hidden = true;
  ui.countdown.hidden = true;
  ui.coach.hidden = true;
  ui.pauseBtn.textContent = 'Pause';
  S.paused = false;
  document.body.style.overflow = '';

  const reps = perMove.reduce((n, m) => n + m.reps, 0);
  if (!perMove.length) return null;

  const targetReps = routineReps(routine);
  const multiplier = routine.xpMultiplier || 1;
  const xp = perMove.reduce((n, m) => n + store.xpForReps(m.id, m.reps, multiplier), 0);
  const perfect = perMove.length === routine.moves.length && perMove.every((m) => m.reps >= m.target);

  return {
    routineId: routine.id,
    reps,
    targetReps,
    xp,
    score: xp * POINTS_PER_XP,
    seconds: Math.round((Date.now() - startedAt) / 1000),
    perfect,
    perMove,
  };
}

const PRAISE = ['Nice.', 'Set done.', 'Easy.', 'That is one down.', 'Good work.', 'Move complete.'];
function pickPraise() { return PRAISE[(Math.random() * PRAISE.length) | 0]; }

function accentFor(areaId) {
  return {
    legs: '#7CFF6B', glutes: '#FF7BD5', core: '#FFD166',
    arms: '#6BE7FF', cardio: '#FF6B6B', full: '#B98BFF',
  }[areaId] || '#7CFF6B';
}
