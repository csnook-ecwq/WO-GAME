/**
 * app.js — screens, routing and the glue.
 *
 * Everything outside a level lives here: choosing who is playing, the level map,
 * quick play, the level intro with its camera-setup card, results, and your own
 * progress. The camera only turns on inside a level.
 */

import { EXERCISE_BY_ID, VIEWS, ROUTINES, AREAS, AREA_BY_ID, ROUTINES_BY_AREA, routineReps } from './exercises.js';
import {
  LEVELS, WORLDS, LEVEL_BY_ID, levelsOfWorld, levelView, levelReps,
  isUnlocked, nextLevel, levelIndex,
} from './levels.js';
import { SKINS, SKIN_IDS } from './ghost.js';
import * as store from './store.js';
import { playLevel } from './game.js';
import { setVoice, unlockAudio, sfx } from './fx.js';
import { isSecureForCamera } from './pose.js';

const el = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const screen = el('screen');
let lastResult = null;

/* ------------------------------------------------------------------ toast */

let toastTimer = 0;
export function toast(msg, ms = 2200) {
  const t = el('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/* ------------------------------------------------------- who's playing gate */

let pendingColor = null;

function renderGate() {
  const gate = el('gate');
  const grid = el('playerGrid');
  const profiles = store.profiles();

  grid.innerHTML = profiles.map((p) => {
    const s = store.stars(p.id);
    return `<button class="player-tile" data-id="${p.id}">
      <span class="player-face" style="background:${p.color}">${esc(p.name.slice(0, 1).toUpperCase())}</span>
      <b>${esc(p.name)}</b>
      <small>${s ? `${s} ★` : 'new'}</small>
    </button>`;
  }).join('') + `<button class="player-tile add" data-add="1">
      <span class="player-face">＋</span><b>Add someone</b><small>&nbsp;</small>
    </button>`;

  grid.querySelectorAll('[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.setActive(btn.dataset.id);
      unlockAudio();
      enterApp();
    });
  });
  grid.querySelector('[data-add]').addEventListener('click', () => showNewPlayer(true));

  gate.hidden = false;
  el('app').hidden = true;
  if (!profiles.length) showNewPlayer(true);
}

function showNewPlayer(show) {
  const form = el('newPlayer');
  form.hidden = !show;
  if (!show) return;
  const used = new Set(store.profiles().map((p) => p.color));
  pendingColor = store.PLAYER_COLORS.find((c) => !used.has(c)) || store.PLAYER_COLORS[0];
  el('newColors').innerHTML = store.PLAYER_COLORS.map((c) => `
    <button type="button" class="swatch" data-color="${c}" style="background:${c}"
            aria-pressed="${c === pendingColor}" aria-label="Colour ${c}"></button>`).join('');
  el('newColors').querySelectorAll('.swatch').forEach((sw) => {
    sw.addEventListener('click', () => {
      pendingColor = sw.dataset.color;
      el('newColors').querySelectorAll('.swatch').forEach((o) => o.setAttribute('aria-pressed', String(o === sw)));
    });
  });
  el('newName').value = '';
  setTimeout(() => el('newName').focus(), 60);
}

function wireGate() {
  el('newCancel').addEventListener('click', () => {
    if (store.profiles().length) showNewPlayer(false);
  });
  el('newPlayer').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = el('newName').value.trim();
    if (!name) return;
    store.addProfile({ name, color: pendingColor, kid: el('newKid').checked });
    showNewPlayer(false);
    unlockAudio();
    enterApp();
  });
  el('whoBtn').addEventListener('click', () => {
    renderGate();
  });
}

function enterApp() {
  el('gate').hidden = true;
  el('app').hidden = false;
  paintWho();
  go('#/map');
}

function paintWho() {
  const p = store.activeProfile();
  if (!p) return;
  el('whoName').textContent = p.name;
  el('whoDot').style.background = p.color;
}

/* -------------------------------------------------------------- level map */

const starRow = (n) => `<span class="node-stars">${
  [1, 2, 3].map((i) => `<span class="${i <= n ? '' : 'off'}">★</span>`).join('')
}</span>`;

function renderMap() {
  const byLevel = store.starsByLevel();
  const suggestion = nextLevel(byLevel);
  const rank = store.rankFor(store.stars());
  const today = store.todayStats();
  const p = store.activeProfile();

  screen.innerHTML = `
    ${isSecureForCamera() ? '' : `<div class="notice">Camera tracking needs https:// — open the published link rather than a local file, or the orbs cannot see you.</div>`}

    <div class="card glass">
      <div class="hero">
        <div class="hero-ring" style="--p:${Math.round(rank.progress * 100)}"><b>${rank.emoji}</b></div>
        <div>
          <div class="hero-title">${esc(rank.title)}</div>
          <div class="hero-sub">${store.stars()} stars${rank.next ? ` · ${rank.toNext} to ${esc(rank.next.title)}` : ''}</div>
        </div>
      </div>
      <div class="stat-row">
        <div class="stat"><b>${today.reps}</b><span>reps today</span></div>
        <div class="stat"><b>${store.streak()}</b><span>day streak</span></div>
        <div class="stat"><b>${today.score.toLocaleString()}</b><span>aura today</span></div>
      </div>
    </div>

    ${WORLDS.map((world) => {
      const levels = levelsOfWorld(world.id);
      const done = levels.filter((l) => (byLevel[l.id] || 0) > 0).length;
      return `<section class="world">
        <div class="world-head">
          <h2>${esc(world.name)}</h2>
          <small>${done}/${levels.length} · ${esc(world.blurb)}</small>
        </div>
        <div class="path">
          <div class="path-line"></div>
          ${levels.map((level) => {
            const stars = byLevel[level.id] || 0;
            const open = isUnlocked(level.id, byLevel);
            const isNext = open && level.id === suggestion.id;
            const view = VIEWS[levelView(level)];
            return `<button class="node ${open ? '' : 'locked'} ${isNext ? 'next' : ''}"
                            data-level="${level.id}" ${open ? '' : 'disabled'}>
              <span class="node-orb" style="background:${world.color}">${open ? levelIndex(level.id) + 1 : '🔒'}</span>
              <span class="node-body">
                <b>${esc(level.name)}</b>
                <small>${esc(view.label)} · ${levelReps(level)} reps</small>
              </span>
              ${starRow(stars)}
            </button>`;
          }).join('')}
        </div>
      </section>`;
    }).join('')}
  `;

  screen.querySelectorAll('[data-level]').forEach((btn) => {
    btn.addEventListener('click', () => go(`#/level/${btn.dataset.level}`));
  });
}

/* ------------------------------------------------------------- level intro */

/** A little drawing of where to put the phone for each setup. */
function setupArt(view) {
  const phone = (x, y, r) => `<rect x="${x}" y="${y}" width="14" height="24" rx="3" fill="#2A2333" opacity="0.85" transform="rotate(${r} ${x + 7} ${y + 12})"/>`;
  if (view === 'prone') {
    return `<svg width="86" height="64" viewBox="0 0 86 64" aria-hidden="true">
      <path d="M12 46 q18 -12 40 -2 l16 4" stroke="#FF8FB1" stroke-width="7" fill="none" stroke-linecap="round"/>
      <circle cx="12" cy="42" r="7" fill="#FF8FB1"/>
      ${phone(4, 14, -12)}
      <path d="M18 22 q10 6 8 14" stroke="#C9B8FF" stroke-width="2" fill="none" stroke-dasharray="3 3"/>
    </svg>`;
  }
  if (view === 'propped') {
    return `<svg width="86" height="64" viewBox="0 0 86 64" aria-hidden="true">
      <path d="M22 48 h44" stroke="#7BD8C8" stroke-width="7" fill="none" stroke-linecap="round"/>
      <circle cx="22" cy="44" r="7" fill="#7BD8C8"/>
      ${phone(70, 30, 0)}
      <path d="M64 42 q-14 2 -26 4" stroke="#C9B8FF" stroke-width="2" fill="none" stroke-dasharray="3 3"/>
    </svg>`;
  }
  return `<svg width="86" height="64" viewBox="0 0 86 64" aria-hidden="true">
    <path d="M16 44 h40 l14 6" stroke="#FF8FB1" stroke-width="7" fill="none" stroke-linecap="round"/>
    <circle cx="16" cy="40" r="7" fill="#FF8FB1"/>
    ${phone(34, 8, 8)}
    <path d="M42 32 q6 6 10 10" stroke="#C9B8FF" stroke-width="2" fill="none" stroke-dasharray="3 3"/>
  </svg>`;
}

function renderLevel(levelId) {
  const level = LEVEL_BY_ID[levelId] || ROUTINE_AS_LEVEL[levelId];
  if (!level) return go('#/map');
  const view = VIEWS[levelView(level)];
  const stars = store.starsByLevel()[level.id] || 0;
  const best = store.progressOf().levels?.[level.id]?.bestScore || 0;

  screen.innerHTML = `
    <div class="intro-hero">
      <span class="big">${EXERCISE_BY_ID[level.moves[0][0]]?.emoji || '✦'}</span>
      <h2>${esc(level.name)}</h2>
      <p>${esc(level.blurb || '')}</p>
      ${stars ? `<div class="stars-big" style="font-size:22px;margin-top:8px">${
        [1, 2, 3].map((i) => `<span class="${i <= stars ? '' : 'off'}">★</span>`).join('')
      }${best ? `<span class="tiny muted" style="letter-spacing:0"> best ${best.toLocaleString()}</span>` : ''}</div>` : ''}
    </div>

    <div class="card glass" style="margin-top:12px">
      <div class="setup">
        ${setupArt(levelView(level))}
        <div>
          <b>${esc(view.label)}</b>
          <small>${esc(view.hint)}</small>
        </div>
      </div>
    </div>

    <div class="section-title">Moves</div>
    <div class="card glass">
      ${level.moves.map(([id, reps]) => {
        const ex = EXERCISE_BY_ID[id];
        return `<div class="move-line">
          <span class="emoji">${ex.emoji}</span>
          <b>${esc(ex.name)}</b>
          <span>${reps}</span>
        </div>`;
      }).join('')}
    </div>

    <div style="margin-top:18px">
      <button class="btn btn-primary btn-block" id="startBtn">Start</button>
    </div>
    <p class="tiny muted" style="text-align:center;margin-top:10px">
      Orbs appear where your ${level.moves.some(([id]) => EXERCISE_BY_ID[id].target?.joints?.some((j) => j.includes('KNEE'))) ? 'knees' : 'feet'} need to go. Pop them to score.
    </p>
  `;

  el('startBtn').addEventListener('click', () => start(level));
}

/* ------------------------------------------------------------- quick play */

/** Routines from the library, playable without unlocking anything. */
const ROUTINE_AS_LEVEL = Object.fromEntries(ROUTINES.map((r) => [r.id, {
  id: r.id, name: r.name, blurb: r.blurb, moves: r.moves, xpMultiplier: r.xpMultiplier, quick: true,
}]));

function renderFree() {
  screen.innerHTML = `
    <div class="section-title">Quick play</div>
    <p class="tiny muted" style="margin:-4px 4px 12px">Any workout, any time — no unlocking. Nothing here counts toward stars.</p>
    ${AREAS.map((area) => `
      <div class="section-title" style="margin-top:18px">${area.emoji} ${esc(area.name)}</div>
      ${ROUTINES_BY_AREA(area.id).map((r) => {
        const view = VIEWS[levelView(r)];
        return `<button class="node" data-quick="${r.id}" style="margin:6px 0">
          <span class="node-orb" style="background:${area.color}">${r.minutes}′</span>
          <span class="node-body">
            <b>${esc(r.name)}</b>
            <small>${esc(view.label)} · ${routineReps(r)} reps</small>
          </span>
        </button>`;
      }).join('')}
    `).join('')}
  `;
  screen.querySelectorAll('[data-quick]').forEach((btn) => {
    btn.addEventListener('click', () => go(`#/level/${btn.dataset.quick}`));
  });
}

/* -------------------------------------------------------------------- you */

function fmtDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m}m ${Math.round(seconds % 60)}s`;
}

function renderMe() {
  const p = store.activeProfile();
  const prog = store.progressOf();
  const days = store.repsByDay(14);
  const max = Math.max(10, ...days.map((d) => d.reps));
  const todayKey = store.dayKey();
  const s = store.getState().settings;
  const starCount = store.stars();

  screen.innerHTML = `
    <div class="card glass">
      <div class="hero">
        <div class="player-face" style="background:${p.color};width:64px;height:64px">${esc(p.name.slice(0, 1).toUpperCase())}</div>
        <div>
          <div class="hero-title">${esc(p.name)}</div>
          <div class="hero-sub">${starCount} stars · ${prog.totalReps.toLocaleString()} reps · ${fmtDuration(prog.totalSeconds)}</div>
        </div>
      </div>
    </div>

    <div class="section-title">Last 14 days</div>
    <div class="card glass">
      <div class="chart">
        ${days.map((d) => `
          <div class="chart-col ${d.key === todayKey ? 'today' : ''}" title="${d.key}: ${d.reps} reps">
            <div class="chart-bar" style="height:${Math.round((d.reps / max) * 100)}%"></div>
            <small>${d.label}</small>
          </div>`).join('')}
      </div>
    </div>

    <div class="section-title">Your aura</div>
    <div class="skin-grid">
      ${SKIN_IDS.map((id) => {
        const skin = SKINS[id];
        const unlocked = prog.unlockedSkins.includes(id);
        const active = prog.skin === id;
        return `<button class="skin ${unlocked ? '' : 'locked'}" data-skin="${id}" aria-pressed="${active}" ${unlocked ? '' : 'disabled'}>
          <span class="dot" style="background:${skinSwatch(id, p.color)}"></span>
          ${esc(skin.name)}
          <small>${unlocked ? (active ? 'wearing' : 'tap to wear') : `${skin.unlockAt} ★`}</small>
        </button>`;
      }).join('')}
    </div>

    <div class="section-title">Badges</div>
    <div class="badge-grid">
      ${store.BADGES.map((b) => `
        <div class="badge ${prog.badges.includes(b.id) ? 'earned' : ''}" title="${esc(b.desc)}">
          <span class="emoji">${b.emoji}</span><b>${esc(b.name)}</b>
        </div>`).join('')}
    </div>

    <div class="section-title">Settings</div>
    <div class="card glass">
      ${toggleRow('sound', 'Sound', 'Little pops when you hit an orb')}
      ${toggleRow('voice', 'Count out loud', 'Speaks your rep count')}
      ${toggleRow('showCamera', 'Show the room', 'Off means you only see your glowing self')}
      ${toggleRow('stats', 'Tracking numbers', 'Shows frame rate and what the camera is seeing, for working out problems')}
    </div>

    <div class="section-title">How it works</div>
    <div class="card glass tiny muted" style="line-height:1.6">
      <p>Body tracking runs entirely on your phone. No video is uploaded, and there is no server — your progress lives in this browser only.</p>
      <p style="margin-top:8px">For the best tracking: even light, no baggy blankets over your legs, and keep your hips in shot. If an orb will not pop, tap <b>+1</b> and keep going.</p>
    </div>

    <div class="section-title">Where this is saved</div>
    <div class="card glass">
      <p class="tiny muted" style="line-height:1.6">
        Your progress is saved in <b>${esc(store.storageContext().label)}</b>.
        A Safari tab and the home screen app keep separate copies and cannot see each
        other's — so if your profile looks missing, it is probably sitting in the other one.
        ${store.storageContext().standalone ? '' : 'Adding this to your home screen and using that from now on is the steadiest option.'}
      </p>
      <div class="row" style="margin-top:12px">
        <button class="btn" id="copyCodeBtn">Copy my code</button>
        <button class="btn" id="pasteCodeBtn">Paste a code</button>
      </div>
      <textarea id="codeBox" class="code-box" hidden readonly rows="3"></textarea>
      <p class="tiny muted" id="codeHint" hidden></p>
    </div>

    <div class="section-title">Danger zone</div>
    <div class="card glass">
      <button class="btn btn-ghost btn-block" id="switchBtn">Switch player</button>
      <button class="btn btn-ghost btn-block" id="resetBtn" style="color:#C2436B;margin-top:8px">Erase ${esc(p.name)}'s progress</button>
    </div>
    <p class="tiny muted" style="text-align:center;margin-top:16px">aura · v2 · no account, no cloud</p>
  `;

  screen.querySelectorAll('[data-skin]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.setSkin(btn.dataset.skin);
      renderMe();
    });
  });
  screen.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle;
      const next = !store.getState().settings[key];
      store.setSetting(key, next);
      btn.setAttribute('aria-checked', String(next));
      if (key === 'voice') setVoice(next);
    });
  });
  el('copyCodeBtn').addEventListener('click', async () => {
    const code = store.exportProfile();
    const box = el('codeBox');
    box.value = code;
    box.hidden = false;
    box.select();
    let copied = false;
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch { /* clipboard blocked — the code is on screen to copy by hand */ }
    el('codeHint').hidden = false;
    el('codeHint').textContent = copied
      ? 'Copied. Open Aura in the other place and tap Paste a code.'
      : 'Copy the code above, then open Aura in the other place and tap Paste a code.';
  });

  el('pasteCodeBtn').addEventListener('click', () => {
    const code = prompt('Paste the code from your other browser:');
    if (!code) return;
    const res = store.importProfile(code);
    if (res.ok) {
      toast(`${res.name} restored.`);
      paintWho();
      renderMe();
    } else {
      toast(res.error);
    }
  });

  el('switchBtn').addEventListener('click', renderGate);
  el('resetBtn').addEventListener('click', () => {
    if (confirm(`Erase all of ${p.name}'s stars and progress? This cannot be undone.`)) {
      store.resetProfile();
      toast('Progress erased.');
      go('#/map');
    }
  });
}

function skinSwatch(id, color) {
  return {
    glow: `linear-gradient(135deg, ${color}, #fff)`,
    rainbow: 'linear-gradient(135deg,#FF9BB8,#FFD79B,#9BE8D2,#9BB8FF)',
    sparkle: `linear-gradient(135deg, ${color}, #FFFFFF 70%)`,
    galaxy: 'linear-gradient(135deg,#2B1B5A,#5A2E8C,#1B2E6B)',
    mermaid: 'linear-gradient(135deg,#3FD8C8,#7FE9E0,#C9A7FF)',
    ice: 'linear-gradient(135deg,#EAF7FF,#6FB8F5)',
    ember: 'linear-gradient(135deg,#FFD36E,#FF5E3A)',
  }[id] || color;
}

function toggleRow(key, title, desc) {
  const on = store.getState().settings[key];
  return `<div class="setting">
    <div class="setting-text"><b>${esc(title)}</b><small>${esc(desc)}</small></div>
    <button class="switch" role="switch" aria-checked="${on}" data-toggle="${key}" aria-label="${esc(title)}"></button>
  </div>`;
}

/* ---------------------------------------------------------------- results */

function renderResults() {
  if (!lastResult) return go('#/map');
  const { result, saved, level } = lastResult;
  const nextUp = LEVEL_BY_ID[LEVELS[levelIndex(level.id) + 1]?.id];

  screen.innerHTML = `
    <div class="result-hero">
      <div class="stars-big">${[1, 2, 3].map((i) => `<span class="${i <= result.stars ? '' : 'off'}">★</span>`).join('')}</div>
      <div class="result-score">${result.score.toLocaleString()}<small>aura</small></div>
      <p class="muted">${esc(level.name)}</p>
    </div>

    <div class="card glass">
      <div class="stat-row" style="margin-top:0">
        <div class="stat"><b>${result.reps}</b><span>reps</span></div>
        <div class="stat"><b>${result.bestCombo}</b><span>best combo</span></div>
        <div class="stat"><b>${result.spawned ? Math.round((result.hits / result.spawned) * 100) : 0}%</b><span>orbs hit</span></div>
      </div>
    </div>

    ${saved.newSkins.length ? `<div class="prize">
      <div style="font-size:30px">✦</div>
      <b>New aura unlocked: ${saved.newSkins.map((s) => esc(SKINS[s].name)).join(', ')}</b>
      <div class="tiny muted">Put it on from the You tab</div>
    </div>` : ''}

    ${saved.rankUp ? `<div class="prize">
      <div style="font-size:30px">${saved.rank.emoji}</div>
      <b>${esc(saved.rank.title)}</b>
      <div class="tiny muted">New rank</div>
    </div>` : ''}

    ${saved.earned.length ? `<div class="section-title">New badges</div>
    <div class="badge-grid">
      ${saved.earned.map((b) => `<div class="badge earned"><span class="emoji">${b.emoji}</span><b>${esc(b.name)}</b></div>`).join('')}
    </div>` : ''}

    <div class="section-title">Move by move</div>
    <div class="card glass">
      ${result.perMove.map((m) => `
        <div class="move-line">
          <span class="emoji">${m.emoji}</span>
          <b>${esc(m.name)}</b>
          <span>${m.reps}/${m.target}${m.reps >= m.target ? ' ✓' : ''}</span>
        </div>`).join('')}
    </div>

    <div class="row" style="margin-top:18px">
      <button class="btn" id="againBtn">Again</button>
      <button class="btn btn-primary" id="doneBtn">${nextUp && !level.quick ? 'Next level' : 'Done'}</button>
    </div>
  `;

  el('againBtn').addEventListener('click', () => start(level));
  el('doneBtn').addEventListener('click', () => {
    if (nextUp && !level.quick) go(`#/level/${nextUp.id}`);
    else go('#/map');
  });
}

/* ------------------------------------------------------------ play a level */

async function start(level) {
  unlockAudio();
  const result = await playLevel(level, { style: store.activeStyle() });
  if (!result || result.reps === 0) {
    if (result) toast('No reps counted — nothing saved.');
    render();
    return;
  }
  // Quick-play sessions are for fun; only map levels move the star count.
  const saved = level.quick
    ? { earned: [], newSkins: [], rankUp: false, rank: store.rankFor(store.stars()), stars: store.stars() }
    : store.recordLevel(result);
  lastResult = { result, saved, level };
  if (saved.rankUp || saved.newSkins.length) sfx.levelUp();
  go('#/results');
}

/* ----------------------------------------------------------------- router */

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function render() {
  if (!store.activeProfile()) { renderGate(); return; }
  const hash = location.hash.replace(/^#\/?/, '') || 'map';
  const [route, param] = hash.split('/');
  paintWho();

  const isTop = ['map', 'free', 'me'].includes(route);
  el('backBtn').hidden = isTop;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.route === route));

  if (route === 'level') renderLevel(param);
  else if (route === 'results') renderResults();
  else if (route === 'free') renderFree();
  else if (route === 'me') renderMe();
  else renderMap();

  window.scrollTo(0, 0);
}

/* -------------------------------------------------------------------- init */

function init() {
  store.load();
  setVoice(store.getState().settings.voice);
  wireGate();

  el('backBtn').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else go('#/map');
  });
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => go(`#/${tab.dataset.route}`));
  });
  window.addEventListener('hashchange', render);

  if (store.activeProfile()) enterApp();
  else renderGate();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline is optional */ });
  }
}

init();
