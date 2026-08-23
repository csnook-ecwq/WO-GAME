/**
 * screens.js — the shell's screens, in the order you meet them.
 *
 * Every render function returns an element and, where it needs one, wires its
 * own handlers. The router in app.js owns which one is on screen.
 */

import * as store from './store.js';
import { createBuddy, greeting } from './buddy.js';
import { pickAffirmation } from './affirmations.js';

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
  const canvas = h('canvas', 'launch-buddy');
  const name = h('div', 'launch-name', 'bubble');
  wrap.append(canvas, name);
  s.appendChild(wrap);

  const buddy = createBuddy(canvas);
  requestAnimationFrame(() => {
    buddy.start();
    buddy.play('bounce');
  });
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

  const buddy = createBuddy(canvas, { mood: g.mood });
  requestAnimationFrame(() => {
    buddy.start();
    buddy.play(g.anim);
  });
  s.addEventListener('screen:leave', () => buddy.stop());
  stage.onclick = () => buddy.playRandom();

  // Streak and week — adults only.
  //
  // A streak punishes a four-year-old for a week her mother didn't have time
  // for. Her showing up isn't in her control, so it isn't something she gets to
  // fail at. She collects achievements instead, for things she actually did.
  if (!p.kid) {
    const streakRow = h('div', 'streak rise rise-2');
    const n = p.streak || 0;
    streakRow.appendChild(h('b', null, n === 1 ? '1 day' : `${n} days`));
    const dots = h('div', 'week-dots');
    store.weekDots(profileId).forEach((v) => {
      const d = h('i');
      if (v > 0) d.style.opacity = String(0.4 + v * 0.6);
      d.dataset.on = v > 0 ? '1' : '0';
      dots.appendChild(d);
    });
    streakRow.appendChild(dots);
    s.appendChild(streakRow);
  }

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

  /* --- data */
  const data = section('Your data');
  const note = h('p', 'set-note faint',
    'Everything stays on this phone. Nothing is uploaded, and there is no account.');
  data.box.appendChild(note);
  const exportBtn = h('button', 'btn btn-glass btn-wide', 'Export everything');
  exportBtn.onclick = () => ctl.exportAll();
  data.box.appendChild(exportBtn);
  scroll.appendChild(data.wrap);

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

  const buddy = createBuddy(canvas, { mood: 'excited' });
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
