/**
 * buddy.js — the bubble creature.
 *
 * An original character: several glossy translucent bubbles stuck together into
 * a body, a head and little limbs, with a soap-film rim, an iridescent sheen and
 * a specular highlight. Drawn entirely in code, so it costs nothing to download,
 * recolours with the scheme, and can be animated rather than being a picture.
 *
 * It does not talk. It is expression and animation, and it holds up affirmations
 * written elsewhere. It reacts to how long you have been away — and the rule for
 * every one of those reactions is that it teases and never shames.
 */

const TAU = Math.PI * 2;

/** Bubbles that make up the creature, in draw order. Units are body radii. */
const PARTS = [
  // Arms sit close enough to genuinely fuse with the body. Further out and it
  // stops reading as one creature and starts reading as a snowman with two
  // stray bubbles beside it.
  { id: 'armL', x: -0.64, y: 0.22, r: 0.26 },
  { id: 'armR', x: 0.64, y: 0.22, r: 0.26 },
  { id: 'footL', x: -0.32, y: 0.9, r: 0.21 },
  { id: 'footR', x: 0.32, y: 0.9, r: 0.21 },
  { id: 'body', x: 0, y: 0.3, r: 0.62 },
  { id: 'head', x: 0, y: -0.5, r: 0.48 },
];

export const MOODS = ['happy', 'excited', 'sleepy', 'squint', 'sulk'];

/**
 * One glossy bubble.
 *
 * Three passes make it read as a bubble rather than a circle: a body that is
 * emptier in the middle than at the edge (soap film is thin where you look
 * through it), an iridescent wash, and a hard little highlight.
 */
function bubble(ctx, x, y, r, tint, t, seed) {
  // 1. the film — dark-free, brighter toward the rim
  const film = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
  film.addColorStop(0, 'rgba(255,255,255,0.10)');
  film.addColorStop(0.62, 'rgba(255,255,255,0.16)');
  film.addColorStop(0.88, `${tint}66`);
  film.addColorStop(1, `${tint}22`);
  ctx.fillStyle = film;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();

  // 2. iridescence — a slow drift of pastel hues across the surface
  const shift = Math.sin(t * 0.0004 + seed) * r * 0.3;
  const iris = ctx.createRadialGradient(
    x - r * 0.35 + shift, y - r * 0.4, r * 0.05,
    x, y, r * 1.1
  );
  iris.addColorStop(0, 'rgba(255,214,236,0.34)');
  iris.addColorStop(0.35, 'rgba(206,232,255,0.26)');
  iris.addColorStop(0.62, 'rgba(214,255,232,0.20)');
  iris.addColorStop(1, 'rgba(255,246,206,0.05)');
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // 3. rim
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = Math.max(1, r * 0.035);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.985, 0, TAU);
  ctx.stroke();

  // 4. specular highlight, upper left, plus a tiny secondary
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.36, y - r * 0.42, r * 0.17, r * 0.12, -0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.arc(x + r * 0.34, y + r * 0.4, r * 0.07, 0, TAU);
  ctx.fill();
}

/** Eyes and mouth, floating on the head bubble's surface. */
function face(ctx, hx, hy, hr, state) {
  const { blink, mood, look } = state;
  const eyeY = hy - hr * 0.05;
  const dx = hr * 0.3;
  const ink = 'rgba(46,36,48,0.82)';

  for (const side of [-1, 1]) {
    const ex = hx + side * dx + look * hr * 0.08;
    ctx.fillStyle = ink;
    if (blink > 0.5) {
      // a closed eye is a line, and it is what sells the whole character
      ctx.lineCap = 'round';
      ctx.strokeStyle = ink;
      ctx.lineWidth = hr * 0.09;
      ctx.beginPath();
      ctx.moveTo(ex - hr * 0.12, eyeY);
      ctx.lineTo(ex + hr * 0.12, eyeY);
      ctx.stroke();
    } else if (mood === 'squint' || mood === 'sleepy') {
      ctx.lineCap = 'round';
      ctx.strokeStyle = ink;
      ctx.lineWidth = hr * 0.1;
      ctx.beginPath();
      ctx.arc(ex, eyeY + hr * 0.06, hr * 0.15, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, hr * 0.1, hr * 0.13, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(ex - hr * 0.03, eyeY - hr * 0.05, hr * 0.035, 0, TAU);
      ctx.fill();
    }
  }

  // mouth
  const my = hy + hr * 0.34;
  ctx.strokeStyle = ink;
  ctx.lineWidth = hr * 0.08;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (mood === 'excited') {
    ctx.arc(hx, my - hr * 0.08, hr * 0.19, 0.15 * Math.PI, 0.85 * Math.PI);
  } else if (mood === 'sulk') {
    ctx.arc(hx, my + hr * 0.2, hr * 0.16, 1.2 * Math.PI, 1.8 * Math.PI);
  } else if (mood === 'sleepy') {
    ctx.moveTo(hx - hr * 0.09, my);
    ctx.lineTo(hx + hr * 0.09, my);
  } else {
    ctx.arc(hx, my - hr * 0.05, hr * 0.15, 0.2 * Math.PI, 0.8 * Math.PI);
  }
  ctx.stroke();
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{scheme?: string}} [opts]
 */
export function createBuddy(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  let raf = 0;
  let running = false;
  let w = 0, h = 0;

  const state = {
    mood: opts.mood || 'happy',
    blink: 0,
    nextBlink: 1200,
    look: 0,
    squash: 0,
    spin: 0,
    lift: 0,
    wave: 0,
    puff: null,     // { r, alpha } — a bubble being blown
    t0: 0,
  };

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

  function frame(t) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!state.t0) state.t0 = t;
    const time = t - state.t0;

    // idle: a slow float with a matching squash, so it feels buoyant rather
    // than like a sprite being translated up and down
    const float = Math.sin(time * 0.0011) * 0.035;
    const breathe = Math.sin(time * 0.0011 + Math.PI / 2) * 0.03;

    // blinking at irregular intervals — regular blinking looks mechanical
    state.nextBlink -= 16;
    if (state.nextBlink <= 0) {
      state.blink = 1;
      state.nextBlink = 1800 + Math.sin(time * 0.7) * 900 + 900;
    }
    if (state.blink > 0) state.blink -= 0.14;

    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2 + state.lift * h * 0.08;
    // The creature spans roughly 2.1 body radii tall and 1.9 wide, so this
    // fills the canvas rather than floating in the middle of it.
    const R = Math.min(w, h) * 0.37;
    const col = tint();

    ctx.save();
    ctx.translate(cx, cy + float * R);
    if (state.spin) ctx.rotate(state.spin);
    ctx.scale(1 + breathe + state.squash, 1 - breathe - state.squash * 0.6);

    // soft ground shadow so it reads as floating above something
    ctx.fillStyle = 'rgba(60,40,70,0.06)';
    ctx.beginPath();
    ctx.ellipse(0, R * 1.32, R * 0.62, R * 0.12, 0, 0, TAU);
    ctx.fill();

    let head = null;
    PARTS.forEach((p, i) => {
      let px = p.x * R;
      let py = p.y * R;
      if (p.id === 'armR' && state.wave > 0) {
        // the wave lifts and swings the right arm bubble
        const a = Math.sin(state.wave * Math.PI) ;
        px += a * R * 0.12;
        py -= a * R * 0.55;
      }
      if (p.id === 'head') head = { x: px, y: py, r: p.r * R };
      bubble(ctx, px, py, p.r * R, col, time, i * 1.7);
    });

    if (head) face(ctx, head.x, head.y, head.r, state);

    // a bubble being blown, drifting up and away
    if (state.puff) {
      const p = state.puff;
      p.r += 0.9;
      p.y -= 1.4;
      p.alpha -= 0.012;
      if (p.alpha <= 0) state.puff = null;
      else {
        ctx.globalAlpha = p.alpha;
        bubble(ctx, head.x + head.r * 0.7 + p.x, head.y + head.r * 0.3 + p.y, p.r, col, time, 9);
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();

    // decay the one-shot animation channels
    if (state.wave > 0) state.wave = Math.max(0, state.wave - 0.02);
    if (state.spin) {
      state.spin += 0.16;
      if (state.spin >= TAU) state.spin = 0;
    }
    if (state.squash) state.squash *= 0.9;
    if (Math.abs(state.squash) < 0.002) state.squash = 0;
    if (state.lift) state.lift *= 0.94;
  }

  const api = {
    /** Idle expression. See MOODS. */
    setMood(m) { if (MOODS.includes(m)) state.mood = m; },

    /**
     * One of the arrival animations. A different one every time the app opens
     * is what stops the front door feeling like a static image.
     */
    play(name) {
      switch (name) {
        case 'wave': state.wave = 1; break;
        case 'spin': state.spin = 0.001; break;
        case 'bounce': state.lift = -1; state.squash = 0.16; break;
        case 'yawn': state.mood = 'sleepy'; state.squash = -0.12; break;
        case 'blow': state.puff = { x: 0, y: 0, r: 4, alpha: 0.9 }; break;
        case 'pop': state.squash = 0.22; break;
        default: break;
      }
    },

    /** Pick an entrance at random, excluding the one used last time. */
    playRandom(exclude) {
      const all = ['wave', 'spin', 'bounce', 'yawn', 'blow'];
      const pool = all.filter((a) => a !== exclude);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      api.play(pick);
      return pick;
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
 * How the buddy greets you, from how long it has been and what time it is.
 *
 * The rule: it teases, it never shames. Being squinted at after a fortnight is
 * funny; being told off is why people delete an app on exactly the week they
 * most needed it.
 */
export function greeting(lastSeenMs, now = Date.now()) {
  const hour = new Date(now).getHours();
  const days = lastSeenMs ? Math.floor((now - lastSeenMs) / 86400000) : null;

  if (days === null) return { mood: 'excited', anim: 'wave', gap: 'new' };
  if (days >= 14) return { mood: 'squint', anim: 'spin', gap: 'ages' };
  if (days >= 5) return { mood: 'squint', anim: 'bounce', gap: 'a while' };
  if (hour >= 22 || hour < 5) return { mood: 'sleepy', anim: 'yawn', gap: 'late' };
  if (days <= 1) return { mood: 'excited', anim: 'bounce', gap: 'recent' };
  return { mood: 'happy', anim: 'blow', gap: 'normal' };
}
