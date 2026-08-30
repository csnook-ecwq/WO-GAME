/**
 * screens.js — the shell's screens, in the order you meet them.
 *
 * Every render function returns an element and, where it needs one, wires its
 * own handlers. The router in app.js owns which one is on screen.
 */

import * as store from './store.js';
import { createBuddy, greeting, auraEnergy, SKINS } from './buddy.js';
import { pickAffirmation } from './affirmations.js';
import { zoneFor, pickPlayer, isReady } from './zone.js';
import { createCamera, FAILURES } from './pose.js';

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

const initials = (name) => name.trim().slice(0, 1).toUpperCase() || '?';

/** A profile's face: their photo if they have one, their initial if not. */
function faceEl(p, size) {
  const el = h('div', 'face');
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.fontSize = `${Math.round(size * 0.36)}px`;
  if (p?.photo) {
    const img = h('img');
    img.src = p.photo;
    img.alt = '';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    el.appendChild(img);
  } else {
    el.textContent = initials(p?.name || '');
  }
  return el;
}

/* ------------------------------------------------------------ launch screen */

export function renderLaunch() {
  const s = h('section', 'screen launch');
  const wrap = h('div', 'launch-inner');

  // The wordmark: "aureen" with a bubble centred behind it and the aura behind
  // that. The creature draws the bubble and the aura for free, so the logo and
  // the character are literally the same asset.
  const mark = h('div', 'wordmark');
  const canvas = h('canvas', 'wordmark-aura');
  const word = h('div', 'wordmark-word', 'aureen');
  mark.append(canvas, word);

  const by = h('div', 'launch-by', 'by Reyn Cheyn');
  wrap.append(mark, by);
  s.appendChild(wrap);

  const buddy = createBuddy(canvas, { face: 'content', energy: 1, logo: true });
  requestAnimationFrame(() => buddy.start());
  s.addEventListener('screen:leave', () => buddy.stop());
  return s;
}

/* ----------------------------------------------------------- profile picker */

export function renderPicker(ctl) {
  const s = h('section', 'screen picker');
  s.append(h('h1', 'title center picker-title', 'Who’s playing?'));

  const row = h('div', 'picker-row');
  for (const p of store.profiles()) {
    const btn = h('button', 'picker-item rise');
    // Each circle previews that person's own colour scheme, so the picker
    // looks like the people on it rather than like one theme repeated.
    const ring = h('div', 'picker-ring');
    ring.dataset.scheme = p.scheme || 'coral';
    ring.appendChild(faceEl(p, 84));
    if (p.pin) {
      const lock = h('span', 'picker-lock', '􀎠');
      lock.textContent = '🔒';
      ring.appendChild(lock);
    }
    btn.append(ring, h('span', 'picker-name', p.name));
    btn.onclick = () => ctl.choose(p.id);
    row.appendChild(btn);
  }

  const add = h('button', 'picker-item rise');
  const addRing = h('div', 'picker-ring picker-add');
  addRing.appendChild(h('span', 'picker-plus', '+'));
  add.append(addRing, h('span', 'picker-name faint', 'Add'));
  add.onclick = () => ctl.add();
  row.appendChild(add);

  s.appendChild(row);
  return s;
}

/* ------------------------------------------------------------------ PIN pad */

export function renderPin(profileId, ctl) {
  const p = store.profile(profileId);
  const s = h('section', 'screen pin');

  const back = h('button', 'icon-btn pin-back', '‹');
  back.setAttribute('aria-label', 'Back');
  back.onclick = () => ctl.cancel();
  s.appendChild(back);

  const inner = h('div', 'pin-inner');
  inner.appendChild(faceEl(p, 64));
  inner.appendChild(h('div', 'pin-name soft', p.name));

  const dots = h('div', 'pin-dots');
  for (let i = 0; i < 4; i++) dots.appendChild(h('i'));
  inner.appendChild(dots);

  const hint = h('p', 'pin-hint faint', 'Enter your PIN');
  inner.appendChild(hint);

  let entry = '';
  let wrong = 0;

  const paint = () => {
    [...dots.children].forEach((d, i) => {
      d.dataset.on = i < entry.length ? '1' : '0';
    });
  };

  const submit = async () => {
    const ok = await store.checkPin(profileId, entry);
    if (ok) return ctl.unlocked(profileId);
    wrong += 1;
    entry = '';
    paint();
    dots.classList.remove('shake');
    void dots.offsetWidth;
    dots.classList.add('shake');
    navigator.vibrate?.(60);
    // Three wrong tries bounces back to the picker, so a small person mashing
    // buttons gets herself out without needing to be rescued.
    if (wrong >= 3) return ctl.cancel();
    hint.textContent = `Not quite — ${3 - wrong} ${3 - wrong === 1 ? 'try' : 'tries'} left`;
  };

  const pad = h('div', 'pin-pad');
  for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']) {
    if (!key) { pad.appendChild(h('span')); continue; }
    const b = h('button', 'pin-key glass', key);
    b.onclick = () => {
      navigator.vibrate?.(8);
      if (key === '⌫') entry = entry.slice(0, -1);
      else if (entry.length < 4) entry += key;
      paint();
      if (entry.length === 4) setTimeout(submit, 120);
    };
    pad.appendChild(b);
  }
  inner.appendChild(pad);

  const forgot = h('button', 'btn btn-quiet pin-forgot', 'Forgot your PIN?');
  forgot.onclick = () => ctl.recover(profileId);
  inner.appendChild(forgot);

  s.appendChild(inner);
  paint();
  return s;
}

/* -------------------------------------------------------------- home screen */

const MODES = [
  { id: 'main', name: 'Main game', hue: 'a' },
  { id: 'free', name: 'Freestyle', hue: 'b' },
  { id: 'family', name: 'Family', hue: 'c' },
];

export function renderHome(profileId, ctl) {
  const p = store.profile(profileId);
  const s = h('section', 'screen home');

  const top = h('div', 'home-top');
  const menuBtn = h('button', 'icon-btn', '☰');
  menuBtn.setAttribute('aria-label', 'Menu');
  menuBtn.onclick = () => ctl.openLeft();
  const newsBtn = h('button', 'icon-btn', '❯');
  newsBtn.setAttribute('aria-label', 'Updates');
  newsBtn.onclick = () => ctl.openRight();
  top.append(menuBtn, newsBtn);
  s.appendChild(top);

  const previous = ctl.lastSeen;
  const g = greeting(previous);
  const line = pickAffirmation({ kid: p.kid, gap: g.gap, streak: p.streak || 0 });
  s.appendChild(h('p', 'affirmation rise rise-1', line));

  const stage = h('div', 'home-buddy');
  const canvas = h('canvas');
  stage.appendChild(canvas);
  s.appendChild(stage);

  // The aura is the only thing on this screen that comments on how she's doing,
  // and it does it without a number: bright if she moved today, dim after a gap.
  const dots = store.weekDots(profileId);
  const today = (new Date().getDay() + 6) % 7;
  const buddy = createBuddy(canvas, {
    face: g.face,
    energy: auraEnergy(dots, today),
    bodyColor: p.skin,
  });
  requestAnimationFrame(() => {
    buddy.start();
    buddy.play(g.anim);
  });
  s.addEventListener('screen:leave', () => buddy.stop());
  // A tap is a poke — pure impulse, so tapping repeatedly wobbles her more
  // rather than restarting an animation each time.
  stage.onpointerdown = () => {
    buddy.poke();
    if (Math.random() < 0.25) buddy.playRandom();
  };

  // One baseline: streak, this week, suds. Small-caps label type throughout, so
  // it reads as a quiet status line rather than three competing weights.
  //
  // Streaks are adults only. A streak punishes a four-year-old for a week her
  // mother didn't have time for — her showing up isn't in her control, so it
  // isn't something she gets to fail at. Suds she earns herself, so she keeps
  // those.
  const status = h('div', 'status rise rise-2');

  if (!p.kid) {
    const n = p.streak || 0;
    status.appendChild(h('span', 'status-item', n === 1 ? '1 day' : `${n} days`));

    const week = h('div', 'week-dots');
    dots.forEach((v) => {
      const d = h('i');
      if (v > 0) d.style.opacity = String(0.45 + v * 0.55);
      d.dataset.on = v > 0 ? '1' : '0';
      week.appendChild(d);
    });
    status.appendChild(week);
  }

  const sudsEl = h('span', 'status-item status-suds');
  sudsEl.append(h('b', null, String(store.suds(profileId))), h('span', null, 'suds'));
  status.appendChild(sudsEl);

  s.appendChild(status);

  // mode cards
  const modes = h('div', 'modes rise rise-3');
  const visible = p.kid ? MODES.filter((m) => m.id !== 'main') : MODES;
  for (const m of visible) {
    const card = h('button', `mode mode-${m.hue}`);
    card.append(
      h('span', 'mode-name', m.name),
      h('span', 'mode-note', ctl.modeNote(m.id))
    );
    card.onclick = () => ctl.go(m.id);
    modes.appendChild(card);
  }
  s.appendChild(modes);

  return s;
}

/* ----------------------------------------------------------------- settings */

function section(title) {
  const wrap = h('section', 'set-section');
  wrap.appendChild(h('div', 'label', title));
  const box = h('div', 'set-box glass card');
  wrap.appendChild(box);
  return { wrap, box };
}

function row(label, control) {
  const r = h('div', 'set-row');
  r.append(h('span', 'set-label', label));
  if (control) r.appendChild(control);
  return r;
}

function toggle(on, onChange) {
  const b = h('button', 'switch');
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-checked', String(on));
  b.appendChild(h('i'));
  b.onclick = () => {
    const next = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(next));
    onChange(next);
  };
  return b;
}

export function renderSettings(profileId, ctl) {
  const p = store.profile(profileId);
  const s = h('section', 'screen set');

  const head = h('div', 'set-head');
  const back = h('button', 'icon-btn', '‹');
  back.setAttribute('aria-label', 'Back');
  back.onclick = () => ctl.back();
  head.append(back, h('h1', 'title', 'Settings'));
  s.appendChild(head);

  const scroll = h('div', 'scroll set-scroll');

  /* --- profile */
  const prof = section('Profile');
  const nameInput = h('input');
  nameInput.type = 'text';
  nameInput.maxLength = 18;
  nameInput.value = p.name;
  nameInput.className = 'set-input';
  nameInput.onchange = () => {
    store.updateProfile(profileId, { name: nameInput.value.trim() || p.name });
    ctl.refreshChrome();
  };
  prof.box.append(row('Name', nameInput));

  const schemeRow = h('div', 'set-schemes');
  for (const sc of store.SCHEMES) {
    const b = h('button', 'scheme-dot');
    b.dataset.scheme = sc.id;
    b.title = sc.name;
    b.setAttribute('aria-selected', String(p.scheme === sc.id));
    b.onclick = () => {
      // Recolours the whole screen the instant you tap it — you judge the real
      // thing, not a stamp-sized preview.
      store.updateProfile(profileId, { scheme: sc.id });
      document.documentElement.dataset.scheme = sc.id;
      [...schemeRow.children].forEach((c) =>
        c.setAttribute('aria-selected', String(c.dataset.scheme === sc.id)));
    };
    schemeRow.appendChild(b);
  }
  prof.box.append(row('Colour', null), schemeRow);
  scroll.appendChild(prof.wrap);

  /* --- security. Kid profiles have none: nothing of theirs needs protecting,
     and it removes the one lockout nobody can undo. */
  if (!p.kid) {
    const sec = section('Security');
    sec.box.appendChild(row('PIN', toggle(!!p.pin, (on) => {
      if (on) ctl.setPin(profileId);
      else { store.clearPin(profileId); ctl.toast('PIN turned off'); }
    })));
    if (p.pin) {
      const change = h('button', 'btn btn-quiet set-link', 'Change PIN');
      change.onclick = () => ctl.setPin(profileId);
      sec.box.appendChild(change);
    }
    scroll.appendChild(sec.wrap);
  }

  /* --- audio and visual */
  const av = section('Audio & visual');
  av.box.appendChild(row('Sounds', toggle(p.settings.sound, (on) => {
    p.settings.sound = on;
    store.updateProfile(profileId, { settings: p.settings });
  })));
  av.box.appendChild(row('Vibration', toggle(p.settings.haptics, (on) => {
    p.settings.haptics = on;
    store.updateProfile(profileId, { settings: p.settings });
  })));

  const slider = h('input');
  slider.type = 'range';
  slider.min = '35';
  slider.max = '75';
  slider.value = String(Math.round(p.settings.auraOpacity * 100));
  slider.className = 'set-range';
  slider.oninput = () => {
    p.settings.auraOpacity = Number(slider.value) / 100;
    store.updateProfile(profileId, { settings: p.settings });
  };
  av.box.appendChild(row('Aura', slider));
  scroll.appendChild(av.wrap);

  /* --- your buddy: naming lives here, and is never forced at setup */
  const bud = section('Your buddy');
  const nameRow = h('div', 'buddy-name-row');
  const nameField = h('input');
  nameField.type = 'text';
  nameField.maxLength = 14;
  nameField.className = 'set-input buddy-name-input';
  nameField.placeholder = 'not named yet';
  nameField.value = p.buddyName || '';
  nameField.onchange = () => {
    store.updateProfile(profileId, { buddyName: nameField.value.trim() || null });
  };
  const roll = h('button', 'btn btn-glass roll-btn', 'Roll one');
  roll.onclick = () => {
    nameField.value = store.rollBuddyName();
    store.updateProfile(profileId, { buddyName: nameField.value });
  };
  nameRow.append(nameField, roll);
  bud.box.append(row('Name', null), nameRow);

  // Colour, with her standing right there. Same principle as the scheme dots:
  // tapping changes the real creature, not a stamp-sized preview of one.
  const skinRow = h('div', 'buddy-skins');
  const preview = h('canvas', 'buddy-preview');
  const previewBuddy = createBuddy(preview, {
    face: 'content', aura: false, bodyColor: p.skin || 'pink',
  });
  requestAnimationFrame(() => previewBuddy.start());
  s.addEventListener('screen:leave', () => previewBuddy.stop());

  const swatches = h('div', 'skin-dots');
  for (const sk of SKINS) {
    const b = h('button', 'skin-dot');
    b.title = sk.name;
    b.setAttribute('aria-label', sk.name);
    b.setAttribute('aria-selected', String((p.skin || 'pearl') === sk.id));
    // Built from the skin's own wash and a mid band, so a new colourway needs no
    // matching stylesheet entry — it just appears. Wash rather than bands alone,
    // or peach comes out pink: its band sweep passes through magenta.
    b.style.background =
      `radial-gradient(circle at 34% 28%, rgba(255,255,255,0.94), ` +
      `${sk.bands[2]} 52%, var(--bubble-${sk.id}) 100%)`;
    b.onclick = () => {
      store.updateProfile(profileId, { skin: sk.id });
      previewBuddy.setSkin(sk.id);
      previewBuddy.poke();
      [...swatches.children].forEach((c) =>
        c.setAttribute('aria-selected', String(c.title === sk.name)));
    };
    swatches.appendChild(b);
  }
  skinRow.append(preview, swatches);
  bud.box.append(row('Colour', null), skinRow);

  bud.box.appendChild(h('p', 'set-note faint',
    `Your avatar is always ${store.avatarName(p.name)}.`));
  scroll.appendChild(bud.wrap);

  /* --- data */
  const data = section('Your data');
  const note = h('p', 'set-note faint',
    'Everything stays on this phone. Nothing is uploaded, and there is no account.');
  data.box.appendChild(note);
  const exportBtn = h('button', 'btn btn-glass btn-wide', 'Export everything');
  exportBtn.onclick = () => ctl.exportAll();
  data.box.appendChild(exportBtn);
  scroll.appendChild(data.wrap);

  /* --- about */
  const about = section('About');
  about.box.append(
    row('aureen', h('span', 'faint', 'prototype')),
    row('Made by', h('span', 'faint', 'Reyn Cheyn Inc.'))
  );
  scroll.appendChild(about.wrap);

  s.appendChild(scroll);
  return s;
}

/* ------------------------------------------------- setting a PIN + recovery */

export function renderPinSetup(profileId, ctl) {
  const s = h('section', 'screen pin');
  const back = h('button', 'icon-btn pin-back', '‹');
  back.onclick = () => ctl.back();
  s.appendChild(back);

  const inner = h('div', 'pin-inner');
  const title = h('h1', 'title center', 'Choose a PIN');
  const hint = h('p', 'pin-hint faint', 'Four digits');
  const dots = h('div', 'pin-dots');
  for (let i = 0; i < 4; i++) dots.appendChild(h('i'));
  inner.append(title, dots, hint);

  let first = '';
  let entry = '';

  const paint = () => {
    [...dots.children].forEach((d, i) => { d.dataset.on = i < entry.length ? '1' : '0'; });
  };

  const complete = async () => {
    if (!first) {
      first = entry;
      entry = '';
      paint();
      title.textContent = 'Again, to be sure';
      return;
    }
    if (first !== entry) {
      first = '';
      entry = '';
      paint();
      title.textContent = 'Choose a PIN';
      hint.textContent = 'Those didn’t match — try again';
      dots.classList.remove('shake');
      void dots.offsetWidth;
      dots.classList.add('shake');
      return;
    }
    const code = await store.setPin(profileId, entry);
    ctl.showRecovery(profileId, code);
  };

  const pad = h('div', 'pin-pad');
  for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']) {
    if (!key) { pad.appendChild(h('span')); continue; }
    const b = h('button', 'pin-key glass', key);
    b.onclick = () => {
      navigator.vibrate?.(8);
      if (key === '⌫') entry = entry.slice(0, -1);
      else if (entry.length < 4) entry += key;
      paint();
      if (entry.length === 4) setTimeout(complete, 130);
    };
    pad.appendChild(b);
  }
  inner.appendChild(pad);
  s.appendChild(inner);
  paint();
  return s;
}

/**
 * The one screen in the app where being slightly annoying is correct: the PIN
 * does not switch on until she confirms she has kept the code, because the
 * alternative is losing her photos permanently with nothing to email.
 */
export function renderRecovery(code, ctl) {
  const s = h('section', 'screen recovery');
  const box = h('div', 'rec-box glass card');

  box.append(
    h('h1', 'title', 'Write this down'),
    h('p', 'rec-why soft',
      'There is no account and no email, so if you forget your PIN these six words ' +
      'are the only way back into your profile. Nothing can reset it for you.')
  );

  const words = h('div', 'rec-words');
  code.split(' ').forEach((w, i) => {
    const chip = h('div', 'rec-word');
    chip.append(h('span', 'rec-num', String(i + 1)), h('span', null, w));
    words.appendChild(chip);
  });
  box.appendChild(words);

  const actions = h('div', 'rec-actions');
  const copy = h('button', 'btn btn-glass', 'Copy');
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(code);
      ctl.toast('Copied');
    } catch { ctl.toast('Could not copy — write them down'); }
  };
  const savePic = h('button', 'btn btn-glass', 'Save as image');
  savePic.onclick = () => ctl.saveImage(code);
  actions.append(copy, savePic);
  box.appendChild(actions);

  const confirm = h('label', 'check rec-check');
  const boxEl = h('input');
  boxEl.type = 'checkbox';
  const done = h('button', 'btn btn-accent btn-wide', 'Done');
  done.disabled = true;
  boxEl.onchange = () => { done.disabled = !boxEl.checked; };
  confirm.append(boxEl, h('span', null, 'I’ve written this down'));
  box.append(confirm, done);
  done.onclick = () => ctl.done();

  s.appendChild(box);
  return s;
}

/* ---------------------------------------------------------------- first run */

export function renderOnboarding(ctl) {
  const s = h('section', 'screen onboard');
  const stage = h('div', 'onboard-buddy');
  const canvas = h('canvas');
  stage.appendChild(canvas);
  s.appendChild(stage);

  const buddy = createBuddy(canvas, { face: 'cheerful' });
  requestAnimationFrame(() => { buddy.start(); buddy.play('wave'); });
  s.addEventListener('screen:leave', () => buddy.stop());

  const speech = h('p', 'onboard-speech', 'hi. i’m made of bubbles and enthusiasm.');
  const body = h('div', 'onboard-body');
  s.append(speech, body);

  const draft = { name: '', scheme: 'coral', buddy: 'bubble', kid: false };
  let step = 0;

  function paint() {
    body.replaceChildren();

    if (step === 0) {
      speech.textContent = 'what should i call you?';
      const field = h('label', 'field');
      const input = h('input');
      input.type = 'text';
      input.maxLength = 18;
      input.placeholder = 'your name';
      input.autocomplete = 'off';
      input.value = draft.name;
      input.oninput = () => { draft.name = input.value; next.disabled = !draft.name.trim(); };
      field.appendChild(input);

      const kid = h('label', 'check');
      const box = h('input');
      box.type = 'checkbox';
      box.checked = draft.kid;
      box.onchange = () => { draft.kid = box.checked; };
      const kidText = h('span', null, 'This is a kid’s profile');
      kidText.appendChild(h('small', null, 'No journal, no body tracking, ever'));
      kid.append(box, kidText);

      body.append(field, kid);
      requestAnimationFrame(() => input.focus());
    }

    if (step === 1) {
      speech.textContent = 'pick a colour. you can change it later.';
      const grid = h('div', 'scheme-grid');
      for (const sc of store.SCHEMES) {
        const b = h('button', 'scheme');
        b.dataset.scheme = sc.id;
        b.setAttribute('aria-selected', String(draft.scheme === sc.id));
        b.append(h('span', 'scheme-swatch'), h('span', 'scheme-name', sc.name));
        b.onclick = () => {
          draft.scheme = sc.id;
          document.documentElement.dataset.scheme = sc.id;
          paint();
        };
        grid.appendChild(b);
      }
      body.appendChild(grid);
    }

    if (step === 2) {
      speech.textContent = 'and what should i be?';
      const grid = h('div', 'buddy-grid');
      for (const k of store.BUDDY_KINDS) {
        const b = h('button', 'buddy-pick glass card');
        b.setAttribute('aria-selected', String(draft.buddy === k.id));
        b.append(h('span', 'buddy-pick-name', k.name), h('span', 'buddy-pick-hint faint', k.hint));
        b.onclick = () => { draft.buddy = k.id; paint(); };
        grid.appendChild(b);
      }
      body.appendChild(grid);
    }

    const row = h('div', 'onboard-actions');
    if (step > 0) {
      const back = h('button', 'btn btn-quiet', 'Back');
      back.onclick = () => { step -= 1; paint(); };
      row.appendChild(back);
    }
    row.appendChild(next);
    next.textContent = step === 2 ? 'Let’s go' : 'Next';
    next.disabled = step === 0 && !draft.name.trim();
    body.appendChild(row);
  }

  const next = h('button', 'btn btn-accent', 'Next');
  next.onclick = () => {
    if (step < 2) { step += 1; paint(); return; }
    ctl.done(draft);
  };

  paint();
  return s;
}

/* --------------------------------------------------------------- the camera
 *
 * Framing comes before anything else can. You read the rules, you press
 * Continue, and only then does the camera open — nothing switches on behind
 * your back.
 */

export function renderFraming(profileId, ctl) {
  const p = store.profile(profileId);
  const s = h('section', 'screen framing');

  const back = h('button', 'icon-btn framing-back', '‹');
  back.setAttribute('aria-label', 'Back');
  back.onclick = () => ctl.back();
  s.appendChild(back);

  /* ---- the rules card, first and on its own */
  const rules = h('div', 'card glass rules');
  rules.append(
    h('h1', 'title', 'Glute bridge'),
    h('p', 'rules-hint', 'Lie on your back with your knees bent and your feet flat. ' +
      'Prop the phone at your feet so it can see your knees.'),
  );
  const list = h('ul', 'rules-list');
  for (const line of [
    'Get both knees inside the circles.',
    'When they light up, the countdown starts.',
    'Lift your hips to pop the bubble. Lower them all the way back down.',
    'Nothing is recorded. The camera never leaves this phone.',
  ]) list.appendChild(h('li', null, line));
  rules.appendChild(list);

  const go = h('button', 'btn btn-accent', 'Continue');
  rules.appendChild(go);
  s.appendChild(rules);

  /* ---- the camera stage, hidden until Continue */
  const stage = h('div', 'framing-stage');
  stage.hidden = true;
  const video = h('video', 'framing-video');
  video.setAttribute('playsinline', '');
  video.muted = true;
  const overlay = h('canvas', 'framing-overlay');
  const status = h('p', 'framing-status', 'Starting the camera…');
  stage.append(video, overlay, status);
  s.appendChild(stage);

  let cam = null;
  let raf = 0;
  const zone = zoneFor('bridge');
  let fit = null;
  let heldFor = 0;
  let last = 0;
  let locked = false;

  const ctx = overlay.getContext('2d');

  function paint(now) {
    raf = requestAnimationFrame(paint);
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;

    const rect = overlay.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (overlay.width !== Math.round(rect.width * dpr)) {
      overlay.width = Math.round(rect.width * dpr);
      overlay.height = Math.round(rect.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const ready = isReady(fit);
    // Held, not merely touched. A circle that fires the moment a knee clips its
    // edge fires while you are still shuffling, and the countdown starts before
    // you are actually settled.
    heldFor = ready ? heldFor + dt : 0;
    if (heldFor > 0.7 && !locked) {
      locked = true;
      status.textContent = 'Got you.';
      setTimeout(() => ctl.ready(profileId), 450);
    }

    for (const t of zone.targets) {
      // The preview is mirrored, so the zone has to be drawn mirrored too or
      // she moves her left knee and the wrong circle responds.
      const cx = (1 - t.cx) * rect.width;
      const cy = t.cy * rect.height;
      const r = t.r * Math.min(rect.width, rect.height);
      const hit = fit && !fit.misses.includes(t.label);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = hit ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)';
      ctx.fill();
      ctx.lineWidth = hit ? 4 : 2;
      ctx.strokeStyle = hit ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)';
      ctx.stroke();
    }

    if (!locked) {
      if (!fit) status.textContent = 'Looking for you…';
      else if (ready) status.textContent = 'Hold it…';
      else status.textContent = `Move your ${fit.misses[0]} into the circle`;
    }
  }

  go.onclick = () => {
    rules.hidden = true;
    stage.hidden = false;
    raf = requestAnimationFrame(paint);
    cam = createCamera(video, {
      facing: 'user',
      onFrame: (bodies) => {
        const picked = pickPlayer(bodies, zone);
        fit = picked?.fit || null;
      },
      onError: (code) => {
        cancelAnimationFrame(raf);
        stage.hidden = true;
        rules.hidden = false;
        rules.replaceChildren(
          h('h1', 'title', 'No camera'),
          h('p', 'rules-hint', FAILURES[code] || FAILURES.unknown),
        );
        const again = h('button', 'btn btn-accent', 'Back');
        again.onclick = () => ctl.back();
        rules.appendChild(again);
      },
    });
    cam.start();
  };

  s.addEventListener('screen:leave', () => {
    cancelAnimationFrame(raf);
    cam?.stop();
  });
  return s;
}
