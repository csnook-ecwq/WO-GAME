/**
 * fx.js — the arcade layer: blips, spoken rep counts, particle bursts and
 * confetti. All optional, all cheap.
 */

let ctx = null;
const audio = () => {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};

/** Must be called from a user gesture on iOS or nothing will ever make noise. */
export function unlockAudio() {
  const c = audio();
  if (c && c.state === 'suspended') c.resume();
}

function tone({ freq = 660, dur = 0.09, type = 'sine', gain = 0.15, slide = 0 }) {
  const c = audio();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + dur + 0.02);
}

/**
 * Soft, round sounds to match the look — sine and triangle waves at low gain,
 * nothing buzzy. A rep pops rather than beeps, and the combo climbs in pitch so
 * a long streak sounds like it is going somewhere.
 */
export const sfx = {
  rep(n = 1) {
    const step = Math.min(n, 12);
    tone({ freq: 560 + step * 26, dur: 0.11, type: 'sine', gain: 0.13 });
    tone({ freq: 1120 + step * 52, dur: 0.07, type: 'sine', gain: 0.05 });
  },
  milestone() { [784, 1046].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.14, type: 'sine', gain: 0.1 }), i * 90)); },
  complete() { [523, 659, 880].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.2, type: 'sine', gain: 0.11 }), i * 120)); },
  countdown() { tone({ freq: 480, dur: 0.12, type: 'sine', gain: 0.09 }); },
  go() { tone({ freq: 720, dur: 0.26, type: 'triangle', gain: 0.12, slide: 260 }); },
  fail() { tone({ freq: 320, dur: 0.22, type: 'sine', gain: 0.07, slide: -90 }); },
  levelUp() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.22, type: 'sine', gain: 0.1 }), i * 110)); },
};

let voiceOn = true;
export function setVoice(on) { voiceOn = on; }

export function say(text, { rate = 1.15, force = false } = {}) {
  if ((!voiceOn && !force) || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(String(text));
    u.rate = rate;
    u.pitch = 1;
    u.volume = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* speech is a nice-to-have */ }
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/* ------------------------------------------------------------------ particles */

const particles = [];

export function burst(x, y, { color = '#7CFF6B', count = 18, speed = 5, life = 700 } = {}) {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const s = speed * (0.5 + Math.random());
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 1.2,
      born: performance.now(),
      life: life * (0.7 + Math.random() * 0.6),
      color,
      size: 2 + Math.random() * 4,
    });
  }
}

export function drawParticles(g, now = performance.now()) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    const age = now - p.born;
    if (age > p.life) { particles.splice(i, 1); continue; }
    const t = age / p.life;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.22;
    p.vx *= 0.99;
    g.globalAlpha = 1 - t;
    g.fillStyle = p.color;
    g.beginPath();
    g.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

export function clearParticles() { particles.length = 0; }

/* ------------------------------------------------------------------ confetti */

/** Full-screen confetti for the summary screen. Runs on its own canvas. */
export function confetti(durationMs = 2600) {
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d');
  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize);

  const colors = ['#7CFF6B', '#6BE7FF', '#FFD166', '#FF7BD5', '#B98BFF'];
  const bits = Array.from({ length: 140 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    w: 6 + Math.random() * 8,
    h: 8 + Math.random() * 10,
    vy: 2 + Math.random() * 3.5,
    vx: -1.5 + Math.random() * 3,
    rot: Math.random() * Math.PI,
    vr: -0.15 + Math.random() * 0.3,
    color: colors[(Math.random() * colors.length) | 0],
  }));

  const start = performance.now();
  const frame = (now) => {
    const elapsed = now - start;
    g.clearRect(0, 0, canvas.width, canvas.height);
    for (const b of bits) {
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.vr;
      if (b.y > canvas.height + 30 && elapsed < durationMs - 900) {
        b.y = -20;
        b.x = Math.random() * canvas.width;
      }
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.rot);
      g.globalAlpha = elapsed > durationMs - 700 ? Math.max(0, (durationMs - elapsed) / 700) : 1;
      g.fillStyle = b.color;
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      g.restore();
    }
    if (elapsed < durationMs) requestAnimationFrame(frame);
    else {
      window.removeEventListener('resize', resize);
      canvas.remove();
    }
  };
  requestAnimationFrame(frame);
}

export function vibrate(pattern) {
  if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch { /* ignore */ } }
}
