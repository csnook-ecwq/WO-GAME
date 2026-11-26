/* Arrow Unwind — game. Rendering is plain Canvas 2D: flat boards draw directly, boxes are projected
   from 3D with back-face culling, so no libraries or network are needed. */
(function () {
'use strict';
const E = window.UnwindEngine;
const $ = s => document.querySelector(s);
const AX = E.AX;

/* ======================= storage ======================= */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('unwind.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('unwind.' + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
  del(k) { try { localStorage.removeItem('unwind.' + k); } catch (e) {} },
};
const DEFAULT_SETTINGS = { theme: 'auto', color: 'ink', sound: true, haptics: true, grid: true, speed: 1, countdown: true };
const settings = Object.assign({}, DEFAULT_SETTINGS, LS.get('settings', {}));
const prefs = Object.assign({ type: '2d', mode: 'relax', diff: 'easy' }, LS.get('prefs', {}));
const progress = Object.assign({ cleared: {}, best: {}, daily: {}, endlessBest: {} }, LS.get('progress', {}));
const stats = Object.assign({ solved: 0, byKey: {}, arrows: 0, mistakes: 0, hints: 0, undos: 0, ms: 0, perfect: 0, streak: 0, lastDaily: '' }, LS.get('stats', {}));
const saveSettings = () => LS.set('settings', settings), savePrefs = () => LS.set('prefs', prefs);
const saveProgress = () => LS.set('progress', progress), saveStats = () => LS.set('stats', stats);

/* ======================= theme & colours ======================= */
const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function isDark() { return settings.theme === 'dark' || (settings.theme === 'auto' && mq && mq.matches); }
function applyTheme() {
  document.documentElement.dataset.theme = isDark() ? 'dark' : 'light';
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = isDark() ? '#12151b' : '#f6f5f1';
  requestDraw();
}
if (mq && mq.addEventListener) mq.addEventListener('change', applyTheme);
const COLORS = { ink: ['#1b2540', '#e7eaf0'], black: ['#111111', '#f4f4f4'], blue: ['#1f56d8', '#7ea6ff'], teal: ['#0f766e', '#4fd1c5'], plum: ['#7b2d8b', '#d59ee6'], rainbow: null };
function arrowColor(i) {
  const c = COLORS[settings.color];
  if (!c) { const h = (i * 137.508) % 360; return isDark() ? `hsl(${h},65%,68%)` : `hsl(${h},62%,38%)`; }
  return c[isDark() ? 1 : 0];
}
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/* ======================= sound & haptics ======================= */
let AC = null;
function audio() { if (!settings.sound) return null; try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { AC = null; } return AC; }
function tone(freq, dur, type, vol, slide) {
  const a = audio(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function whoosh() {
  const a = audio(); if (!a) return; const t = a.currentTime, n = Math.floor(a.sampleRate * 0.22), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = b; f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.2); f.Q.value = 0.9;
  g.gain.value = 0.12; s.connect(f); f.connect(g); g.connect(a.destination); s.start(t);
}
const sfx = {
  remove: () => { whoosh(); tone(660, 0.09, 'sine', 0.035, 990); },
  blocked: () => tone(150, 0.16, 'triangle', 0.12, 90),
  win: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sine', 0.06), i * 90)); },
  hint: () => tone(880, 0.12, 'sine', 0.04, 1180),
};
function buzz(p) { if (settings.haptics && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} }

/* ======================= puzzle catalogue ======================= */
const MODE_HELP = {
  relax: 'Unlimited hints and undo. No timer, no hearts, no pressure.',
  classic: 'Three hearts. Tapping an arrow that is blocked costs a heart.',
  challenge: 'Timed, with moves counted and personal bests kept.',
  endless: 'A new puzzle after every clear, getting harder as you go.',
};
const DAILY_DIFF = ['expert', 'medium', 'hard', 'expert', 'hard', 'extreme', 'nightmare']; // Sun..Sat
function levelSpec(type, diff, n) {
  // 3D: the first levels are plain cubes; prisms of other proportions join in after that
  const shape = type === '2d' ? E.SHAPES_2D[(n - 1) % E.SHAPES_2D.length] : E.SOLIDS[n <= 3 ? 0 : (n - 3) % E.SOLIDS.length][0];
  return { type, diff, shape, seed: E.hashStr(`level|${type}|${diff}|${n}`), n };
}
function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dailySpec(type, date) {
  const seed = E.hashStr(`daily|${type}|${date}`); const day = new Date(date + 'T12:00:00').getDay();
  const shapes = type === '2d' ? E.SHAPES_2D.filter(s => s !== 'maze') : E.SOLIDS.map(s => s[0]);
  return { type, diff: DAILY_DIFF[day], shape: shapes[seed % shapes.length], seed, date };
}
function endlessSpec(type, startDiff, n) {
  const step = Math.min(E.DIFFS.length - 1, E.DIFFS.indexOf(startDiff) + Math.floor((n - 1) / 3));
  const seed = E.hashStr(`endless|${type}|${startDiff}|${n}|${progress.endlessSalt || 0}`);
  const shapes = type === '2d' ? E.SHAPES_2D : E.SOLIDS.map(s => s[0]);
  return { type, diff: E.DIFFS[step], shape: shapes[seed % shapes.length], seed, n };
}
const shapeName = spec => spec.type === '2d' ? E.SHAPE_NAMES[spec.shape] : (E.SOLIDS.find(s => s[0] === spec.shape) || [0, 'Cube'])[1];
const levelKey = (type, diff) => type + '-' + diff;
const clearedSet = (type, diff) => progress.cleared[levelKey(type, diff)] || {};
function highestCleared(type, diff) { let h = 0; for (const k in clearedSet(type, diff)) h = Math.max(h, +k); return h; }

/* ======================= puzzle generation (worker when possible) ======================= */
let worker = null, workerFailed = false, jobId = 0; const jobs = new Map();
function getWorker() {
  if (worker || workerFailed) return worker;
  try {
    const src = document.querySelector('script').textContent + '\nself.onmessage=function(e){try{self.postMessage({id:e.data.id,paths:UnwindEngine.pathsFor(e.data.spec)});}catch(err){self.postMessage({id:e.data.id,error:String(err)});}};';
    worker = new Worker(URL.createObjectURL(new Blob(['var window=self;\n' + src], { type: 'text/javascript' })));
    worker.onmessage = e => { const j = jobs.get(e.data.id); if (!j) return; jobs.delete(e.data.id); e.data.error ? j.reject(new Error(e.data.error)) : j.resolve(e.data.paths); };
    worker.onerror = () => { workerFailed = true; worker = null; for (const [, j] of jobs) j.fallback(); jobs.clear(); };
  } catch (e) { workerFailed = true; worker = null; }
  return worker;
}
const cache = new Map();
function generate(spec) {
  const key = JSON.stringify([spec.type, spec.diff, spec.shape, spec.seed]);
  if (cache.has(key)) return Promise.resolve(E.assemble(spec, cache.get(key)));
  return new Promise((resolve, reject) => {
    const sync = () => setTimeout(() => { try { const p = E.pathsFor(spec); cache.set(key, p); resolve(E.assemble(spec, p)); } catch (e) { reject(e); } }, 30);
    const w = getWorker(); if (!w) return sync();
    const id = ++jobId;
    jobs.set(id, { resolve: p => { cache.set(key, p); try { resolve(E.assemble(spec, p)); } catch (e) { reject(e); } }, reject, fallback: sync });
    w.postMessage({ id, spec });
  });
}

/* ======================= game state ======================= */
let G = null; // current game
const cv = $('#cv'), ctx = cv.getContext('2d');
let DPR = 1, VW = 0, VH = 0;

function geometry(P) {
  // per arrow: a track of 3D points (body, then its way out, then off into space) with arc lengths
  const surf = P.surf, flat = surf.kind === 'flat';
  const far = flat ? surf.W + surf.H + 4 : Math.max(...surf.dims) * 2 + 4;
  return P.arrows.map(a => {
    const pts = [], face = [];
    const C = id => surf.cells[id].c;
    for (let k = 0; k < a.cells.length; k++) {
      const id = a.cells[k]; pts.push(C(id).slice());
      if (k + 1 < a.cells.length) {
        const nid = a.cells[k + 1];
        if (surf.cells[nid].n !== surf.cells[id].n) { // over an edge: bend at the edge
          const c = C(id), t = AX[a.out[k]]; pts.push([c[0] + t[0] * 0.5, c[1] + t[1] * 0.5, c[2] + t[2] * 0.5]);
          face.push(surf.cells[id].face, surf.cells[nid].face);
        } else face.push(surf.cells[id].face);
      }
    }
    const bodyPts = pts.length;
    for (const r of a.ray) { pts.push(C(r).slice()); face.push(surf.cells[a.head].face); }
    const last = a.ray.length ? C(a.ray[a.ray.length - 1]) : C(a.head), t = AX[a.hd];
    const edge = [last[0] + t[0] * 0.5, last[1] + t[1] * 0.5, last[2] + t[2] * 0.5];
    pts.push(edge); face.push(surf.cells[a.head].face);
    pts.push([edge[0] + t[0] * far, edge[1] + t[1] * far, edge[2] + t[2] * far]); face.push(-1);
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    const L = cum[bodyPts - 1], exitArc = cum[pts.length - 2];
    return { pts, face, cum, L, exitArc, n: surf.cells[a.head].n, i: a.i };
  });
}

function newGame(spec, kind, mode, restore) {
  const token = {};
  G = { spec, kind, mode, P: null, token, loading: true };
  showScreen('game'); setLoading(true, spec.diff === 'impossible' || spec.diff === 'nightmare' ? 'Untangling hundreds of arrows…' : 'Untangling…');
  updateHud();
  generate(spec).then(P => {
    if (G.token !== token) return;
    const n = P.arrows.length;
    Object.assign(G, {
      P, geo: geometry(P), removed: new Uint8Array(n), occ: new Int32Array(P.surf.cells.length).fill(-1),
      history: [], hearts: 3, moves: 0, mistakes: 0, hints: 0, undos: 0, elapsed: 0, done: false, failed: false, paused: false,
      anims: new Map(), flash: new Map(), hint: null, endlessN: (restore && restore.endlessN) || spec.n || 1,
      timeLimit: mode === 'challenge' && settings.countdown ? Math.round(30 + n * (spec.type === '3d' ? 3.2 : 2.4)) : 0,
      startDiff: (restore && restore.startDiff) || spec.diff, loading: false,
    });
    P.arrows.forEach(a => a.cells.forEach(c => { G.occ[c] = a.i; }));
    // dependents: who is waiting on whom, for hints
    G.dependents = P.arrows.map(() => []); P.blockedBy.forEach((b, i) => b.forEach(j => G.dependents[j].push(i)));
    if (restore) {
      for (const i of restore.history) removeLogical(i);
      Object.assign(G, { moves: restore.moves || 0, mistakes: restore.mistakes || 0, hints: restore.hints || 0, undos: restore.undos || 0, elapsed: restore.elapsed || 0, hearts: restore.hearts ?? 3 });
    }
    fitView(); setLoading(false); updateHud(); requestDraw(); lastTick = performance.now();
    if (!restore) autosave();
    if (G.mode !== 'challenge' && !restore && G.kind !== 'endless' && P.arrows.length > 120) toast('Pinch to zoom · drag to ' + (spec.type === '3d' ? 'turn' : 'move'));
  }).catch(err => { console.error(err); setLoading(true, 'Could not build this puzzle: ' + err.message); });
}
function removeLogical(i) { G.removed[i] = 1; for (const c of G.P.arrows[i].cells) G.occ[c] = -1; G.history.push(i); }
function isFree(i) { const a = G.P.arrows[i]; for (const r of a.ray) if (G.occ[r] >= 0) return false; return true; }
function firstBlock(i) { const a = G.P.arrows[i]; for (let k = 0; k < a.ray.length; k++) if (G.occ[a.ray[k]] >= 0) return { k, j: G.occ[a.ray[k]] }; return null; }
const remaining = () => { let n = 0; for (const v of G.removed) if (!v) n++; return n; };

function attempt(i) {
  if (!G || !G.P || G.done || G.paused || G.removed[i]) return;
  if (G.anims.has(i)) return;
  G.hint = G.hint === i ? null : G.hint;
  if (isFree(i)) {
    removeLogical(i); G.moves++;
    const g = G.geo[i], end = g.exitArc + 6 + g.L;
    G.anims.set(i, { kind: 'out', t0: performance.now(), dur: (260 + end * 22) / settings.speed, end });
    sfx.remove(); buzz(8); stats.arrows++;
    if (remaining() === 0) { G.done = true; setTimeout(win, Math.min(900, (260 + end * 22) / settings.speed) + 150); }
  } else {
    const b = firstBlock(i); G.moves++; G.mistakes++; stats.mistakes++;
    G.anims.set(i, { kind: 'bump', t0: performance.now(), dur: 380 / Math.sqrt(settings.speed), reach: Math.max(0.12, b.k + 0.42) });
    G.flash.set(b.j, performance.now()); G.flash.set(i, performance.now()); G.blockLine = { i, k: b.k, t: performance.now() };
    sfx.blocked(); buzz([25, 30, 25]);
    if (G.mode === 'classic') { G.hearts--; if (G.hearts <= 0) { G.failed = true; G.done = true; setTimeout(() => fail('Out of hearts', 'That arrow was blocked. Each blocked tap costs a heart.'), 500); } }
  }
  updateHud(); autosave(); requestDraw();
}
function undo() {
  if (!G || !G.P || G.done || G.paused || !G.history.length) return;
  const i = G.history.pop(); G.removed[i] = 0; for (const c of G.P.arrows[i].cells) G.occ[c] = i;
  G.anims.delete(i); G.undos++; stats.undos++; if (G.mode === 'challenge') G.moves++;
  updateHud(); autosave(); requestDraw();
}
function hint() {
  if (!G || !G.P || G.done || G.paused) return;
  // ask the solver: of the arrows that can leave now, pick the one most others are waiting on
  const free = []; for (let i = 0; i < G.P.arrows.length; i++) if (!G.removed[i] && !G.anims.has(i) && isFree(i)) free.push(i);
  if (!free.length) return;
  let best = free[0], bv = -1;
  for (const i of free) { const v = G.dependents[i].filter(j => !G.removed[j]).length * 100 + G.P.arrows[i].cells.length; if (v > bv) { bv = v; best = i; } }
  G.hint = best; G.hintT = performance.now(); G.hints++; stats.hints++; sfx.hint();
  bringIntoView(best); updateHud(); autosave(); requestDraw();
}
function restart() {
  if (!G || !G.P) return;
  const spec = G.spec, kind = G.kind, mode = G.mode, en = G.endlessN, sd = G.startDiff;
  newGame(spec, kind, mode, { history: [], endlessN: en, startDiff: sd, hearts: 3 });
}

/* ======================= win / fail ======================= */
function fmt(ms) { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function puzzleId() { const s = G.spec; return G.kind === 'level' ? `L:${s.type}:${s.diff}:${s.n}` : G.kind === 'daily' ? `D:${s.type}:${s.date}` : `E:${s.type}:${s.seed}`; }
function win() {
  const s = G.spec; sfx.win(); buzz([10, 40, 10, 40, 30]);
  stats.solved++; stats.byKey[s.type + '-' + s.diff] = (stats.byKey[s.type + '-' + s.diff] || 0) + 1;
  if (!G.mistakes && !G.hints) stats.perfect++;
  if (G.kind === 'level') { const k = levelKey(s.type, s.diff); progress.cleared[k] = progress.cleared[k] || {}; progress.cleared[k][s.n] = 1; }
  if (G.kind === 'daily') {
    if (!progress.daily[s.date + ':' + s.type]) {
      const y = new Date(s.date + 'T12:00:00'); y.setDate(y.getDate() - 1);
      const yk = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
      if (stats.lastDaily !== s.date) { stats.streak = stats.lastDaily === yk ? stats.streak + 1 : 1; stats.lastDaily = s.date; }
    }
    progress.daily[s.date + ':' + s.type] = 1;
  }
  let record = '';
  if (G.mode === 'challenge' || G.kind !== 'endless') {
    const id = puzzleId(), prev = progress.best[id];
    const cur = { t: Math.round(G.elapsed), m: G.moves };
    if (!prev || cur.t < prev.t) { record = prev ? 'New best time!' : ''; progress.best[id] = Object.assign({}, prev, { t: cur.t }); }
    if (!prev || prev.m === undefined || cur.m < prev.m) { progress.best[id] = Object.assign(progress.best[id] || {}, { m: cur.m }); if (prev && prev.m !== undefined) record = record || 'Fewest moves yet!'; }
  }
  if (G.kind === 'endless') { const k = s.type + '-' + G.startDiff; progress.endlessBest[k] = Math.max(progress.endlessBest[k] || 0, G.endlessN); }
  saveProgress(); saveStats(); LS.del('game');
  const best = progress.best[puzzleId()];
  const grid = `<div class="statgrid"><div class="stat"><b>${fmt(G.elapsed)}</b><span>Time${best && best.t !== undefined ? ' · best ' + fmt(best.t) : ''}</span></div>
    <div class="stat"><b>${G.moves}</b><span>Moves${best && best.m !== undefined ? ' · best ' + best.m : ''}</span></div>
    <div class="stat"><b>${G.P.arrows.length}</b><span>Arrows cleared</span></div>
    <div class="stat"><b>${G.mistakes} / ${G.hints}</b><span>Blocked taps / hints</span></div></div>`;
  if (G.kind === 'endless') {
    sheet(`<h2>Cleared #${G.endlessN}</h2><p>${E.DIFF_NAMES[s.diff]} · ${shapeName(s)}. Next puzzle in a moment…</p>${grid}
      <div class="row"><button class="big ghost" data-act="menu">Stop</button><button class="big" data-act="next">Next now</button></div>`);
    G.autoNext = setTimeout(() => { if (veilOpen()) act('next'); }, 2600);
    return;
  }
  const hasNext = G.kind === 'level';
  sheet(`<h2>${G.mistakes === 0 && G.hints === 0 ? 'Flawless!' : 'Unwound!'}</h2><p>${E.DIFF_NAMES[s.diff]} · ${shapeName(s)}${record ? ' · <b style="color:var(--good)">' + record + '</b>' : ''}</p>${grid}
    <div class="row"><button class="big ghost" data-act="menu">Menu</button>${hasNext ? '<button class="big" data-act="next">Next level</button>' : '<button class="big" data-act="replay">Play again</button>'}</div>`);
}
function fail(title, text) {
  LS.del('game');
  sheet(`<h2>${title}</h2><p>${text}</p><div class="row"><button class="big ghost" data-act="menu">Menu</button><button class="big" data-act="replay">Try again</button></div>`);
}
function nextPuzzle() {
  const s = G.spec;
  if (G.kind === 'level') return newGame(levelSpec(s.type, s.diff, s.n + 1), 'level', G.mode);
  if (G.kind === 'endless') { const n = G.endlessN + 1; return newGame(endlessSpec(s.type, G.startDiff, n), 'endless', G.mode, { history: [], endlessN: n, startDiff: G.startDiff, hearts: 3 }); }
}

/* ======================= autosave ======================= */
function autosave() {
  if (!G || !G.P || G.done) return;
  LS.set('game', { spec: G.spec, kind: G.kind, mode: G.mode, history: G.history, moves: G.moves, mistakes: G.mistakes, hints: G.hints, undos: G.undos, elapsed: G.elapsed, hearts: G.hearts, endlessN: G.endlessN, startDiff: G.startDiff, left: remaining(), total: G.P.arrows.length, at: Date.now() });
}

/* ======================= view: camera, projection ======================= */
const V = { k: 1, ox: 0, oy: 0, fitK: 1, R: [1, 0, 0, 0, 1, 0, 0, 0, 1], zoom: 1, px: 0, py: 0, camD: 30, spin: null };
function resize() {
  const r = $('#stage').getBoundingClientRect(); DPR = Math.min(window.devicePixelRatio || 1, 3);
  VW = r.width; VH = r.height; cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  if (G && G.P) clampView(); requestDraw();
}
function rotM(ax, ang) { const [x, y, z] = ax, c = Math.cos(ang), s = Math.sin(ang), t = 1 - c; return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c]; }
function mul(A, B) { const C = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return C; }
function ortho(R) { // keep the rotation a rotation
  let a = [R[0], R[3], R[6]], b = [R[1], R[4], R[7]]; const n = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  a = n(a); const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; b = n([b[0] - d * a[0], b[1] - d * a[1], b[2] - d * a[2]]);
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]];
}
const is3D = () => G && G.P && G.P.surf.kind === 'box';
function fitView() {
  if (!G || !G.P) return; const s = G.P.surf;
  if (!is3D()) {
    const pad = 14; V.fitK = Math.min((VW - pad * 2) / s.W, (VH - pad * 2) / s.H); V.k = V.fitK;
    V.ox = (VW - s.W * V.k) / 2; V.oy = (VH - s.H * V.k) / 2;
  } else {
    const [X, Y, Z] = s.dims, diag = Math.hypot(X, Y, Z); V.camD = diag * 3.2;
    V.fitK = Math.min(VW, VH) * 0.86 / diag; V.zoom = 1; V.px = 0; V.py = 0;
    V.R = mul(rotM([1, 0, 0], 0.48), rotM([0, 1, 0], -0.62));
  }
  requestDraw();
}
function clampView() {
  if (!G || !G.P) return; const s = G.P.surf;
  if (!is3D()) {
    V.k = Math.max(V.fitK * 0.7, Math.min(V.k, Math.max(V.fitK * 3, 70)));
    const bw = s.W * V.k, bh = s.H * V.k, m = 60;
    // a board that fits stays centred; a bigger (zoomed) one can be dragged a little past its edges
    V.ox = bw <= VW ? (VW - bw) / 2 : Math.min(m, Math.max(VW - bw - m, V.ox));
    V.oy = bh <= VH ? (VH - bh) / 2 : Math.min(m, Math.max(VH - bh - m, V.oy));
  } else {
    V.zoom = Math.max(0.5, Math.min(4, V.zoom)); const lim = Math.max(VW, VH) * 0.6 * V.zoom;
    V.px = Math.max(-lim, Math.min(lim, V.px)); V.py = Math.max(-lim, Math.min(lim, V.py));
  }
}
let center3 = [0, 0, 0];
function project(p, out) {
  if (!is3D()) { out[0] = V.ox + p[0] * V.k; out[1] = V.oy + p[1] * V.k; out[2] = 0; return out; }
  const R = V.R, x = p[0] - center3[0], y = p[1] - center3[1], z = p[2] - center3[2];
  const qx = R[0] * x + R[1] * y + R[2] * z, qy = R[3] * x + R[4] * y + R[5] * z, qz = R[6] * x + R[7] * y + R[8] * z;
  const f = V.camD / (V.camD - qz), k = V.fitK * V.zoom * f;
  out[0] = VW / 2 + V.px + qx * k; out[1] = VH / 2 + V.py - qy * k; out[2] = qz; return out;
}
const faceZ = n => { const t = AX[n], R = V.R; return R[6] * t[0] + R[7] * t[1] + R[8] * t[2]; };
function cellPx() { return is3D() ? V.fitK * V.zoom : V.k; }

/* ======================= drawing ======================= */
let drawQueued = false;
function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(frame); } }
let lastTick = performance.now();
function frame(now) {
  drawQueued = false;
  draw(now);
  if (G && G.P && (G.anims.size || G.flash.size || G.blockLine || G.hint !== null || V.spin)) requestDraw();
}
// the game clock: runs while a puzzle is open, unpaused, unfinished and on screen
setInterval(() => {
  const now = performance.now(), dt = Math.min(1000, now - lastTick); lastTick = now;
  if (!G || !G.P || G.paused || G.done || G.loading || document.visibilityState !== 'visible') return;
  G.elapsed += dt; stats.ms += dt;
  if (G.timeLimit && G.elapsed >= G.timeLimit * 1000) { G.done = true; G.failed = true; G.elapsed = G.timeLimit * 1000; updateHud(); fail('Time is up', 'Try again, or switch the countdown off in Settings.'); return; }
  const sec = Math.floor(G.elapsed / 1000); if (sec !== G._lastSec) { G._lastSec = sec; updateHud(); if (sec % 5 === 0) { autosave(); saveStats(); } }
}, 250);
const tmpA = [0, 0, 0], tmpB = [0, 0, 0];
function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function posAt(g, s) { // 3D point and segment index at arc length s along a track
  const c = g.cum; let i = 0; while (i < c.length - 2 && c[i + 1] < s) i++;
  const t = c[i + 1] > c[i] ? Math.max(0, Math.min(1, (s - c[i]) / (c[i + 1] - c[i]))) : 0;
  return { p: lerp3(g.pts[i], g.pts[i + 1], t), i };
}
// stroke the part of a track between arc s0 and s1, skipping faces turned away from us
function traceTrack(g, s0, s1, segOut, onlyFace) {
  const c = g.cum, P = g.pts; let pen = false;
  for (let i = 0; i < P.length - 1; i++) {
    const a0 = c[i], a1 = c[i + 1]; if (a1 <= s0 || a0 >= s1) { if (a0 >= s1) break; continue; }
    const f = g.face[i]; const vis = (onlyFace === undefined || f === onlyFace) && (f < 0 || !is3D() || faceZ(G.P.surf.faces[f].n) > 0.02);
    if (!vis) { pen = false; continue; }
    const t0 = a1 > a0 ? Math.max(0, (s0 - a0) / (a1 - a0)) : 0, t1 = a1 > a0 ? Math.min(1, (s1 - a0) / (a1 - a0)) : 1;
    const A = project(t0 > 0 ? lerp3(P[i], P[i + 1], t0) : P[i], tmpA), x0 = A[0], y0 = A[1];
    const B = project(t1 < 1 ? lerp3(P[i], P[i + 1], t1) : P[i + 1], tmpB);
    if (!pen) ctx.moveTo(x0, y0); ctx.lineTo(B[0], B[1]); pen = true;
    if (segOut) segOut.push(x0, y0, B[0], B[1]);
  }
}
function headTri(g, s, onlyFace) { // arrowhead triangle at the head, lying in the face it is on
  const L = g.L + s, a = posAt(g, L - 0.08), b = posAt(g, L + 0.36), seg = b.i;
  const f = g.face[seg]; if (f >= 0 && is3D() && faceZ(G.P.surf.faces[f].n) <= 0.02) return null;
  if (onlyFace !== undefined && f !== onlyFace) return null;
  const p0 = a.p, p1 = b.p, d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], l = Math.hypot(...d) || 1;
  const T = d.map(v => v / l), N = AX[f >= 0 ? G.P.surf.faces[f].n : g.n];
  const Bv = [N[1] * T[2] - N[2] * T[1], N[2] * T[0] - N[0] * T[2], N[0] * T[1] - N[1] * T[0]], w = 0.21;
  const l1 = [p0[0] + Bv[0] * w, p0[1] + Bv[1] * w, p0[2] + Bv[2] * w], l2 = [p0[0] - Bv[0] * w, p0[1] - Bv[1] * w, p0[2] - Bv[2] * w];
  return [project(p1, [0, 0, 0]), project(l1, [0, 0, 0]), project(l2, [0, 0, 0])];
}
function lineW() { const c = cellPx(); return Math.max(1, Math.min(3.6, c * 0.085)); } // thin, crisp lines

function draw(now) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, VW, VH);
  if (!G || !G.P) return;
  const P = G.P, s = P.surf, dark = isDark(), cpx = cellPx();
  if (is3D()) { center3 = s.dims.map(v => v / 2); if (V.spin) stepSpin(now); }
  // ---- board / solid
  if (!is3D()) {
    ctx.fillStyle = dark ? 'rgba(255,255,255,.025)' : 'rgba(27,37,64,.025)';
    ctx.beginPath(); for (const c of s.cells) if (c.on) ctx.rect(V.ox + c.x * V.k, V.oy + c.y * V.k, V.k + 0.3, V.k + 0.3); ctx.fill();
    if (settings.grid && V.k > 4) { ctx.fillStyle = dark ? 'rgba(255,255,255,.26)' : 'rgba(27,37,64,.26)'; const r = Math.max(0.7, Math.min(2.2, V.k * 0.045)); ctx.beginPath(); for (const c of s.cells) if (c.on && G.occ[c.id] < 0) { const x = V.ox + (c.x + 0.5) * V.k, y = V.oy + (c.y + 0.5) * V.k; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.283); } ctx.fill(); }
  } else {
    const [X, Y, Z] = s.dims, sz = Math.hypot(X, Y, Z) * V.fitK * V.zoom;
    const gx = VW / 2 + V.px, gy = VH / 2 + V.py + sz * 0.55, grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, sz * 0.55);
    grd.addColorStop(0, dark ? 'rgba(0,0,0,.45)' : 'rgba(20,30,60,.16)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.translate(gx, gy); ctx.scale(1, 0.22); ctx.translate(-gx, -gy); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(gx, gy, sz * 0.55, 0, 6.283); ctx.fill(); ctx.restore();
    const light = [-0.35, 0.6, 0.72];
    for (const f of s.faces) {
      const z = faceZ(f.n); if (z <= 0.02) continue;
      const ax = f.n >> 1, a1 = (ax + 1) % 3, a2 = (ax + 2) % 3, v = f.n % 2 === 0 ? s.dims[ax] : 0, D = s.dims;
      const corner = (i, j) => { const p = [0, 0, 0]; p[ax] = v; p[a1] = i; p[a2] = j; return project(p, [0, 0, 0]); };
      const q = [corner(0, 0), corner(D[a1], 0), corner(D[a1], D[a2]), corner(0, D[a2])];
      const R = V.R, t = AX[f.n], nx = R[0] * t[0] + R[1] * t[1] + R[2] * t[2], ny = R[3] * t[0] + R[4] * t[1] + R[5] * t[2];
      const sh = Math.max(0, nx * light[0] + ny * light[1] + z * light[2]);
      const base = dark ? [44, 50, 62] : [255, 254, 251], lo = dark ? 0.72 : 0.86, m = lo + (1 - lo) * sh;
      ctx.fillStyle = `rgb(${base.map(c => Math.round(c * m)).join(',')})`;
      ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = dark ? 'rgba(255,255,255,.12)' : 'rgba(27,37,64,.14)'; ctx.lineWidth = 1; ctx.stroke();
      if (settings.grid) {
        ctx.beginPath(); ctx.strokeStyle = dark ? 'rgba(255,255,255,.04)' : 'rgba(27,37,64,.04)';
        for (let i = 1; i < D[a1]; i++) { const A = corner(i, 0), B = corner(i, D[a2]); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
        for (let j = 1; j < D[a2]; j++) { const A = corner(0, j), B = corner(D[a1], j); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
        ctx.stroke();
      }
    }
  }
  // ---- arrows
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const lw = lineW(), mono = !!COLORS[settings.color];
  const special = new Set(); // drawn on their own: moving, flashing, hinted
  for (const [i, a] of G.anims) { if (now - a.t0 >= a.dur) G.anims.delete(i); else special.add(i); }
  for (const [i, t] of G.flash) { if (now - t > 520) G.flash.delete(i); else special.add(i); }
  if (G.blockLine && now - G.blockLine.t > 900) G.blockLine = null;
  if (G.hint !== null && (G.removed[G.hint] || now - G.hintT > 4000)) G.hint = null;
  if (G.hint !== null) special.add(G.hint);
  G.hit = []; // projected segments for tapping
  // faces seen at a glancing angle get thinner, fainter arrows so they don't smear together
  const faceList = is3D() ? s.faces.map((f, k) => [k, faceZ(f.n)]).filter(([, z]) => z > 0.02) : [[undefined, 1]];
  const drawStatic = (list, color) => {
    const segs = new Map(list.map(i => [i, []]));
    for (const [fk, z] of faceList) {
      const w = Math.min(1, z / 0.4);
      ctx.globalAlpha = 0.35 + 0.65 * w; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw * (0.45 + 0.55 * w); ctx.beginPath();
      const heads = [];
      for (const i of list) { traceTrack(G.geo[i], 0, G.geo[i].L, segs.get(i), fk); const h = headTri(G.geo[i], 0, fk); if (h) heads.push(h); }
      ctx.stroke(); ctx.beginPath(); for (const h of heads) { ctx.moveTo(h[0][0], h[0][1]); ctx.lineTo(h[1][0], h[1][1]); ctx.lineTo(h[2][0], h[2][1]); ctx.closePath(); } ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const i of list) G.hit.push([i, segs.get(i)]);
  };
  const still = []; for (let i = 0; i < P.arrows.length; i++) if (!G.removed[i] && !special.has(i)) still.push(i);
  if (mono) drawStatic(still, arrowColor(0)); else for (const i of still) drawStatic([i], arrowColor(i));
  // a blocked tap: a thin red line along the way out, up to the arrow in the way
  if (G.blockLine && !G.removed[G.blockLine.i]) {
    const b = G.blockLine, g = G.geo[b.i], age = (now - b.t) / 900;
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age * age); ctx.strokeStyle = css('--bad'); ctx.lineWidth = Math.max(1, lw * 0.6); ctx.setLineDash([Math.max(3, lw * 2), Math.max(3, lw * 1.6)]);
    ctx.beginPath(); traceTrack(g, g.L + 0.35, g.L + b.k + 0.5); ctx.stroke(); ctx.restore();
  }
  // moving / highlighted
  for (const i of special) {
    const g = G.geo[i], a = G.anims.get(i); let s0 = 0, alpha = 1, color = arrowColor(i), w = lw;
    if (a) {
      const t = Math.min(1, (now - a.t0) / a.dur);
      if (a.kind === 'out') { const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; s0 = e * a.end; const leave = g.exitArc - g.L; alpha = s0 > leave ? Math.max(0, 1 - (s0 - leave) / 5) : 1; }
      else { s0 = Math.sin(t * Math.PI) * a.reach; color = css('--bad'); }
    }
    if (G.flash.has(i)) color = css('--bad');
    if (G.hint === i && !a) { const ph = (now - G.hintT) / 1000; color = css('--accent'); w = lw * (1.6 + 0.5 * Math.sin(ph * 6)); }
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); const seg = []; traceTrack(g, s0, s0 + g.L, seg); ctx.stroke();
    const h = headTri(g, s0); if (h) { ctx.beginPath(); ctx.moveTo(h[0][0], h[0][1]); ctx.lineTo(h[1][0], h[1][1]); ctx.lineTo(h[2][0], h[2][1]); ctx.closePath(); ctx.fill(); }
    if (!G.removed[i]) G.hit.push([i, seg]);
    ctx.globalAlpha = 1;
  }
}

/* ======================= picking ======================= */
function pick(x, y) {
  if (!G || !G.hit) return -1;
  const tol = Math.max(16, Math.min(34, cellPx() * 0.6)); let best = -1, bd = tol * tol;
  for (const [i, seg] of G.hit) {
    if (G.removed[i]) continue;
    for (let k = 0; k < seg.length; k += 4) {
      const ax = seg[k], ay = seg[k + 1], bx = seg[k + 2], by = seg[k + 3], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      const ex = ax + dx * t - x, ey = ay + dy * t - y, d = ex * ex + ey * ey;
      if (d < bd) { bd = d; best = i; }
    }
  }
  return best;
}

/* ======================= gestures ======================= */
// one finger: drag pans (2D) or turns the solid (3D); two fingers: pinch to zoom and pan.
// A tap only counts if the finger barely moved, was short, and no second finger joined in.
const ptrs = new Map(); let gest = null;
const loc = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
cv.addEventListener('pointerdown', e => {
  if (!G || !G.P) return; audio();
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  const p = loc(e); ptrs.set(e.pointerId, p); V.spin = null;
  if (ptrs.size === 1) gest = { x0: p[0], y0: p[1], t0: performance.now(), moved: false, multi: false, last: p, vx: 0, vy: 0, lt: performance.now() };
  else if (gest) { gest.multi = true; startPinch(); }
});
function startPinch() { const [a, b] = [...ptrs.values()]; gest.d0 = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; gest.m0 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; gest.k0 = V.k; gest.z0 = V.zoom; gest.ox0 = V.ox; gest.oy0 = V.oy; gest.px0 = V.px; gest.py0 = V.py; }
cv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId) || !gest) return;
  const p = loc(e); ptrs.set(e.pointerId, p);
  if (ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], r = d / gest.d0;
    if (!is3D()) { const k = Math.max(V.fitK * 0.7, Math.min(Math.max(V.fitK * 3, 70), gest.k0 * r)); const bx = (gest.m0[0] - gest.ox0) / gest.k0, by = (gest.m0[1] - gest.oy0) / gest.k0; V.k = k; V.ox = m[0] - bx * k; V.oy = m[1] - by * k; }
    else { V.zoom = gest.z0 * r; V.px = gest.px0 + (m[0] - gest.m0[0]); V.py = gest.py0 + (m[1] - gest.m0[1]); }
    clampView(); requestDraw(); return;
  }
  const dx = p[0] - gest.last[0], dy = p[1] - gest.last[1];
  if (!gest.moved && Math.hypot(p[0] - gest.x0, p[1] - gest.y0) > 9) gest.moved = true;
  if (gest.moved && !gest.multi) {
    if (!is3D()) { V.ox += dx; V.oy += dy; clampView(); }
    else { rotateBy(dx, dy); const t = performance.now(), dt = Math.max(8, t - gest.lt); gest.vx = dx / dt; gest.vy = dy / dt; gest.lt = t; }
    requestDraw();
  }
  gest.last = p;
});
function rotateBy(dx, dy) { const l = Math.hypot(dx, dy); if (!l) return; V.R = ortho(mul(rotM([dy / l, dx / l, 0], l * 0.0085), V.R)); }
function endPtr(e) {
  if (!ptrs.has(e.pointerId)) return; const p = loc(e); ptrs.delete(e.pointerId);
  if (ptrs.size === 1 && gest) { const q = [...ptrs.values()][0]; gest.last = q; return; } // one finger of a pinch lifted: carry on, never a tap
  if (ptrs.size) return;
  if (gest && e.type === 'pointerup' && !gest.moved && !gest.multi && performance.now() - gest.t0 < 600) {
    draw(performance.now()); // make sure the tap map matches what is on screen right now
    const i = pick(p[0], p[1]); if (i >= 0) attempt(i);
  } else if (gest && is3D() && gest.moved && !gest.multi && performance.now() - gest.lt < 60) {
    V.spin = { vx: gest.vx, vy: gest.vy, t: performance.now() }; requestDraw(); // a little inertia
  }
  gest = null;
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
function stepSpin(now) { const s = V.spin, dt = Math.min(40, now - s.t); s.t = now; s.vx *= Math.pow(0.94, dt / 16); s.vy *= Math.pow(0.94, dt / 16); rotateBy(s.vx * dt, s.vy * dt); if (Math.hypot(s.vx, s.vy) < 0.01) V.spin = null; }
cv.addEventListener('wheel', e => {
  if (!G || !G.P) return; e.preventDefault(); const [x, y] = loc(e), f = Math.exp(-e.deltaY * 0.0015);
  if (!is3D()) { const k = Math.max(V.fitK * 0.7, Math.min(Math.max(V.fitK * 3, 70), V.k * f)); const bx = (x - V.ox) / V.k, by = (y - V.oy) / V.k; V.k = k; V.ox = x - bx * k; V.oy = y - by * k; }
  else V.zoom *= f;
  clampView(); requestDraw();
}, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
function bringIntoView(i) {
  const g = G.geo[i];
  if (!is3D()) {
    const p = posAt(g, g.L).p, x = V.ox + p[0] * V.k, y = V.oy + p[1] * V.k, m = 24;
    if (x < m || y < m || x > VW - m || y > VH - m) { V.ox += VW / 2 - x; V.oy += VH / 2 - y; clampView(); } // only moves when zoomed in
    return;
  }
  // turn the solid so the face with the hinted arrow's head looks at us
  const t = AX[g.n], R = V.R, v = [R[0] * t[0] + R[1] * t[1] + R[2] * t[2], R[3] * t[0] + R[4] * t[1] + R[5] * t[2], R[6] * t[0] + R[7] * t[1] + R[8] * t[2]];
  if (v[2] > 0.55) return;
  const ax = [v[1] * 1 - 0, 0 - v[0] * 1, 0], l = Math.hypot(ax[0], ax[1]); const ang = Math.acos(Math.max(-1, Math.min(1, v[2]))) - 0.35;
  const axis = l > 1e-6 ? [ax[0] / l, ax[1] / l, 0] : [0, 1, 0];
  const t0 = performance.now(), R0 = V.R.slice(), dur = 450;
  (function turn() { const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, 3); V.R = ortho(mul(rotM([-axis[0], -axis[1], 0], -ang * e), R0)); requestDraw(); if (k < 1) requestAnimationFrame(turn); })();
}

/* ======================= HUD ======================= */
const HEART = c => `<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.4C.9 8 3.1 4 7 4c2.2 0 3.6 1.2 5 3 1.4-1.8 2.8-3 5-3 3.9 0 6.1 4 4.6 7.6C19.5 16.4 12 21 12 21z" fill="${c}"/></svg>`;
function updateHud() {
  if (!G) return; const s = G.spec;
  $('#gTitle').textContent = G.kind === 'level' ? `Level ${s.n}` : G.kind === 'daily' ? `Daily ${s.type === '3d' ? '3D' : '2D'}` : `Endless #${G.endlessN || 1}`;
  $('#gSub').textContent = `${E.DIFF_NAMES[s.diff]} · ${shapeName(s)} · ${({ relax: 'Relax', classic: 'Classic', challenge: 'Challenge', endless: 'Endless' })[G.mode]}`;
  if (!G.P) { $('#status').innerHTML = ''; $('#progBar').style.width = '0'; return; }
  const n = G.P.arrows.length, left = remaining(), bits = [`<span>${left} / ${n} arrows</span>`];
  if (G.mode === 'classic') bits.unshift(`<span class="hearts">${[0, 1, 2].map(k => HEART(k < G.hearts ? 'var(--bad)' : 'var(--line)')).join('')}</span>`);
  if (G.mode === 'challenge') { bits.push(`<span>${G.timeLimit ? '⏱ ' + fmt(G.timeLimit * 1000 - G.elapsed) : '⏱ ' + fmt(G.elapsed)}</span>`, `<span>${G.moves} moves</span>`); }
  $('#status').innerHTML = bits.join('');
  $('#progBar').style.width = ((n - left) / n * 100) + '%';
  $('#undoBtn').disabled = !G.history.length || G.done;
  $('#viewBtn').lastChild.textContent = is3D() ? 'Reset' : 'Fit';
  $('#gridBtn').classList.toggle('on', settings.grid);
}
function setLoading(on, text) { $('#loading').classList.toggle('on', on); if (text) $('#loadingText').textContent = text; }
let toastT; function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2200); }

/* ======================= sheets (pause, settings, stats…) ======================= */
const veil = $('#veil'), sheetEl = $('#sheet');
const veilOpen = () => veil.classList.contains('on');
function sheet(html) { sheetEl.innerHTML = html; veil.classList.add('on'); }
function closeSheet() { veil.classList.remove('on'); if (G && G.paused && !G.done) { G.paused = false; lastTick = performance.now(); requestDraw(); } }
veil.addEventListener('click', e => { if (e.target === veil && G && !G.done && !G.loading) closeSheet(); else if (e.target === veil && !G) closeSheet(); });
sheetEl.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act, b); });
function act(a, el) {
  if (G && G.autoNext) { clearTimeout(G.autoNext); G.autoNext = null; }
  if (a === 'resume' || a === 'close') return closeSheet();
  if (a === 'menu') { veil.classList.remove('on'); autosave(); G = null; showScreen('home'); return; }
  if (a === 'replay') { veil.classList.remove('on'); restart(); return; }
  if (a === 'restart') { veil.classList.remove('on'); restart(); return; }
  if (a === 'next') { veil.classList.remove('on'); nextPuzzle(); return; }
  if (a === 'settings') return openSettings();
  if (a === 'set') { const k = el.dataset.k; let v = el.dataset.v; if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(+v)) v = +v; settings[k] = v; saveSettings(); applyTheme(); requestDraw(); return openSettings(); }
  if (a === 'toggle') { const k = el.dataset.k; settings[k] = !settings[k]; saveSettings(); if (k === 'sound' && settings.sound) sfx.hint(); requestDraw(); return openSettings(); }
  if (a === 'reset') { return sheet(`<h2>Reset everything?</h2><p>Clears your levels, records, statistics and the saved game. Settings stay.</p><div class="row"><button class="big ghost" data-act="settings">Cancel</button><button class="big" style="background:var(--bad)" data-act="reset2">Reset</button></div>`); }
  if (a === 'reset2') { ['progress', 'stats', 'game'].forEach(LS.del); location.reload(); }
}
function pause() {
  if (!G || !G.P || G.done) return; G.paused = true; autosave();
  sheet(`<h2>Paused</h2><p>${E.DIFF_NAMES[G.spec.diff]} · ${shapeName(G.spec)} · ${remaining()} arrows left · ${fmt(G.elapsed)}</p>
    <button class="big" data-act="resume">Resume</button><div class="row" style="margin-top:8px"><button class="big ghost" data-act="restart">Restart</button><button class="big ghost" data-act="settings">Settings</button></div>
    <button class="big ghost" style="margin-top:8px" data-act="menu">Save &amp; quit</button>`);
}
function openSettings() {
  const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${settings[k] === v ? 'on' : ''}" data-act="set" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const sw = k => `<button class="sw ${settings[k] ? 'on' : ''}" data-act="toggle" data-k="${k}" aria-label="${k}"></button>`;
  const sws = Object.keys(COLORS).map(c => `<button class="swatch ${settings.color === c ? 'on' : ''}" data-act="set" data-k="color" data-v="${c}" aria-label="${c}" style="background:${COLORS[c] ? COLORS[c][isDark() ? 1 : 0] : 'conic-gradient(#e0453a,#f0b429,#1f9d6a,#2f6df6,#7b2d8b,#e0453a)'}"></button>`).join('');
  sheet(`<h2>Settings</h2>
    <div class="set"><span>Theme</span>${seg('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}</div>
    <div class="set"><span>Arrow colour</span><div class="swatches">${sws}</div></div>
    <div class="set"><span>Animation speed</span>${seg('speed', [[0.6, 'Slow'], [1, 'Normal'], [1.8, 'Fast']])}</div>
    <div class="set"><span>Show grid</span>${sw('grid')}</div>
    <div class="set"><span>Sound effects</span>${sw('sound')}</div>
    <div class="set"><span>Vibration<br><span class="small">Where the browser supports it (not iPhone Safari)</span></span>${sw('haptics')}</div>
    <div class="set"><span>Challenge countdown<br><span class="small">Off: Challenge just times you</span></span>${sw('countdown')}</div>
    <div class="set"><span>Reset progress</span><button class="chip" data-act="reset">Reset…</button></div>
    <button class="big" data-act="${G && G.P && !G.done ? 'resume' : 'close'}">Done</button>
    <p class="small" style="margin-top:12px">Everything is saved on this device only. No accounts, no ads.</p>`);
}
function openStats() {
  const rows = []; for (const t of ['2d', '3d']) for (const d of E.DIFFS) { const n = stats.byKey[t + '-' + d] || 0; if (n) rows.push(`<tr><td>${t.toUpperCase()} · ${E.DIFF_NAMES[d]}</td><td>${n}</td></tr>`); }
  const bests = Object.entries(progress.best).filter(([, v]) => v.t !== undefined).sort((a, b) => b[1].t - a[1].t).slice(0, 8)
    .map(([k, v]) => { const p = k.split(':'); return `<tr><td>${p[0] === 'L' ? `Level ${p[3]} · ${p[1].toUpperCase()} ${E.DIFF_NAMES[p[2]]}` : p[0] === 'D' ? `Daily ${p[1].toUpperCase()} ${p[2]}` : 'Endless'}</td><td>${fmt(v.t)}${v.m !== undefined ? ' · ' + v.m + ' moves' : ''}</td></tr>`; }).join('');
  sheet(`<h2>Statistics</h2>
    <div class="statgrid"><div class="stat"><b>${stats.solved}</b><span>Puzzles solved</span></div><div class="stat"><b>${stats.arrows}</b><span>Arrows unwound</span></div>
    <div class="stat"><b>${stats.perfect}</b><span>Flawless clears</span></div><div class="stat"><b>${stats.streak}</b><span>Daily streak</span></div>
    <div class="stat"><b>${stats.mistakes}</b><span>Blocked taps</span></div><div class="stat"><b>${stats.hints}</b><span>Hints used</span></div>
    <div class="stat"><b>${fmt(stats.ms)}</b><span>Time played</span></div><div class="stat"><b>${Math.max(0, ...Object.values(progress.endlessBest))}</b><span>Longest endless run</span></div></div>
    ${rows.length ? `<div class="label">Solved by difficulty</div><table class="recs">${rows.join('')}</table>` : ''}
    ${bests ? `<div class="label" style="margin-top:14px">Personal bests</div><table class="recs">${bests}</table>` : ''}
    <button class="big" style="margin-top:14px" data-act="close">Close</button>`);
}

/* ======================= home screen ======================= */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  if (id === 'game') requestAnimationFrame(() => { resize(); fitView(); });
  if (id === 'home') renderHome();
}
let levelPages = 1;
function renderHome() {
  const seg = (el, k) => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === prefs[k]));
  seg($('#typeSeg'), 'type'); seg($('#modeSeg'), 'mode');
  $('#modeHelp').textContent = MODE_HELP[prefs.mode];
  $('#diffChips').innerHTML = E.DIFFS.map(d => { const n = Object.keys(clearedSet(prefs.type, d)).length; return `<button class="chip ${prefs.diff === d ? 'on' : ''}" data-d="${d}">${E.DIFF_NAMES[d]}${n ? `<small>${n}</small>` : ''}</button>`; }).join('');
  const la = $('#levelArea');
  if (prefs.mode === 'endless') {
    const b = progress.endlessBest[prefs.type + '-' + prefs.diff] || 0;
    la.innerHTML = `<button class="big" id="endlessGo">Start endless from ${E.DIFF_NAMES[prefs.diff]}</button><div class="small" style="margin-top:8px">Gets harder every three puzzles.${b ? ' Your longest run here: ' + b + '.' : ''}</div>`;
    $('#endlessGo').onclick = () => { progress.endlessSalt = (progress.endlessSalt || 0) + 1; saveProgress(); newGame(endlessSpec(prefs.type, prefs.diff, 1), 'endless', 'endless', { history: [], endlessN: 1, startDiff: prefs.diff, hearts: 3 }); };
  } else {
    const hi = highestCleared(prefs.type, prefs.diff), done = clearedSet(prefs.type, prefs.diff), shown = Math.max(18, Math.ceil((hi + 2) / 6) * 6) * levelPages;
    let html = `<div class="lvhead"><div class="label" style="margin:0">Levels</div><span>${Object.keys(done).length} cleared</span></div><div class="levels">`;
    for (let n = 1; n <= shown; n++) html += `<button class="lv ${done[n] ? 'done' : ''}" data-n="${n}" ${n > hi + 1 ? 'disabled' : ''}>${n}</button>`;
    html += `</div><button class="more" id="moreLv">Show more levels</button>`;
    la.innerHTML = html;
    la.querySelectorAll('.lv').forEach(b => b.onclick = () => newGame(levelSpec(prefs.type, prefs.diff, +b.dataset.n), 'level', prefs.mode));
    $('#moreLv').onclick = () => { levelPages++; renderHome(); };
  }
  const d = today(); const D = t => { const sp = dailySpec(t, d), ok = progress.daily[d + ':' + t]; return `<button data-t="${t}">${ok ? '<span class="ok">✓</span>' : ''}<b>${t === '2d' ? '2D' : '3D'} · ${shapeName(sp)}</b><span>${E.DIFF_NAMES[sp.diff]} · ${d}</span></button>`; };
  $('#dailyBox').innerHTML = D('2d') + D('3d');
  $('#dailyBox').querySelectorAll('button').forEach(b => b.onclick = () => newGame(dailySpec(b.dataset.t, d), 'daily', prefs.mode === 'endless' ? 'relax' : prefs.mode));
  const sg = LS.get('game', null);
  $('#continueCard').classList.toggle('on', !!sg);
  if (sg) $('#continueInfo').textContent = `${sg.kind === 'level' ? 'Level ' + sg.spec.n : sg.kind === 'daily' ? 'Daily ' + sg.spec.date : 'Endless #' + sg.endlessN} · ${sg.spec.type.toUpperCase()} ${E.DIFF_NAMES[sg.spec.diff]} · ${sg.left} of ${sg.total} arrows left`;
}
$('#typeSeg').onclick = e => { const b = e.target.closest('button'); if (b) { prefs.type = b.dataset.v; levelPages = 1; savePrefs(); renderHome(); } };
$('#modeSeg').onclick = e => { const b = e.target.closest('button'); if (b) { prefs.mode = b.dataset.v; savePrefs(); renderHome(); } };
$('#diffChips').onclick = e => { const b = e.target.closest('.chip'); if (b) { prefs.diff = b.dataset.d; levelPages = 1; savePrefs(); renderHome(); } };
$('#continueBtn').onclick = () => { const sg = LS.get('game', null); if (sg) newGame(sg.spec, sg.kind, sg.mode, sg); };
$('#openSettings').onclick = openSettings; $('#openStats').onclick = openStats;

/* ======================= game buttons ======================= */
$('#backBtn').onclick = () => { if (G && G.P && !G.done) autosave(); if (G && G.autoNext) clearTimeout(G.autoNext); G = null; showScreen('home'); };
$('#pauseBtn').onclick = pause;
$('#undoBtn').onclick = undo;
$('#hintBtn').onclick = hint;
$('#restartBtn').onclick = () => { if (G && G.P) { if (G.history.length && !G.done) sheet(`<h2>Restart this puzzle?</h2><p>All ${G.P.arrows.length} arrows come back.</p><div class="row"><button class="big ghost" data-act="close">Cancel</button><button class="big" data-act="restart">Restart</button></div>`); else restart(); } };
$('#viewBtn').onclick = () => { V.spin = null; fitView(); };
$('#gridBtn').onclick = () => { settings.grid = !settings.grid; saveSettings(); $('#gridBtn').classList.toggle('on', settings.grid); requestDraw(); };
window.addEventListener('resize', () => { resize(); if (G && G.P) { clampView(); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { autosave(); } else { lastTick = performance.now(); } });
window.addEventListener('keydown', e => {
  if (!G || !G.P) return;
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
  else if (e.key === 'h') hint(); else if (e.key === 'Escape') (veilOpen() ? closeSheet() : pause());
});

/* test hook (used by the automated browser tests; harmless otherwise) */
window.__unwind = { get G() { return G; }, V, project, pick, attempt, hint, undo, draw, E };

applyTheme(); resize(); renderHome();
})();
