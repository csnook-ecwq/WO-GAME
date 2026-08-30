/**
 * app.js — the shell. Boot, routing, drawers, and the two things every screen
 * shares: which profile is signed in, and which colour scheme is applied.
 */

import * as store from './store.js';
import * as screens from './screens.js';
import { icon } from './icons.js';

const el = (id) => document.getElementById(id);

const ui = {
  app: null, stage: null,
  scrim: null, left: null, right: null,
  toast: null,
};

const S = {
  profileId: null,
  lastSeen: null,
  route: 'boot',
};

/* ------------------------------------------------------------------- theme */

function applyTheme(profileId) {
  const p = profileId ? store.profile(profileId) : null;
  const root = document.documentElement;
  root.dataset.scheme = p?.scheme || 'coral';
  root.dataset.type = p?.kid ? 'kid' : 'adult';
}

function plainBackground(on) {
  document.body.dataset.plain = on ? '1' : '0';
}

/* ------------------------------------------------------------------- toast */

let toastTimer = 0;
function toast(text) {
  ui.toast.textContent = text;
  ui.toast.dataset.show = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.dataset.show = '0'; }, 2600);
}

/* ----------------------------------------------------------------- drawers */

function closeDrawers() {
  ui.scrim.dataset.open = '0';
  ui.left.dataset.open = '0';
  ui.right.dataset.open = '0';
}

function openDrawer(which) {
  ui.scrim.dataset.open = '1';
  (which === 'left' ? ui.left : ui.right).dataset.open = '1';
}

function buildLeftDrawer() {
  const p = store.profile(S.profileId);
  ui.left.replaceChildren();

  // A kid profile does not have a journal, progress or settings to reach. Not
  // locked away — simply not there.
  const items = p?.kid
    ? [['buddy', 'Customise my buddy', 'buddy']]
    : [
        ['journal', 'Journal', 'journal'],
        ['progress', 'Progress', 'progress'],
        ['buddy', 'Customise my buddy', 'buddy'],
        ['settings', 'Settings', 'settings'],
        ['help', 'Help', 'help'],
      ];

  const menu = document.createElement('nav');
  menu.className = 'menu';
  for (const [ico, label, route] of items) {
    const b = document.createElement('button');
    b.className = 'menu-item';
    const i = document.createElement('span');
    i.className = 'ico';
    i.appendChild(icon(ico));
    b.append(i, document.createTextNode(label));
    b.onclick = () => { closeDrawers(); go(route); };
    menu.appendChild(b);
  }
  ui.left.appendChild(menu);

  const foot = document.createElement('div');
  foot.className = 'menu-foot';
  const swap = document.createElement('button');
  swap.className = 'menu-item';
  const face = document.createElement('span');
  face.className = 'face';
  face.style.width = '34px';
  face.style.height = '34px';
  face.style.fontSize = '14px';
  face.textContent = (p?.name || '?').slice(0, 1).toUpperCase();
  const name = document.createElement('span');
  name.style.flex = '1';
  name.textContent = p?.name || '';
  const chev = document.createElement('span');
  chev.className = 'faint';
  chev.textContent = '›';
  swap.append(face, name, chev);
  swap.onclick = () => { closeDrawers(); signOut(); };
  foot.appendChild(swap);
  ui.left.appendChild(foot);
}

function buildRightDrawer() {
  ui.right.replaceChildren();
  const head = document.createElement('div');
  head.className = 'label';
  head.textContent = 'Lately';
  ui.right.appendChild(head);

  const list = document.createElement('div');
  list.className = 'news';
  const items = store.activity();

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'faint news-empty';
    empty.textContent = 'Nothing yet. It fills up as you use it.';
    list.appendChild(empty);
  }

  for (const a of items.slice(0, 30)) {
    const card = document.createElement('div');
    card.className = 'news-item glass card';
    const kind = document.createElement('span');
    kind.className = 'label';
    kind.textContent = a.kind === 'update' ? 'New' : 'You';
    const text = document.createElement('p');
    text.textContent = a.text;
    card.append(kind, text);
    list.appendChild(card);
  }
  ui.right.appendChild(list);
}

/* ------------------------------------------------------------------ router */

function swap(node, { plain = false } = {}) {
  const old = ui.stage.firstElementChild;
  if (old) old.dispatchEvent(new CustomEvent('screen:leave'));
  plainBackground(plain);
  ui.stage.replaceChildren(node);
}

function modeNote(id) {
  if (id === 'main') return 'nothing started yet';
  if (id === 'free') return 'nothing saved';
  const n = store.getState().friendships.length;
  return n ? `${n} friendship${n === 1 ? '' : 's'}` : 'no friendships yet';
}

function go(route) {
  S.route = route;
  closeDrawers();

  if (route === 'picker') {
    applyTheme(null);
    return swap(screens.renderPicker({
      choose: openProfile,
      add: () => go('onboard'),
    }));
  }

  if (route === 'onboard') {
    applyTheme(null);
    return swap(screens.renderOnboarding({
      done: (draft) => {
        const p = store.createProfile(draft);
        store.addActivity({ kind: 'you', text: `${p.name} joined` });
        openProfile(p.id);
      },
    }));
  }

  if (route === 'home') {
    applyTheme(S.profileId);
    buildLeftDrawer();
    buildRightDrawer();
    return swap(screens.renderHome(S.profileId, {
      openLeft: () => openDrawer('left'),
      openRight: () => openDrawer('right'),
      go: (mode) => (mode === 'main'
        ? go('framing')
        : toast(`${mode} isn’t built yet — that’s a later milestone`)),
      modeNote,
      lastSeen: S.lastSeen,
    }));
  }

  if (route === 'framing') {
    applyTheme(S.profileId);
    return swap(screens.renderFraming(S.profileId, {
      back: () => go('home'),
      ready: () => toast('Framing locked — the game itself is next'),
    }), { plain: true });
  }

  if (route === 'settings') {
    applyTheme(S.profileId);
    return swap(screens.renderSettings(S.profileId, {
      back: () => go('home'),
      toast,
      refreshChrome: buildLeftDrawer,
      setPin: (id) => go(`pin-setup:${id}`),
      exportAll: downloadExport,
    }), { plain: true });
  }

  if (route.startsWith('pin-setup:')) {
    const id = route.split(':')[1];
    applyTheme(id);
    return swap(screens.renderPinSetup(id, {
      back: () => go('settings'),
      showRecovery: (pid, code) => {
        S.recovery = { id: pid, code };
        go('recovery');
      },
    }), { plain: true });
  }

  if (route === 'recovery') {
    applyTheme(S.profileId);
    return swap(screens.renderRecovery(S.recovery.code, {
      toast,
      saveImage: saveRecoveryImage,
      done: () => {
        store.markUnlocked(S.profileId);
        toast('PIN is on');
        go('settings');
      },
    }), { plain: true });
  }

  // Everything else in the shell is a stub until its milestone.
  toast('Not built yet — coming in a later milestone');
  return go('home');
}

/* ------------------------------------------------------------ data helpers */

function downloadExport() {
  const blob = new Blob([store.exportAll()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'aureen-backup.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Saved a backup file');
}

/**
 * The recovery code as a picture for the camera roll.
 *
 * It says the app name and "recovery code" and nothing else. This image is
 * going into an album other people scroll past, so it must not advertise that
 * it unlocks a body journal.
 */
function saveRecoveryImage(code) {
  const W = 1000, H = 620;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  const grad = x.createLinearGradient(0, 0, W, H);
  const css = getComputedStyle(document.documentElement);
  grad.addColorStop(0, css.getPropertyValue('--g1').trim() || '#FFD9CF');
  grad.addColorStop(1, css.getPropertyValue('--g3').trim() || '#E8D5FF');
  x.fillStyle = grad;
  x.fillRect(0, 0, W, H);

  x.fillStyle = 'rgba(255,255,255,0.72)';
  x.beginPath();
  x.roundRect(56, 56, W - 112, H - 112, 40);
  x.fill();

  x.fillStyle = '#2E2430';
  x.textAlign = 'center';
  x.font = '300 30px -apple-system, system-ui, sans-serif';
  x.fillText('aureen', W / 2, 150);
  x.font = '600 40px -apple-system, system-ui, sans-serif';
  x.fillText('recovery code', W / 2, 208);

  const words = code.split(' ');
  x.font = '500 40px -apple-system, system-ui, sans-serif';
  words.forEach((w, i) => {
    const col = i % 3, rowN = Math.floor(i / 3);
    x.fillText(`${i + 1}. ${w}`, W / 2 + (col - 1) * 280, 330 + rowN * 90);
  });

  c.toBlob((blob) => {
    if (!blob) return toast('Could not make the image');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aureen-recovery.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Saved — put it somewhere safe');
  }, 'image/png');
}

function openProfile(id) {
  const p = store.profile(id);
  if (!p) return go('picker');

  if (p.pin && !store.isUnlocked(id)) {
    applyTheme(id);
    return swap(screens.renderPin(id, {
      cancel: () => go('picker'),
      unlocked: openProfile,
      recover: () => toast('Recovery code — coming with the journal milestone'),
    }));
  }

  S.profileId = id;
  S.lastSeen = store.touchProfile(id);
  store.setLastProfile(id);
  go('home');
}

function signOut() {
  store.lockNow();
  S.profileId = null;
  go('picker');
}

/* -------------------------------------------------------------------- boot */

async function boot() {
  Object.assign(ui, {
    app: el('app'),
    stage: el('stage'),
    scrim: el('scrim'),
    left: el('drawerLeft'),
    right: el('drawerRight'),
    toast: el('toast'),
  });

  ui.scrim.onclick = closeDrawers;

  // Belt and braces with sw.js: if the old caching worker is still registered
  // on this device, tear it down from here too. Without this, a phone that had
  // the previous build added to its home screen can keep serving files that no
  // longer exist.
  navigator.serviceWorker?.getRegistrations?.()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => { /* not supported, or nothing registered */ });

  // The launch screen shows only while something is actually loading. No
  // artificial delay — if everything is already in memory it goes straight
  // through, which is what she asked for.
  swap(screens.renderLaunch());
  store.requestPersistence();

  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 620)));

  if (!store.profiles().length) return go('onboard');
  go('picker');
}

boot();
