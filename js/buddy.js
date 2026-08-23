/**
 * buddy.js — the creature, and the aura behind her.
 *
 * An original character: one tall soft translucent body with stubby little arms
 * and feet, a soap-film rim, an iridescent sheen and a specular highlight. Drawn
 * entirely in code, so it costs nothing to download, recolours with the scheme,
 * and can be animated rather than being a picture.
 *
 * She has no name until the person who owns her gives her one.
 *
 * She does not talk. She is expression and animation, and she holds up
 * affirmations written elsewhere. She reacts to how long you have been away — and
 * the rule for every one of those reactions is that she teases and never shames.
 *
 * Motion is spring-driven rather than tweened. A poke adds velocity and the
 * spring settles it, which is the difference between a value changing and
 * something soft actually being prodded.
 */

const TAU = Math.PI * 2;

export const MOODS = ['happy', 'content', 'excited', 'sleepy', 'squint', 'sulk'];

/* ------------------------------------------------------------------ springs */

function makeSpring(value = 0, stiffness = 190, damping = 13) {
  return { value, vel: 0, target: value, stiffness, damping };
}

function stepSpring(s, dt) {
  const accel = (s.target - s.value) * s.stiffness - s.vel * s.damping;
  s.vel += accel * dt;
  s.value += s.vel * dt;
  // Settle completely rather than oscillating forever below the visible
  // threshold, which would keep the canvas repainting for nothing.
  if (Math.abs(s.vel) < 0.0004 && Math.abs(s.target - s.value) < 0.0004) {
    s.value = s.target;
    s.vel = 0;
  }
}

/** A poke is an impulse, so poking twice quickly wobbles more, not less. */
function nudge(s, amount) {
  s.vel += amount;
}

/* ------------------------------------------------------------------- colour */

function withAlpha(hex, alpha) {
  const h = hex.replace('#', '').trim();
  const n = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h.slice(0, 6);
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

/* -------------------------------------------------------------------- shapes
 *
 * All in body units: the creature is about 1.05 wide and 2.25 tall, centred on
 * the origin. Slightly wider at the base so she sits rather than floats.
 */

function bodyPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(0, -1.12);
  ctx.bezierCurveTo(0.26, -1.12, 0.41, -0.88, 0.41, -0.52);
  ctx.bezierCurveTo(0.41, -0.10, 0.52, 0.32, 0.52, 0.74);
  ctx.bezierCurveTo(0.52, 1.01, 0.31, 1.13, 0, 1.13);
  ctx.bezierCurveTo(-0.31, 1.13, -0.52, 1.01, -0.52, 0.74);
  ctx.bezierCurveTo(-0.52, 0.32, -0.41, -0.10, -0.41, -0.52);
  ctx.bezierCurveTo(-0.41, -0.88, -0.26, -1.12, 0, -1.12);
  ctx.closePath();
}

function limbPath(ctx, x, y, rx, ry, rot) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.closePath();
}

/**
 * The glossy pass, applied to whatever path `trace` draws.
 *
 * Three things make it read as a bubble rather than a shape: a body emptier in
 * the middle than at the edge (soap film is thin where you look through it), an
 * iridescent wash that drifts, and a hard little highlight.
 *
 * The gradients are built in a space scaled to the shape's bounding box, so a
 * tall body gets rim brightening that hugs its narrow sides instead of a circular
 * falloff that misses them.
 */
function glossy(ctx, trace, box, tint, t, seed) {
  const { cx, cy, rx, ry } = box;

  // 1. the film
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const film = ctx.createRadialGradient(0, 0, 0.08, 0, 0, 1);
  film.addColorStop(0, withAlpha(tint, 0.13));
  film.addColorStop(0.50, withAlpha(tint, 0.22));
  film.addColorStop(0.86, withAlpha(tint, 0.46));
  film.addColorStop(1, withAlpha(tint, 0.58));
  ctx.restore();

  ctx.save();
  trace();
  ctx.clip();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  ctx.fillStyle = film;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();

  // 2. iridescence — a slow drift of pastel hues across the surface
  const shift = Math.sin(t * 0.0004 + seed) * 0.3;
  const iris = ctx.createRadialGradient(-0.34 + shift, -0.42, 0.05, 0, 0, 1.15);
  iris.addColorStop(0, 'rgba(255,214,236,0.36)');
  iris.addColorStop(0.34, 'rgba(206,232,255,0.28)');
  iris.addColorStop(0.62, 'rgba(214,255,232,0.20)');
  iris.addColorStop(1, 'rgba(255,246,206,0.05)');
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.arc(0, 0, 1.15, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.restore();

  // 3. rim, on the real path so it follows the silhouette exactly
  ctx.save();
  trace();
  ctx.strokeStyle = 'rgba(255,255,255,0.62)';
  ctx.lineWidth = Math.min(rx, ry) * 0.055;
  ctx.stroke();
  ctx.restore();
}

/** Highlights sit on the body, not on every limb, or it reads as noise. */
function highlights(ctx, box) {
  const { cx, cy, rx, ry } = box;
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.44, cy - ry * 0.52, rx * 0.17, ry * 0.09, -0.42, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.40, cy - ry * 0.30, rx * 0.07, ry * 0.035, -0.42, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.34)';
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.46, cy + ry * 0.34, rx * 0.09, ry * 0.05, -0.3, 0, TAU);
  ctx.fill();
}

/**
 * The face, high on the body — about a quarter of the way down.
 *
 * `content` is the enamel-pin face: two closed happy curves and no mouth. It is a
 * mood rather than the default, because a creature that can also squint at you
 * after a fortnight is worth more than one that is serenely still.
 */
function face(ctx, cy, u, state) {
  const { blink, mood, look } = state;
  const eyeY = cy;
  const dx = u * 0.19;
  const ink = 'rgba(46,36,48,0.8)';
  const closed = blink > 0.5 || mood === 'content';

  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const ex = side * dx + look * u * 0.04;
    if (closed) {
      // an arc opening downward: the classic happy closed eye
      ctx.strokeStyle = ink;
      ctx.lineWidth = u * 0.05;
      ctx.beginPath();
      ctx.arc(ex, eyeY + u * 0.05, u * 0.085, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    } else if (mood === 'squint' || mood === 'sleepy') {
      ctx.strokeStyle = ink;
      ctx.lineWidth = u * 0.05;
      ctx.beginPath();
      ctx.arc(ex, eyeY + u * 0.03, u * 0.08, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, u * 0.055, u * 0.072, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(ex - u * 0.018, eyeY - u * 0.026, u * 0.02, 0, TAU);
      ctx.fill();
    }
  }

  // The pin has no mouth, and `content` keeps it that way.
  if (mood === 'content') return;

  const my = eyeY + u * 0.17;
  ctx.strokeStyle = ink;
  ctx.lineWidth = u * 0.045;
  ctx.beginPath();
  if (mood === 'excited') {
    ctx.arc(0, my - u * 0.04, u * 0.1, 0.14 * Math.PI, 0.86 * Math.PI);
  } else if (mood === 'sulk') {
    ctx.arc(0, my + u * 0.11, u * 0.085, 1.2 * Math.PI, 1.8 * Math.PI);
  } else if (mood === 'sleepy') {
    ctx.moveTo(-u * 0.05, my);
    ctx.lineTo(u * 0.05, my);
  } else {
    ctx.arc(0, my - u * 0.03, u * 0.08, 0.2 * Math.PI, 0.8 * Math.PI);
  }
  ctx.stroke();
}

/**
 * The aura: soft concentric bands drifting behind her.
 *
 * This is the only place the home screen comments on consistency, and it does it
 * without a number. `energy` runs 0..1 — bright and a little faster when she has
 * moved today, dim and slow after a gap. It brightens on good news and fades
 * quietly otherwise; it never announces a bad week.
 */
function drawAura(ctx, R, tint, t, energy) {
  const bands = 3;
  for (let i = 0; i < bands; i++) {
    const phase = t * 0.00026 * (1 + energy * 0.7) + i * 2.1;
    const rr = R * (1.00 + i * 0.22 + Math.sin(phase) * 0.05) * (0.88 + energy * 0.18);
    const a = (0.17 - i * 0.045) * (0.3 + energy * 0.7);
    if (a <= 0) continue;
    const g = ctx.createRadialGradient(0, 0, rr * 0.5, 0, 0, rr);
    g.addColorStop(0, withAlpha(tint, 0));
    g.addColorStop(0.62, withAlpha(tint, a));
    g.addColorStop(1, withAlpha(tint, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, TAU);
    ctx.fill();
  }
}

/* --------------------------------------------------------------------- buddy */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{mood?: string, energy?: number, aura?: boolean}} [opts]
 */
export function createBuddy(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  let raf = 0;
  let running = false;
  let w = 0, h = 0;
  let last = 0;

  const state = {
    mood: opts.mood || 'happy',
    energy: opts.energy ?? 0.55,
    aura: opts.aura !== false,
    // Logo mode draws the aura and one plain bubble to sit behind the wordmark —
    // no face, no limbs. Same code, so the mark and the character can never
    // drift apart.
    logo: !!opts.logo,
    blink: 0,
    nextBlink: 900 + Math.random() * 2600,
    look: 0,
    t0: 0,
  };

  // Every channel is a spring. Poking adds velocity; nothing is tweened.
  const squash = makeSpring(0, 210, 12);
  const lift = makeSpring(0, 150, 11);
  const lean = makeSpring(0, 170, 12);
  const armLift = makeSpring(0, 160, 10);

  let spin = 0;
  let spinVel = 0;
  let puff = null;
  const queue = [];
  let busyUntil = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    w = rect.width || 260;
    h = rect.height || 260;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function tint() {
    const css = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim();
    return css || '#FF8B7A';
  }

  function run(name) {
    switch (name) {
      case 'wave': nudge(armLift, 9); nudge(lean, 1.6); busyUntil = 700; break;
      case 'spin': spinVel = 7.4; busyUntil = 900; break;
      case 'bounce': nudge(lift, 9); nudge(squash, 5); busyUntil = 620; break;
      case 'yawn': state.mood = 'sleepy'; nudge(squash, -4.5); busyUntil = 800; break;
      case 'blow': puff = { x: 0, y: 0, r: 0.05, alpha: 0.9 }; busyUntil = 900; break;
      case 'pop': nudge(squash, 7); nudge(lift, 4); busyUntil = 420; break;
      case 'wobble': nudge(lean, 3.4); nudge(squash, 2.6); busyUntil = 400; break;
      default: break;
    }
  }

  function frame(t) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!state.t0) { state.t0 = t; last = t; }
    const time = t - state.t0;
    const dt = Math.min((t - last) / 1000, 1 / 30);
    last = t;

    // one-shot animations, queued rather than interrupting each other
    busyUntil -= dt * 1000;
    if (busyUntil <= 0 && queue.length) run(queue.shift());

    stepSpring(squash, dt);
    stepSpring(lift, dt);
    stepSpring(lean, dt);
    stepSpring(armLift, dt);
    if (Math.abs(spinVel) > 0.001) {
      spin += spinVel * dt;
      spinVel *= Math.pow(0.12, dt);
      if (Math.abs(spinVel) < 0.02) { spinVel = 0; spin = 0; }
    }

    // idle: a slow float with a matching breath, so she feels buoyant
    const float = Math.sin(time * 0.0011) * 0.03;
    const breathe = Math.sin(time * 0.0011 + Math.PI / 2) * 0.025;

    // blinking at irregular intervals — regular blinking looks mechanical
    state.nextBlink -= dt * 1000;
    if (state.nextBlink <= 0) {
      state.blink = 1;
      state.nextBlink = 2000 + Math.random() * 2600;
    }
    if (state.blink > 0) state.blink -= dt * 7;

    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const u = Math.min(w / 1.5, h / 2.75);   // body unit in px
    const col = tint();

    ctx.save();
    ctx.translate(cx, cy);

    if (state.aura) drawAura(ctx, u * 0.95, col, time, state.energy);

    if (state.logo) {
      // One soft bubble, breathing, for the wordmark to sit in front of.
      // Still in pixel units here — the body-unit scale happens further down.
      const r = u * (0.92 + breathe * 0.5);
      glossy(ctx, () => limbPath(ctx, 0, 0, r, r, 0),
        { cx: 0, cy: 0, rx: r, ry: r }, col, time, 0);
      ctx.restore();
      return;
    }

    ctx.translate(0, (float + lift.value * 0.06) * u);
    if (spin) ctx.rotate(spin);
    ctx.rotate(lean.value * 0.05);
    ctx.scale(
      (1 + breathe + squash.value * 0.05) * u,
      (1 - breathe - squash.value * 0.035) * u
    );

    // ground shadow, so she reads as floating just above something
    ctx.fillStyle = 'rgba(60,40,70,0.055)';
    ctx.beginPath();
    ctx.ellipse(0, 1.46, 0.50, 0.09, 0, 0, TAU);
    ctx.fill();

    // Feet behind, so they read as tucked under her.
    glossy(ctx, () => limbPath(ctx, -0.23, 1.22, 0.20, 0.12, -0.12),
      { cx: -0.23, cy: 1.22, rx: 0.20, ry: 0.12 }, col, time, 3.9);
    glossy(ctx, () => limbPath(ctx, 0.23, 1.22, 0.20, 0.12, 0.12),
      { cx: 0.23, cy: 1.22, rx: 0.20, ry: 0.12 }, col, time, 5.2);

    // the body
    const box = { cx: 0, cy: 0, rx: 0.53, ry: 1.13 };
    glossy(ctx, () => bodyPath(ctx), box, col, time, 0);
    highlights(ctx, box);

    // Arms in front, overlapping the body — the way the enamel pin does it. The
    // seam where they cross the edge is what makes them read as attached; drawn
    // behind, they float beside her like stray wisps.
    const arm = armLift.value;
    glossy(ctx, () => limbPath(ctx, -0.44, 0.24 - arm * 0.02, 0.19, 0.155, -0.28),
      { cx: -0.44, cy: 0.24, rx: 0.19, ry: 0.155 }, col, time, 1.3);
    glossy(ctx, () => limbPath(ctx, 0.44, 0.24 - arm * 0.07, 0.19, 0.155, 0.28 - arm * 0.1),
      { cx: 0.44, cy: 0.24, rx: 0.19, ry: 0.155 }, col, time, 2.6);

    // the face, a quarter of the way down
    face(ctx, -0.52, 1, { ...state, look: state.look });

    if (puff) {
      puff.r += dt * 0.34;
      puff.y -= dt * 0.9;
      puff.alpha -= dt * 0.6;
      if (puff.alpha <= 0) puff = null;
      else {
        ctx.globalAlpha = puff.alpha;
        const px = 0.42 + puff.x, py = -0.42 + puff.y;
        glossy(ctx, () => limbPath(ctx, px, py, puff.r, puff.r, 0),
          { cx: px, cy: py, rx: puff.r, ry: puff.r }, col, time, 8);
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }

  const api = {
    setMood(m) { if (MOODS.includes(m)) state.mood = m; },
    setEnergy(e) { state.energy = Math.max(0, Math.min(1, e)); },

    /** Queue an animation. Rapid pokes accumulate rather than interrupting. */
    play(name) {
      if (busyUntil > 0) {
        // Still, give immediate physical feedback even mid-animation — that is
        // what makes repeated poking feel like poking something soft.
        nudge(squash, 2.2);
        nudge(lean, 1.4);
        if (queue.length < 3) queue.push(name);
        return;
      }
      run(name);
    },

    playRandom(exclude) {
      const all = ['wave', 'spin', 'bounce', 'yawn', 'blow', 'wobble'];
      const pool = all.filter((a) => a !== exclude);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      api.play(pick);
      return pick;
    },

    /** A direct poke: pure impulse, no animation slot needed. */
    poke() {
      nudge(squash, 5.5);
      nudge(lean, (Math.random() - 0.5) * 5);
      nudge(lift, 2.4);
    },

    start() {
      if (running) return;
      running = true;
      state.t0 = 0;
      resize();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    resize,
  };

  return api;
}

/**
 * How she greets you, from how long it has been and what time it is.
 *
 * She teases, she never shames. Being squinted at after a fortnight is funny;
 * being told off is why people delete an app on exactly the week they most
 * needed it.
 */
export function greeting(lastSeenMs, now = Date.now()) {
  const hour = new Date(now).getHours();
  const days = lastSeenMs ? Math.floor((now - lastSeenMs) / 86400000) : null;

  if (days === null) return { mood: 'excited', anim: 'wave', gap: 'new' };
  if (days >= 14) return { mood: 'squint', anim: 'spin', gap: 'ages' };
  if (days >= 5) return { mood: 'squint', anim: 'bounce', gap: 'a while' };
  if (hour >= 22 || hour < 5) return { mood: 'sleepy', anim: 'yawn', gap: 'late' };
  if (days <= 1) return { mood: 'excited', anim: 'bounce', gap: 'recent' };
  return { mood: 'content', anim: 'blow', gap: 'normal' };
}

/**
 * Aura brightness from the record. The only progress feedback on the home screen
 * that isn't a number.
 *
 * @param {number[]} weekDots seven values, 0 = nothing that day
 * @param {number} todayIndex 0 = Monday
 */
export function auraEnergy(weekDots = [], todayIndex = 0) {
  if (weekDots[todayIndex] > 0) return 1;
  const active = weekDots.filter((v) => v > 0).length;
  if (active >= 1) return 0.55;
  return 0.2;
}
