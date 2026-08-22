/**
 * ghost.js — draws you as a glowing figure that follows the exact contour of
 * your body, the way a face filter follows a face.
 *
 * The shape comes from the segmentation mask MediaPipe returns alongside the
 * landmarks: a per-pixel "is this you" map. We paint the skin *through* that
 * mask, so the glow is your actual silhouette rather than a stick figure.
 *
 * Three quality levels, chosen automatically:
 *   mask    — the real silhouette (what you get on a capable phone)
 *   outline — the silhouette's edge only, cheaper to composite
 *   hull    — a body built from the skeleton with thick limbs, when there is no
 *             mask at all or the device cannot keep up
 *
 * Nothing here knows about workouts or scoring; the game draws on top.
 */

import { LM } from './detectors.js';

/* ------------------------------------------------------------------ layout */

/** Where a video lands on screen under `object-fit: cover`. */
export function coverRect(videoW, videoH, viewW, viewH) {
  const vw = videoW || 1280;
  const vh = videoH || 720;
  const scale = Math.max(viewW / vw, viewH / vh);
  const w = vw * scale;
  const h = vh * scale;
  return { x: (viewW - w) / 2, y: (viewH - h) / 2, w, h };
}

/** Normalized landmark → canvas pixels, for a given cover rect. */
export const projectWith = (rect) => (p) => ({ x: rect.x + p.x * rect.w, y: rect.y + p.y * rect.h });

/* ------------------------------------------------------------------- skins */

/**
 * Every skin is drawn procedurally — no image files to download, license or
 * ship. Each paints a full rectangle; the mask decides what survives.
 */
export const SKINS = {
  glow: {
    name: 'Glow', unlockAt: 0,
    paint(ctx, r, t, c) {
      const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
      g.addColorStop(0, mix(c, '#ffffff', 0.55));
      g.addColorStop(0.5, c);
      g.addColorStop(1, mix(c, '#ffffff', 0.3));
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    },
  },
  rainbow: {
    name: 'Rainbow', unlockAt: 3,
    paint(ctx, r, t) {
      const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w * 0.4, r.y + r.h);
      const shift = (t * 0.04) % 360;
      for (let i = 0; i <= 5; i++) {
        g.addColorStop(i / 5, `hsl(${(shift + i * 62) % 360} 95% 72%)`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    },
  },
  sparkle: {
    name: 'Sparkle', unlockAt: 6,
    paint(ctx, r, t, c) {
      ctx.fillStyle = mix(c, '#ffffff', 0.25);
      ctx.globalAlpha = 0.35;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.globalAlpha = 1;
      const rnd = seeded(7);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 90; i++) {
        const px = r.x + rnd() * r.w;
        const py = r.y + rnd() * r.h;
        const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.004 + i));
        ctx.globalAlpha = twinkle;
        const s = 1.5 + twinkle * 2.5;
        ctx.beginPath();
        ctx.arc(px, py, s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },
  galaxy: {
    name: 'Galaxy', unlockAt: 12,
    paint(ctx, r, t) {
      const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      g.addColorStop(0, '#2B1B5A');
      g.addColorStop(0.5, '#5A2E8C');
      g.addColorStop(1, '#1B2E6B');
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      const rnd = seeded(19);
      for (let i = 0; i < 120; i++) {
        const px = r.x + rnd() * r.w;
        const drift = (rnd() * r.h + t * 0.02) % r.h;
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.003 + i));
        ctx.fillStyle = i % 7 === 0 ? '#FFD9F0' : '#FFFFFF';
        ctx.beginPath();
        ctx.arc(px, r.y + drift, rnd() * 1.6 + 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },
  mermaid: {
    name: 'Mermaid', unlockAt: 18,
    paint(ctx, r, t) {
      const g = ctx.createLinearGradient(r.x, r.y + r.h, r.x + r.w, r.y);
      g.addColorStop(0, '#3FD8C8');
      g.addColorStop(0.45, '#7FE9E0');
      g.addColorStop(1, '#C9A7FF');
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      // Scales: overlapping arcs that shimmer as you move.
      const step = Math.max(14, r.h / 26);
      ctx.lineWidth = 1.5;
      for (let row = 0, i = 0; row < r.h; row += step * 0.62, i++) {
        for (let col = (i % 2) * step * 0.5; col < r.w; col += step) {
          ctx.strokeStyle = `hsla(${170 + 40 * Math.sin(t * 0.002 + row * 0.05)} 85% 78% / 0.5)`;
          ctx.beginPath();
          ctx.arc(r.x + col, r.y + row, step * 0.5, Math.PI * 0.15, Math.PI * 0.85);
          ctx.stroke();
        }
      }
    },
  },
  ice: {
    name: 'Ice', unlockAt: 25,
    paint(ctx, r, t) {
      const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
      g.addColorStop(0, '#EAF7FF');
      g.addColorStop(0.6, '#9FD8FF');
      g.addColorStop(1, '#6FB8F5');
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      const rnd = seeded(31);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 26; i++) {
        const px = r.x + rnd() * r.w;
        const py = r.y + rnd() * r.h;
        const len = 8 + rnd() * 16;
        const a = rnd() * Math.PI + t * 0.0004;
        ctx.beginPath();
        ctx.moveTo(px - Math.cos(a) * len, py - Math.sin(a) * len);
        ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
        ctx.stroke();
      }
    },
  },
  ember: {
    name: 'Ember', unlockAt: 25,
    paint(ctx, r, t) {
      const flicker = 0.5 + 0.5 * Math.sin(t * 0.006);
      const g = ctx.createLinearGradient(r.x, r.y + r.h, r.x, r.y);
      g.addColorStop(0, '#FF5E3A');
      g.addColorStop(0.5, `hsl(${24 + flicker * 12} 100% 62%)`);
      g.addColorStop(1, '#FFD36E');
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    },
  },
};

export const SKIN_IDS = Object.keys(SKINS);
export const skinsUnlockedAt = (stars) =>
  SKIN_IDS.filter((id) => stars >= (SKINS[id].unlockAt || 0));

/* ------------------------------------------------------------- small utils */

/** Deterministic PRNG so stars and specks stay put between frames. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

/** Blend two hex colours, `amount` 0..1 toward `b`. */
export function mix(a, b, amount) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const t = Math.max(0, Math.min(1, amount));
  return `rgb(${Math.round(r1 + (r2 - r1) * t)}, ${Math.round(g1 + (g2 - g1) * t)}, ${Math.round(b1 + (b2 - b1) * t)})`;
}

/* --------------------------------------------------------------- the ghost */

const HULL_BONES = [
  [LM.L_SHOULDER, LM.R_SHOULDER], [LM.L_SHOULDER, LM.L_ELBOW], [LM.L_ELBOW, LM.L_WRIST],
  [LM.R_SHOULDER, LM.R_ELBOW], [LM.R_ELBOW, LM.R_WRIST],
  [LM.L_SHOULDER, LM.L_HIP], [LM.R_SHOULDER, LM.R_HIP], [LM.L_HIP, LM.R_HIP],
  [LM.L_HIP, LM.L_KNEE], [LM.L_KNEE, LM.L_ANKLE], [LM.L_ANKLE, LM.L_FOOT],
  [LM.R_HIP, LM.R_KNEE], [LM.R_KNEE, LM.R_ANKLE], [LM.R_ANKLE, LM.R_FOOT],
];

export function createGhostRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  // Where the body silhouette is assembled before the skin is painted into it.
  const shape = document.createElement('canvas');
  const shapeCtx = shape.getContext('2d');
  // Skins are painted here first, with normal compositing, then stamped into the
  // silhouette in a single operation. Painting them straight into the shape under
  // `source-in` would make every stroke after the first erase the one before it.
  const paint = document.createElement('canvas');
  const paintCtx = paint.getContext('2d');
  // Raw mask pixels at model resolution.
  const maskCanvas = document.createElement('canvas');
  const maskCtx = maskCanvas.getContext('2d');

  let quality = 'mask';
  let drawMs = 0;
  let slowFrames = 0;

  function ensureSize(w, h, dpr) {
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    for (const c of [shape, paint]) {
      if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    }
    shapeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Paints one person's mask into the shape layer, in video space. */
  function stampMask(mask, rotation, rect) {
    const { data, width, height } = mask;
    if (maskCanvas.width !== width || maskCanvas.height !== height) {
      maskCanvas.width = width;
      maskCanvas.height = height;
    }
    const img = maskCtx.createImageData(width, height);
    const px = img.data;
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      px[j] = 255; px[j + 1] = 255; px[j + 2] = 255;
      px[j + 3] = data[i];
    }
    maskCtx.putImageData(img, 0, 0);

    // The mask lives in whatever rotation the detector used, so spin it back.
    const swap = rotation % 180 !== 0;
    const mw = swap ? rect.h : rect.w;
    const mh = swap ? rect.w : rect.h;
    shapeCtx.save();
    shapeCtx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    shapeCtx.rotate((-rotation * Math.PI) / 180);
    // A touch of blur turns a hard cut-out into something that reads as a glow.
    shapeCtx.filter = 'blur(2px)';
    shapeCtx.drawImage(maskCanvas, -mw / 2, -mh / 2, mw, mh);
    shapeCtx.filter = 'none';
    shapeCtx.restore();
  }

  /** Fallback body built from the skeleton when there is no usable mask. */
  function stampHull(landmarks, project, scalePx) {
    const limb = Math.max(10, scalePx * 0.22);
    shapeCtx.save();
    shapeCtx.filter = 'blur(3px)';
    shapeCtx.strokeStyle = '#fff';
    shapeCtx.fillStyle = '#fff';
    shapeCtx.lineCap = 'round';
    shapeCtx.lineJoin = 'round';

    for (const [a, b] of HULL_BONES) {
      const p = landmarks[a], q = landmarks[b];
      if (!p || !q) continue;
      const pa = project(p), pb = project(q);
      // Torso and thighs are thicker than forearms and shins.
      const thick = a === LM.L_SHOULDER && b === LM.R_SHOULDER ? limb * 1.5 : limb;
      shapeCtx.lineWidth = thick;
      shapeCtx.beginPath();
      shapeCtx.moveTo(pa.x, pa.y);
      shapeCtx.lineTo(pb.x, pb.y);
      shapeCtx.stroke();
    }
    // Fill the torso so it reads as a body rather than a wire frame.
    const corners = [LM.L_SHOULDER, LM.R_SHOULDER, LM.R_HIP, LM.L_HIP].map((i) => landmarks[i]);
    if (corners.every(Boolean)) {
      shapeCtx.beginPath();
      corners.map(project).forEach((pt, i) => (i ? shapeCtx.lineTo(pt.x, pt.y) : shapeCtx.moveTo(pt.x, pt.y)));
      shapeCtx.closePath();
      shapeCtx.fill();
    }
    const head = landmarks[LM.NOSE];
    if (head) {
      const h = project(head);
      shapeCtx.beginPath();
      shapeCtx.arc(h.x, h.y, limb * 0.95, 0, Math.PI * 2);
      shapeCtx.fill();
    }
    shapeCtx.restore();
  }

  return {
    get quality() { return quality; },
    setQuality(q) { quality = q; },
    get drawMs() { return drawMs; },

    /**
     * Paints the background and every visible body.
     *
     * @param {object} o
     * @param {HTMLVideoElement} o.video
     * @param {Array} o.people  [{ landmarks, mask, maskRotation }]
     * @param {Array} o.styles  per-person { color, skin, label } in the same order
     * @param {boolean} o.showCamera  false = ghost-only (default)
     * @param {number} o.time  ms, for animated skins
     * @param {{w:number,h:number,dpr:number}} o.view
     */
    render({ video, people = [], styles = [], showCamera = false, time = 0, view }) {
      const t0 = performance.now();
      const { w, h, dpr } = view;
      const rect = coverRect(video?.videoWidth, video?.videoHeight, w, h);
      const project = projectWith(rect);

      ctx.clearRect(0, 0, w, h);

      let drewCamera = false;
      if (showCamera && video) {
        try {
          ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';   // lift it toward the light theme
          ctx.fillRect(0, 0, w, h);
          drewCamera = true;
        } catch {
          // Video not ready to paint yet — fall through to the soft background
          // rather than letting one bad frame kill the render loop.
        }
      }
      if (!drewCamera) {
        const bg = ctx.createLinearGradient(0, 0, w * 0.4, h);
        bg.addColorStop(0, '#FDF6F8');
        bg.addColorStop(0.55, '#F3F1FB');
        bg.addColorStop(1, '#EAF6F5');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
      }

      ensureSize(w, h, dpr);

      people.forEach((person, i) => {
        const style = styles[i] || styles[0] || { color: '#FF8FB1', skin: 'glow' };
        const skin = SKINS[style.skin] || SKINS.glow;
        if (!person?.landmarks) return;

        // 1. Build the silhouette.
        shapeCtx.clearRect(0, 0, w, h);
        const usableMask = person.mask && quality === 'mask';
        if (usableMask) {
          stampMask(person.mask, person.maskRotation || 0, rect);
        } else {
          const ls = person.landmarks[LM.L_SHOULDER];
          const lh = person.landmarks[LM.L_HIP];
          const scalePx = ls && lh
            ? Math.hypot((ls.x - lh.x) * rect.w, (ls.y - lh.y) * rect.h)
            : rect.h * 0.25;
          stampHull(person.landmarks, project, scalePx);
        }

        // 2. Paint the skin on its own layer, then stamp it into the silhouette
        //    in one composite so multi-step skins survive intact.
        paintCtx.save();
        paintCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintCtx.clearRect(0, 0, w, h);
        skin.paint(paintCtx, { x: 0, y: 0, w, h }, time, style.color);
        paintCtx.restore();

        shapeCtx.save();
        shapeCtx.globalCompositeOperation = 'source-in';
        shapeCtx.drawImage(paint, 0, 0, w, h);
        shapeCtx.restore();

        // 3. Halo, bloom, then the body itself. Everything is additive: no
        //    erase-based tricks, which would punch holes in the background.
        ctx.save();
        if (showCamera) {
          // A soft white halo lifts the figure off a busy room.
          ctx.globalAlpha = 0.4;
          ctx.filter = 'blur(9px)';
          ctx.drawImage(shape, -w * 0.008, -h * 0.008, w * 1.016, h * 1.016);
        }
        ctx.globalAlpha = showCamera ? 0.55 : 0.45;
        ctx.filter = 'blur(14px)';
        ctx.drawImage(shape, 0, 0, w, h);
        ctx.filter = 'none';
        ctx.globalAlpha = quality === 'outline' ? 0.4 : (showCamera ? 0.92 : 0.88);
        ctx.drawImage(shape, 0, 0, w, h);
        ctx.restore();

        if (style.label) {
          const hip = person.landmarks[LM.L_HIP];
          const head = person.landmarks[LM.NOSE] || hip;
          if (head) {
            const pt = project(head);
            ctx.save();
            ctx.font = '600 15px ui-rounded, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(20,16,32,0.55)';
            ctx.fillText(style.label, pt.x, pt.y - 26);
            ctx.restore();
          }
        }
      });

      // Watch our own cost and step down before the whole thing gets sticky.
      const cost = performance.now() - t0;
      drawMs = drawMs ? drawMs * 0.85 + cost * 0.15 : cost;
      if (drawMs > 16) {
        slowFrames += 1;
        if (slowFrames > 45) {
          quality = quality === 'mask' ? 'outline' : 'hull';
          slowFrames = 0;
          drawMs = 0;
        }
      } else {
        slowFrames = Math.max(0, slowFrames - 1);
      }

      return { rect, project };
    },
  };
}
