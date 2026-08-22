/**
 * app.js — screens, routing and the bits that glue the game together.
 */

import {
  AREAS, AREA_BY_ID, EXERCISE_BY_ID, ROUTINE_BY_ID, ROUTINES_BY_AREA,
  POSITIONS, routineReps, routineXp, routinePositions, POINTS_PER_XP,
} from './exercises.js';
import * as store from './store.js';
import { BADGES } from './store.js';
import { runSession } from './session.js';
import { confetti, setVoice, unlockAudio, sfx } from './fx.js';
import { isSecureForCamera } from './pose.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const screen = el('screen');
let lastSummary = null;

/* ------------------------------------------------------------------- toast */

let toastTimer = 0;
export function toast(msg, ms = 2200) {
  const t = el('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/* ------------------------------------------------------------------ header */

function paintHeader() {
  const s = store.getState();
  const lvl = store.levelFor(s.xp);
  $('#levelChip').innerHTML = `Lv <b>${lvl.level}</b>`;
  $('#streakChip').innerHTML = `🔥 <b>${store.streak()}</b>`;
}

/* --------------------------------------------------------------- body map */

const MAP_REGIONS = {
  arms: `
    <g class="region" data-area="arms" style="--c:#6BE7FF" tabindex="0" role="button" aria-label="Arms and chest">
      <rect x="71" y="50" width="58" height="44" rx="16"/>
      <rect x="50" y="54" width="17" height="78" rx="8.5"/>
      <rect x="133" y="54" width="17" height="78" rx="8.5"/>
    </g>`,
  core: `
    <g class="region" data-area="core" style="--c:#FFD166" tabindex="0" role="button" aria-label="Core">
      <rect x="75" y="96" width="50" height="44" rx="13"/>
    </g>`,
  glutes: `
    <g class="region" data-area="glutes" style="--c:#FF7BD5" tabindex="0" role="button" aria-label="Glutes and hips">
      <rect x="71" y="142" width="58" height="34" rx="16"/>
    </g>`,
  legs: `
    <g class="region" data-area="legs" style="--c:#7CFF6B" tabindex="0" role="button" aria-label="Legs and calves">
      <rect x="75" y="178" width="21" height="56" rx="10"/>
      <rect x="104" y="178" width="21" height="56" rx="10"/>
      <rect x="77" y="236" width="17" height="54" rx="8"/>
      <rect x="106" y="236" width="17" height="54" rx="8"/>
      <rect x="72" y="292" width="24" height="12" rx="6"/>
      <rect x="104" y="292" width="24" height="12" rx="6"/>
    </g>`,
};

function bodyMapSvg() {
  return `
  <svg class="bodymap" viewBox="0 0 200 320" role="group" aria-label="Body map">
    <circle cx="100" cy="28" r="17" fill="#ffffff10" stroke="#ffffff22" stroke-width="1.5"/>
    <path class="figure-line" d="M100 45 v6"/>
    ${MAP_REGIONS.arms}
    ${MAP_REGIONS.core}
    ${MAP_REGIONS.glutes}
    ${MAP_REGIONS.legs}
  </svg>`;
}

/* ------------------------------------------------------------ suggestions */

/** Nudge toward the least-trained area, but keep it stable within a day. */
function suggestedRoutine() {
  const s = store.getState();
  const ranked = [...AREAS].sort(
    (a, b) => (s.areaReps[a.id] || 0) - (s.areaReps[b.id] || 0)
  );
  const area = ranked[0].id;
  const options = ROUTINES_BY_AREA(area);
  if (!options.length) return ROUTINE_BY_ID['full-standard'];
  const dayIndex = Math.floor(Date.now() / 86400000);
  return options[dayIndex % options.length];
}

/* ------------------------------------------------------------ home screen */

function positionTags(routine) {
  return routinePositions(routine)
    .map((pos) => `<span class="tag tag-pos">${POSITIONS[pos].emoji} ${esc(POSITIONS[pos].label)}</span>`)
    .join('');
}

function laznessDots(n) {
  return `<span class="dots">${[1, 2, 3, 4, 5]
    .map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`)
    .join('')}</span>`;
}

function renderHome() {
  const s = store.getState();
  const lvl = store.levelFor(s.xp);
  const today = store.todayStats();
  const pick = suggestedRoutine();
  const pickArea = AREA_BY_ID[pick.area];

  screen.innerHTML = `
    ${isSecureForCamera() ? '' : `<div class="notice">Camera tracking needs HTTPS. Open this page over https:// (or localhost) or rep counting falls back to the manual +1 button.</div>`}

    <div class="card hero-card">
      <div class="hero">
        <div class="hero-ring" style="--p:${Math.round(lvl.progress * 100)}"><b>${lvl.emoji}</b></div>
        <div class="hero-text">
          <div class="hero-title">${esc(lvl.title)}</div>
          <div class="hero-sub">Level ${lvl.level} · ${s.xp.toLocaleString()} XP${lvl.next ? ` · ${lvl.toNext} to ${esc(lvl.next.title)}` : ' · maxed out'}</div>
          <div class="xp-track"><i style="width:${Math.round(lvl.progress * 100)}%"></i></div>
        </div>
      </div>
      <div class="stat-row">
        <div class="stat"><b>${today.reps}</b><span>reps today</span></div>
        <div class="stat"><b>${store.streak()}</b><span>day streak</span></div>
        <div class="stat"><b>${today.workouts}</b><span>workouts</span></div>
      </div>
    </div>

    <div class="section-title">Today's pick</div>
    <button class="routine" data-routine="${pick.id}" style="border-color:${pickArea.color}44">
      <div class="routine-head">
        <h3>${pickArea.emoji} ${esc(pick.name)}</h3>
        ${laznessDots(pick.laziness)}
      </div>
      <div class="routine-blurb">${esc(pick.blurb)}</div>
      <div class="routine-meta">
        <span class="tag">${esc(pickArea.name)}</span>
        ${positionTags(pick)}
        <span class="tag">~${pick.minutes} min</span>
        <span class="tag tag-xp">${routineXp(pick) * POINTS_PER_XP} pts</span>
      </div>
    </button>

    <div class="section-title">Pick a target area</div>
    <p class="tiny muted" style="margin:-4px 2px 10px">Every workout in here is done lying down — on your back, your side or face down. You will not be asked to stand up.</p>
    <div class="card">
      <div class="bodymap-wrap">
        ${bodyMapSvg()}
        <div class="area-list">
          ${AREAS.map((a) => `
            <button class="area-btn" data-area="${a.id}" style="--c:${a.color}">
              <span class="emoji">${a.emoji}</span>
              <span><b>${esc(a.name)}</b><small>${esc(a.blurb)}</small></span>
              <span class="go">›</span>
            </button>`).join('')}
        </div>
      </div>
      <p class="tiny muted" style="margin-top:12px">Tap a body part, pick a routine, put the phone on the floor beside you. The camera counts the reps while you lie there.</p>
    </div>
  `;

  // Highlight the matching map region while a list row is hovered or focused.
  const regions = screen.querySelectorAll('.bodymap .region');
  const setHot = (areaId, on) => {
    regions.forEach((r) => {
      if (r.dataset.area === areaId) r.classList.toggle('is-active', on);
    });
    const btn = screen.querySelector(`.area-btn[data-area="${areaId}"]`);
    if (btn) btn.classList.toggle('is-hot', on);
  };
  screen.querySelectorAll('.area-btn').forEach((btn) => {
    const id = btn.dataset.area;
    btn.addEventListener('pointerenter', () => setHot(id, true));
    btn.addEventListener('pointerleave', () => setHot(id, false));
    btn.addEventListener('focus', () => setHot(id, true));
    btn.addEventListener('blur', () => setHot(id, false));
    btn.addEventListener('click', () => go(`#/area/${id}`));
  });
  regions.forEach((r) => {
    const id = r.dataset.area;
    r.addEventListener('pointerenter', () => setHot(id, true));
    r.addEventListener('pointerleave', () => setHot(id, false));
    r.addEventListener('click', () => go(`#/area/${id}`));
    r.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(`#/area/${id}`); }
    });
  });
  screen.querySelector('[data-routine]')?.addEventListener('click', (e) => {
    beginRoutine(e.currentTarget.dataset.routine);
  });
}

/* ------------------------------------------------------------ area screen */

function renderArea(areaId) {
  const area = AREA_BY_ID[areaId];
  if (!area) return go('#/home');
  const routines = ROUTINES_BY_AREA(areaId);
  const trained = store.getState().areaReps[areaId] || 0;

  screen.innerHTML = `
    <div class="card" style="border-color:${area.color}33">
      <div class="hero">
        <div class="hero-ring" style="--p:0;background:${area.color}22"><b>${area.emoji}</b></div>
        <div class="hero-text">
          <div class="hero-title">${esc(area.name)}</div>
          <div class="hero-sub">${esc(area.blurb)} · ${trained.toLocaleString()} lifetime reps</div>
        </div>
      </div>
    </div>

    <div class="section-title">Routines — pick your effort level</div>
    ${routines.map((r) => `
      <button class="routine" data-routine="${r.id}">
        <div class="routine-head">
          <h3>${esc(r.name)}</h3>
          ${laznessDots(r.laziness)}
        </div>
        <div class="routine-blurb">${esc(r.blurb)}</div>
        <div class="routine-meta">
          ${positionTags(r)}
          <span class="tag">~${r.minutes} min</span>
          <span class="tag">${routineReps(r)} reps</span>
          <span class="tag tag-xp">${routineXp(r) * POINTS_PER_XP} pts</span>
          ${r.xpMultiplier ? `<span class="tag tag-hot">${r.xpMultiplier}× score</span>` : ''}
        </div>
        <div style="margin-top:12px">
          ${r.moves.map(([id, reps]) => {
            const ex = EXERCISE_BY_ID[id];
            return `<div class="move-line">
              <span class="emoji">${ex.emoji}</span>
              <b>${esc(ex.name)}</b>
              <span>${reps} reps</span>
            </div>`;
          }).join('')}
        </div>
      </button>`).join('')}
  `;

  screen.querySelectorAll('[data-routine]').forEach((btn) => {
    btn.addEventListener('click', () => beginRoutine(btn.dataset.routine));
  });
}

/* ----------------------------------------------------------- stats screen */

function fmtDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h) return `${h}h ${m}m`;
  return m ? `${m}m ${s}s` : `${s}s`;
}

function renderStats() {
  const s = store.getState();
  const days = store.repsByDay(14);
  const max = Math.max(10, ...days.map((d) => d.reps));
  const todayKey = store.dayKey();
  const maxArea = Math.max(1, ...AREAS.map((a) => s.areaReps[a.id] || 0));
  const recent = [...s.sessions].reverse().slice(0, 12);

  screen.innerHTML = `
    <div class="card">
      <div class="stat-row" style="margin-top:0">
        <div class="stat"><b>${s.totalReps.toLocaleString()}</b><span>total reps</span></div>
        <div class="stat"><b>${s.sessions.length}</b><span>workouts</span></div>
        <div class="stat"><b>${fmtDuration(s.totalSeconds)}</b><span>moving</span></div>
      </div>
    </div>

    <div class="section-title">Last 14 days</div>
    <div class="card">
      <div class="chart">
        ${days.map((d) => `
          <div class="chart-col ${d.key === todayKey ? 'today' : ''}" title="${d.key}: ${d.reps} reps">
            <div class="chart-bar" style="height:${Math.round((d.reps / max) * 100)}%"></div>
            <small>${d.label}</small>
          </div>`).join('')}
      </div>
    </div>

    <div class="section-title">Area mastery</div>
    <div class="card mastery">
      ${AREAS.map((a) => {
        const reps = s.areaReps[a.id] || 0;
        return `<div class="mastery-row" style="--c:${a.color}">
          <span>${a.emoji}</span>
          <span class="mastery-track"><i style="width:${Math.round((reps / maxArea) * 100)}%"></i></span>
          <span class="tiny muted">${reps}</span>
        </div>`;
      }).join('')}
    </div>

    <div class="section-title">Badges</div>
    <div class="badge-grid">
      ${BADGES.map((b) => `
        <div class="badge ${s.badges.includes(b.id) ? 'earned' : ''}" title="${esc(b.desc)}">
          <span class="emoji">${b.emoji}</span>
          <b>${esc(b.name)}</b>
        </div>`).join('')}
    </div>

    <div class="section-title">History</div>
    <div class="card">
      ${recent.length ? recent.map((h) => {
        const r = ROUTINE_BY_ID[h.routineId];
        const a = AREA_BY_ID[h.area];
        const when = new Date(h.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return `<div class="history-row">
          <span>${a ? a.emoji : '🏋️'}</span>
          <b>${esc(r ? r.name : h.routineId)}</b>
          <span class="tiny muted">${h.reps} reps · +${h.xp} XP · ${when}</span>
        </div>`;
      }).join('') : `<div class="empty"><span class="big">🦥</span>No workouts yet. That is on brand, but let's fix it.</div>`}
    </div>
  `;
}

/* -------------------------------------------------------- settings screen */

function toggleRow(key, title, desc) {
  const on = store.getState().settings[key];
  return `<div class="setting">
    <div class="setting-text"><b>${esc(title)}</b><small>${esc(desc)}</small></div>
    <button class="switch" role="switch" aria-checked="${on}" data-toggle="${key}" aria-label="${esc(title)}"></button>
  </div>`;
}

function renderSettings() {
  const s = store.getState();
  screen.innerHTML = `
    <div class="section-title">Feedback</div>
    <div class="card">
      ${toggleRow('sound', 'Sound effects', 'Blips when a rep lands')}
      ${toggleRow('voice', 'Count out loud', 'Speaks the rep number')}
      ${toggleRow('skeleton', 'Show tracking overlay', 'Draws the skeleton on the camera')}
      ${toggleRow('mirror', 'Mirror the picture', 'Front camera looks like a mirror')}
    </div>

    <div class="section-title">Camera</div>
    <div class="card">
      <div class="setting" style="border:0">
        <div class="setting-text">
          <b>Default camera</b>
          <small>Front is easier to see, rear sees your feet better</small>
        </div>
        <button class="btn" id="facingBtn">${s.settings.facing === 'user' ? 'Front' : 'Rear'}</button>
      </div>
    </div>

    <div class="section-title">How it works</div>
    <div class="card tiny muted" style="line-height:1.6">
      <p>Pose tracking runs entirely on your device using MediaPipe. Video frames never leave your phone and nothing is uploaded — progress is stored in this browser only.</p>
      <p style="margin-top:8px">For the best rep counting: put the phone flat on the floor (or leaned against something low) about 2 metres away, side-on, so your whole body from head to feet is in shot. Keep the room reasonably lit. During the 3-2-1 countdown, lie still in the starting position — that is when the app works out which way up you are and learns your resting pose.</p>
      <p style="margin-top:8px">If tracking gets confused, the <b>+1</b> button always counts a rep manually.</p>
    </div>

    <div class="section-title">Danger zone</div>
    <div class="card">
      <button class="btn btn-danger btn-block" id="resetBtn">Erase all progress</button>
    </div>
    <p class="tiny muted" style="text-align:center;margin-top:18px">Sloth Mode · v1 · no account, no cloud, no judgement</p>
  `;

  screen.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle;
      const next = !store.getState().settings[key];
      store.setSetting(key, next);
      btn.setAttribute('aria-checked', String(next));
      if (key === 'voice') setVoice(next);
    });
  });

  el('facingBtn').addEventListener('click', (e) => {
    const next = store.getState().settings.facing === 'user' ? 'environment' : 'user';
    store.setSetting('facing', next);
    e.currentTarget.textContent = next === 'user' ? 'Front' : 'Rear';
  });

  el('resetBtn').addEventListener('click', () => {
    if (confirm('Erase every rep, badge and level? This cannot be undone.')) {
      store.resetProgress();
      paintHeader();
      toast('Progress erased. Fresh sloth.');
      go('#/home');
    }
  });
}

/* --------------------------------------------------------- summary screen */

function renderSummary() {
  if (!lastSummary) return go('#/home');
  const { result, saved } = lastSummary;
  const routine = ROUTINE_BY_ID[result.routineId];
  const area = AREA_BY_ID[routine?.area];
  const pct = result.targetReps ? Math.round((result.reps / result.targetReps) * 100) : 0;

  screen.innerHTML = `
    <div class="summary-hero">
      <span class="big">${result.perfect ? '🏆' : pct >= 60 ? '💪' : '🦥'}</span>
      <h2>${result.perfect ? 'Every single rep.' : pct >= 60 ? 'Good enough. Genuinely.' : 'Something beats nothing.'}</h2>
      <div class="summary-xp">${(result.score ?? saved.entry.xp * POINTS_PER_XP).toLocaleString()}</div>
      <div class="tiny muted" style="letter-spacing:.16em;text-transform:uppercase;margin-top:-4px">final score · +${saved.entry.xp} XP</div>
      <p class="muted">${esc(routine?.name || 'Workout')} · ${area ? esc(area.name) : ''}</p>
    </div>

    <div class="card">
      <div class="stat-row" style="margin-top:0">
        <div class="stat"><b>${result.reps}</b><span>reps done</span></div>
        <div class="stat"><b>${pct}%</b><span>of target</span></div>
        <div class="stat"><b>${fmtDuration(result.seconds)}</b><span>elapsed</span></div>
      </div>
    </div>

    ${saved.leveledUp ? `<div class="levelup">
      <div style="font-size:34px">${saved.level.emoji}</div>
      <b>Level ${saved.level.level} — ${esc(saved.level.title)}</b>
      <div class="tiny muted">New rank unlocked</div>
    </div>` : ''}

    ${saved.earned.length ? `<div class="section-title">New badges</div>
    <div class="badge-grid">
      ${saved.earned.map((b) => `<div class="badge earned"><span class="emoji">${b.emoji}</span><b>${esc(b.name)}</b></div>`).join('')}
    </div>` : ''}

    <div class="section-title">Move by move</div>
    <div class="card">
      ${result.perMove.map((m) => `
        <div class="move-line">
          <span class="emoji">${m.emoji}</span>
          <b>${esc(m.name)}</b>
          <span>${m.reps}/${m.target}${m.reps >= m.target ? ' ✅' : ''}</span>
        </div>`).join('')}
    </div>

    <div style="display:flex;gap:10px;margin-top:20px">
      <button class="btn btn-block" id="againBtn">Again</button>
      <button class="btn btn-primary btn-block" id="doneBtn">Done</button>
    </div>
  `;

  el('againBtn').addEventListener('click', () => beginRoutine(result.routineId));
  el('doneBtn').addEventListener('click', () => go('#/home'));
}

/* ----------------------------------------------------------------- router */

const ROUTES = {
  home: renderHome,
  stats: renderStats,
  settings: renderSettings,
  summary: renderSummary,
};

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function render() {
  const hash = location.hash.replace(/^#\/?/, '') || 'home';
  const [route, param] = hash.split('/');
  paintHeader();

  const isTop = ['home', 'stats', 'settings'].includes(route);
  el('backBtn').hidden = isTop;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.route === route);
  });

  if (route === 'area') renderArea(param);
  else (ROUTES[route] || renderHome)();

  screen.scrollTop = 0;
  window.scrollTo(0, 0);
}

/* ---------------------------------------------------------------- session */

async function beginRoutine(routineId) {
  const routine = ROUTINE_BY_ID[routineId];
  if (!routine) return;
  unlockAudio();          // iOS needs the gesture that started the workout
  const result = await runSession(routine);
  if (!result || result.reps === 0) {
    if (result) toast('No reps counted — nothing saved.');
    render();
    return;
  }
  const saved = store.recordSession({
    routineId: routine.id,
    area: routine.area,
    reps: result.reps,
    targetReps: result.targetReps,
    xp: result.xp,
    seconds: result.seconds,
    perfect: result.perfect,
    perMove: result.perMove.map((m) => ({ id: m.id, reps: m.reps, target: m.target })),
  });
  lastSummary = { result, saved };
  if (saved.leveledUp) sfx.levelUp();
  confetti(result.perfect ? 3200 : 2200);
  go('#/summary');
}

/* -------------------------------------------------------------------- init */

function init() {
  store.load();
  setVoice(store.getState().settings.voice);

  el('backBtn').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else go('#/home');
  });
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => go(`#/${tab.dataset.route}`));
  });
  window.addEventListener('hashchange', render);
  store.subscribe(paintHeader);

  render();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline is optional */ });
  }
}

init();
