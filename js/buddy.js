/**
 * buddy.js — the creature, and the aura behind her.
 *
 * An original character: one continuous soap-bubble silhouette — a domed head
 * running straight into a torso, two arms bulging off the sides, two legs cut by
 * an arch. Not a body with parts stuck on it. That distinction is the whole
 * point: the previous version drew arms and feet as separate ellipses and they
 * read as loose bubbles resting against her rather than as limbs.
 *
 * Drawn entirely in code, so it costs nothing to download, can be recoloured from
 * a table, and can be animated rather than being a picture.
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

/* --------------------------------------------------------------- faces
 *
 * The ten variants from the design system. Default is dot eyes and a small
 * curved smile.
 */
export const FACES = [
  'default', 'happy', 'neutral', 'wink', 'sleepy',
  'blink', 'cheerful', 'content', 'surprised', 'playful',
];

/** Kept as an alias: everything upstream still talks about moods. */
export const MOODS = FACES;

/**
 * How each face sits in the body.
 *
 * She has no dialogue and one silhouette, so posture is the other half of every
 * expression — and it is what still reads at icon size, where a two-pixel mouth
 * does not.
 *
 *   tilt     lean, in radians
 *   slump    downward squash; negative stretches her taller
 *   bob      how far the idle float travels
 *   rate     how fast she breathes, as a multiple of resting
 *   droop    how far the arms hang
 */
export const POSTURE = {
  default:   { tilt: 0.00, slump: 0.00, bob: 1.00, rate: 1.00, droop: 0.00 },
  happy:     { tilt: 0.02, slump: -0.04, bob: 1.25, rate: 1.20, droop: -0.10 },
  neutral:   { tilt: 0.00, slump: 0.03, bob: 0.70, rate: 0.85, droop: 0.06 },
  wink:      { tilt: -0.05, slump: 0.00, bob: 1.05, rate: 1.05, droop: -0.04 },
  sleepy:    { tilt: 0.09, slump: 0.16, bob: 0.45, rate: 0.45, droop: 0.34 },
  blink:     { tilt: 0.00, slump: 0.01, bob: 0.95, rate: 1.00, droop: 0.00 },
  cheerful:  { tilt: 0.00, slump: -0.10, bob: 1.85, rate: 1.70, droop: -0.30 },
  content:   { tilt: 0.03, slump: 0.04, bob: 0.75, rate: 0.80, droop: 0.05 },
  surprised: { tilt: 0.00, slump: -0.12, bob: 1.10, rate: 1.45, droop: -0.22 },
  playful:   { tilt: -0.07, slump: 0.02, bob: 1.30, rate: 1.25, droop: -0.12 },
};

export function postureFor(face) {
  return POSTURE[face] || POSTURE.default;
}

/* -------------------------------------------------------------------- skins
 *
 * A skin is an id, a name and its interference bands. Its colour is NOT stored
 * here — it comes from the --bubble-<id> token and the paint is solved from
 * that, so the stylesheet is the only place her hue is written down and the two
 * cannot drift apart.
 *
 * `bands` are measured off the close-up photographs: a ring sampled just inside
 * the silhouette, all the way round, where the interference colours live. The
 * spec asks for these to be used sparingly, and they are drawn that way.
 */

export const SKINS = [
  {
    id: 'pink', name: 'Bubble Pink',
    bands: ['#D5B0EB', '#E3BDE8', '#FEC4F7', '#ECABD6',
            '#EEA8C3', '#F9BEC6', '#F8D9D0'],
  },
  {
    id: 'blue', name: 'Bubble Blue',
    bands: ['#D2FDFD', '#A1EFFE', '#99CAED', '#B7D6FE',
            '#CDD9FE', '#D6DAFE', '#DBD9FF'],
  },
  {
    id: 'peach', name: 'Bubble Peach',
    bands: ['#FDD1D9', '#FCCBCC', '#FEC6B8', '#F7B28D',
            '#FED3A9', '#FCF0D5', '#FAF8E3'],
  },
  {
    id: 'mint', name: 'Bubble Mint',
    bands: ['#E4F0CA', '#E0FAC9', '#D0F2C7', '#BEF1C4',
            '#A6F1C3', '#9EF4D4', '#C4FDF4'],
  },
  {
    id: 'cream', name: 'Bubble Cream',
    bands: ['#F9EEE6', '#F7E9D7', '#F6D48D', '#FEE991',
            '#FDFBD5', '#F3F4E3', '#EEF5E3'],
  },
];

const SKIN_BY_ID = new Map(SKINS.map((s) => [s.id, s]));

/** Always returns a skin — an unknown id falls back rather than drawing nothing. */
export function skinFor(id) {
  return SKIN_BY_ID.get(id) || SKINS[0];
}

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

/** Rescale an existing rgba()/#hex colour's alpha. Returns null if unparseable. */
function scaleAlpha(colour, factor) {
  const m = String(colour).match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/i
  );
  if (m) {
    const a = m[4] === undefined ? 1 : parseFloat(m[4]);
    return `rgba(${+m[1]},${+m[2]},${+m[3]},${Math.max(0, Math.min(1, a * factor))})`;
  }
  if (/^#[0-9a-f]{3,8}$/i.test(String(colour).trim())) {
    return withAlpha(String(colour).trim(), Math.max(0, Math.min(1, factor)));
  }
  return null;
}

/* ---------------------------------------------------------- the material
 *
 * Design system v1.0, read from styles/tokens.css at draw time so the whole
 * material retunes from one place — and so an accessory is made of the same
 * stuff she is by construction rather than by matching numbers by hand.
 *
 * Every value falls back if the stylesheet has not loaded or a name is
 * misspelled. That matters more than it sounds: a bad --bubble-body-opacity
 * would otherwise resolve to NaN, and a NaN globalAlpha silently draws nothing.
 */

export const MATERIAL_DEFAULTS = {
  palette: {
    pink: '#EDCCE7',
    blue: '#D0E9EF',
    peach: '#F8DACF',
    mint: '#D8EFEB',
    cream: '#F4F0D7',
  },
  bg: '#FBF8F0',
  faceInk: '#2F2D27',
  highlight: 'rgba(255,255,255,0.78)',
  shadow: 'rgba(80,70,85,0.10)',
  shadowBlur: 24,
  iridescent: [
    'rgba(255,190,235,0.24)',
    'rgba(185,225,255,0.24)',
    'rgba(220,200,255,0.22)',
    'rgba(255,235,170,0.18)',
  ],
  bodyOpacity: 0.76,
  accessoryOpacity: 0.64,
  expression: 0.6,
};

const MATERIAL_VARS = {
  bg: '--bubble-bg',
  faceInk: '--bubble-face',
  highlight: '--bubble-highlight',
  shadow: '--bubble-shadow',
  shadowBlur: '--bubble-shadow-blur',
  bodyOpacity: '--bubble-body-opacity',
  accessoryOpacity: '--bubble-accessory-opacity',
  expression: '--bubble-expression',
  radius: '--bubble-radius',
};

const IRIDESCENT_VARS = [
  '--bubble-iridescent-pink',
  '--bubble-iridescent-blue',
  '--bubble-iridescent-lilac',
  '--bubble-iridescent-gold',
];

/**
 * The centre stop of the interior gradient. Exported because the wash solve has
 * to know it — the paint and the alpha it is seen through are two halves of one
 * calculation and must not drift apart.
 */
export const CENTRE_ALPHA = 0.46;

/**
 * The paint that renders as `base` when laid over `bg` at `alpha`.
 *
 * The alpha here is the product of two: the interior gradient's centre stop and
 * the body opacity. So the paint comes out far more saturated than the colour it
 * produces, and is not meant to be read by eye. Deriving it rather than storing
 * it means a hue token is the only place her colour is written down.
 */
export function solveWash(base, bg, alpha) {
  const hex = (c, i) => parseInt(String(c).replace('#', '').slice(i, i + 2), 16) || 0;
  const a = Math.max(0.01, alpha);
  const out = [0, 2, 4].map((i) => {
    const v = (hex(base, i) - hex(bg, i) * (1 - a)) / a;
    return Math.max(0, Math.min(255, Math.round(v)));
  });
  return `#${out.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('')}`;
}

/**
 * @param {(name: string) => string} read a custom-property lookup
 * @returns {typeof MATERIAL_DEFAULTS}
 */
export function parseMaterial(read) {
  const D = MATERIAL_DEFAULTS;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const num = (name, fallback) => {
    const v = parseFloat(String(read(name) ?? '').trim());
    return Number.isFinite(v) ? v : fallback;
  };
  const col = (name, fallback) => {
    const v = String(read(name) ?? '').trim();
    // Anything that isn't a colour we can reason about is refused, so a typo
    // degrades to the default rather than to an invisible creature.
    return scaleAlpha(v, 1) ? v : fallback;
  };

  const palette = {};
  for (const id of Object.keys(D.palette)) {
    palette[id] = col(`--bubble-${id}`, D.palette[id]);
  }

  return {
    palette,
    bg: col(MATERIAL_VARS.bg, D.bg),
    faceInk: col(MATERIAL_VARS.faceInk, D.faceInk),
    highlight: col(MATERIAL_VARS.highlight, D.highlight),
    shadow: col(MATERIAL_VARS.shadow, D.shadow),
    shadowBlur: Math.max(0, num(MATERIAL_VARS.shadowBlur, D.shadowBlur)),
    iridescent: IRIDESCENT_VARS.map((v, i) => col(v, D.iridescent[i])),
    bodyOpacity: clamp01(num(MATERIAL_VARS.bodyOpacity, D.bodyOpacity)),
    accessoryOpacity: clamp01(num(MATERIAL_VARS.accessoryOpacity, D.accessoryOpacity)),
    expression: clamp01(num(MATERIAL_VARS.expression, D.expression)),
    radius: num(MATERIAL_VARS.radius, 999),
  };
}

function readMaterial() {
  try {
    const cs = getComputedStyle(document.documentElement);
    return parseMaterial((name) => cs.getPropertyValue(name));
  } catch {
    return { ...MATERIAL_DEFAULTS, radius: 999 };
  }
}

/** The colour she is actually painted, for a skin id, under a given material. */
export function washFor(skinId, mat) {
  const base = mat.palette?.[skinId] || MATERIAL_DEFAULTS.palette[skinId]
    || MATERIAL_DEFAULTS.palette.pink;
  return solveWash(base, mat.bg, CENTRE_ALPHA * mat.bodyOpacity);
}

/* ------------------------------------------------------------------- shapes
 *
 * Body units, measured off the reference photograph rather than eyeballed: the
 * figure is 1.46 wide and 2.40 tall, centred on the origin.
 *
 *   apex          y = -1.20            0% down
 *   shoulder      y = -0.42           32.5% down, where the dome stops widening
 *   arm opens     y = -0.17           43% down
 *   arm outer         ±0.744          at its widest
 *   arm tip       y = +0.55           73% down
 *   hips              ±0.600
 *   leg arch apex y = +0.684          78.5% down, 20% of the body width across
 *   feet          y = +1.20          100% down
 *
 * Which lands inside every band the design system gives: aspect 1.488 / 2.40 =
 * 0.62, shoulder at 32.5% of 30-35%, arms opening at 43% of 42-45%, arms 12%
 * past the torso of 10-14%, arch at 78.5% of 77-80%.
 */

export const TOP = -1.20;
export const BOTTOM = 1.20;

/** How far the resting silhouette reaches. Gradients are sized to this. */
export const HALF_WIDTH = 0.744;

/**
 * How far she reaches with both arms up. The canvas is sized to this, not to
 * HALF_WIDTH, or a full cheer clips against the edge.
 */
export const MAX_HALF_WIDTH = 0.80;

/** Where the outline leaves the torso and the arm begins. */
const SHOULDER = [0.600, -0.42];

/** Distance from the shoulder to the arm tip, for weighting the swing. */
const ARM_SPAN = 0.96;

/**
 * The arm swing, as a point transform.
 *
 * Deliberately a weighted lift rather than a rotation about the shoulder. The
 * arm hangs a long way below its joint, so rotating it swings the tip out by
 * more than a fifth of the body width — at a full cheer the hands leave the
 * canvas. Translating each point in proportion to how far below the joint it
 * sits keeps the shoulder still, moves the tip most, and stays in frame.
 */
function armSwing(lift) {
  const k = Math.max(-1.2, Math.min(1.2, lift));
  if (!k) return (x, y) => [x, y];
  return (x, y) => {
    const t = Math.max(0, (y - SHOULDER[1]) / ARM_SPAN);
    return [x + k * 0.030 * t, y - k * 0.095 * t];
  };
}

/**
 * The right half of the outline, from the apex down to the arch apex, as bezier
 * segments [c1x, c1y, c2x, c2y, x, y].
 *
 * The arm section is generated rather than hard-coded so that `armLift` can move
 * it. This is the price of merging the limbs into a single path, and it is worth
 * paying: drawing the arms as separate filled shapes is exactly what produced the
 * seam that made them read as loose bubbles.
 *
 * The final arm point is *not* transformed. It is where the arm rejoins the
 * torso, and pinning it there means the swing can never tear the outline open.
 */
export function halfOutline(armLift = 0) {
  const R = armSwing(armLift);

  const arm = [
    // The arm proper opens at 43% down, below the shoulder transition at 33%.
    // The spec separates those two, and it matters: the shoulder is where the
    // dome stops widening, the arm is where a distinct limb begins.
    [...R(0.640, -0.170), ...R(0.744, 0.060), ...R(0.744, 0.290)],
    // the outer half of the rounded tip
    [...R(0.744, 0.430), ...R(0.712, 0.546), ...R(0.632, 0.550)],
    // Back up the underside into a real notch. The reference's arms read as
    // separate lobes because there is a visible tuck here; without the depth
    // they merge into the torso and the whole thing becomes one slab.
    [...R(0.582, 0.556), ...R(0.588, 0.512), 0.582, 0.462],
  ];

  return [
    // The dome. Broad and low rather than tall and tapered — only a shade
    // narrower than the hips, which is what the reference actually measures at.
    [0.208, -1.200, 0.556, -1.020, 0.562, -0.706],
    // down the side of the head, widening into the shoulder at 33% down
    [0.572, -0.604, 0.590, -0.500, SHOULDER[0], SHOULDER[1]],
    ...arm,
    // the torso, a shade wider at the hip than at the shoulder
    [0.596, 0.720, 0.600, 0.900, 0.600, 1.048],
    // the outside of the foot — rounded, never shoe-shaped
    [0.600, 1.156, 0.532, 1.200, 0.432, 1.200],
    // the inside of the foot
    [0.318, 1.200, 0.166, 1.160, 0.149, 1.048],
    // Up into the arch: it opens 78.5% down, and is 20% of the body width across.
    [0.146, 0.880, 0.100, 0.684, 0.000, 0.684],
  ];
}

/**
 * The whole silhouette as one path: the right half forward, then the same
 * segments replayed backwards and mirrored, so the two sides cannot drift apart.
 */
export function traceOutline(ctx, armLift = 0) {
  const segs = halfOutline(armLift);
  ctx.beginPath();
  ctx.moveTo(0, TOP);
  for (const s of segs) ctx.bezierCurveTo(s[0], s[1], s[2], s[3], s[4], s[5]);

  // Reversing a bezier means swapping its control points and walking to the
  // previous segment's endpoint.
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    const prev = i === 0 ? [0, TOP] : [segs[i - 1][4], segs[i - 1][5]];
    ctx.bezierCurveTo(-s[2], s[3], -s[0], s[1], -prev[0], prev[1]);
  }
  ctx.closePath();
}

function circlePath(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.closePath();
}

/**
 * The glossy pass, applied to whatever path `trace` draws.
 *
 * Four things make it read as soap rather than as a shape:
 *
 *   1. an interior that only *tints* what is behind it, near-uniform, because
 *      that is what the reference measures as;
 *   2. a wide iridescent band stroked along the path and clipped to it, so the
 *      colour hugs the inside of the silhouette and follows every curve;
 *   3. a crisp near-white contour on the outside;
 *   4. hard speculars.
 *
 * Note what this deliberately does *not* do: composite the interior with
 * `multiply`, which is what the reference physically is. The canvas is
 * transparent and the mesh gradient lives behind it in the DOM, so multiplying
 * would multiply against nothing and she would vanish. Straight alpha, with the
 * wash colour chosen to land on the measured interior over a light ground.
 */
function glossy(ctx, trace, { skin, wash: paint, mat, t, seed = 0, unit = 1, box }) {
  const { cx, cy, rx, ry } = box;

  // 0 — the outer surface, a whisper of shadow just outside the edge. Soap has a
  // darker outer skin; without this the contour has nothing to sit against.
  ctx.save();
  trace();
  ctx.strokeStyle = withAlpha(paint, 0.20);
  ctx.lineWidth = unit * 0.055;
  ctx.stroke();
  ctx.restore();

  // 1 — the interior. Near-uniform and *very* light: the reference is mostly the
  // background seen through a tint, not a filled shape.
  ctx.save();
  trace();
  ctx.clip();
  // Colour gathers in the middle and clears toward the perimeter, which is the
  // spec's central material note and the opposite of how this was built before —
  // it used to be near-uniform with the colour living at the rim.
  ctx.save();
  ctx.translate(cx, cy - ry * 0.06);
  ctx.scale(rx * 1.72, ry * 1.20);
  const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  // CENTRE_ALPHA is the first stop, and the wash was solved against exactly it.
  wash.addColorStop(0, withAlpha(paint, CENTRE_ALPHA));
  wash.addColorStop(0.42, withAlpha(paint, CENTRE_ALPHA * 0.83));
  wash.addColorStop(0.78, withAlpha(paint, CENTRE_ALPHA * 0.41));
  wash.addColorStop(1, withAlpha(paint, CENTRE_ALPHA * 0.20));
  ctx.fillStyle = wash;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();

  // A broad internal reflection across the upper body, which is most of what
  // makes the reference look like a volume rather than a flat fill.
  const bloom = ctx.createRadialGradient(
    cx - rx * 0.18, cy - ry * 0.42, 0, cx - rx * 0.18, cy - ry * 0.42, ry * 0.95
  );
  bloom.addColorStop(0, scaleAlpha(mat.highlight, 0.38));
  bloom.addColorStop(0.55, scaleAlpha(mat.highlight, 0.14));
  bloom.addColorStop(1, scaleAlpha(mat.highlight, 0));
  ctx.fillStyle = bloom;
  ctx.fillRect(cx - rx * 1.2, cy - ry * 1.2, rx * 2.4, ry * 2.4);

  // The shared interference wash: the four material colours drifting across the
  // whole surface, over whatever hue the skin puts underneath. This is the layer
  // that will make an accessory look like it is made of the same stuff she is —
  // its colour comes from the material, not from her skin.
  const sweep = (t * 0.000041 + seed * 0.17) % 1;
  const iris = ctx.createLinearGradient(
    cx - rx * 1.1, cy - ry * 0.8, cx + rx * 1.1, cy + ry * 0.9
  );
  const shades = mat.iridescent;
  for (let i = 0; i <= shades.length * 2; i++) {
    const o = i / (shades.length * 2);
    iris.addColorStop(o, shades[Math.floor((o + sweep) * shades.length) % shades.length]);
  }
  ctx.globalCompositeOperation = 'screen';

  // Weighted to the rim rather than spread over the whole surface. Interference
  // shows where the film is thin and the surface turns away, which in projection
  // is the edge — filling the body with it evenly gave mint a pink cast it has
  // nowhere in the reference. A wide clipped stroke puts it exactly there, since
  // clipping throws away the outer half.
  ctx.lineJoin = 'round';
  ctx.strokeStyle = iris;
  ctx.lineWidth = unit * 0.34;
  trace();
  ctx.stroke();

  // ...and a whisper of it across everything else, so the two are one surface.
  ctx.globalAlpha *= 0.30;
  ctx.fillStyle = iris;
  ctx.fillRect(cx - rx * 1.2, cy - ry * 1.2, rx * 2.4, ry * 2.4);
  ctx.globalAlpha /= 0.30;
  ctx.globalCompositeOperation = 'source-over';

  // 2 — the iridescent band. Stroked on the path itself and clipped, so half the
  // stroke is thrown away and what is left is a band on the inside of the edge.
  // The hue has to cycle several times across the figure, not once. With one
  // cycle both arms land on the same colour and the band reads as neon piping
  // traced around the outline; with three it reads as light splitting.
  //
  // Intensity is modulated too, so the band fades almost out where the surface
  // faces the viewer and flares where it turns away — a constant-brightness rim
  // is the other half of why a traced outline looks like a sticker.
  const CYCLES = 3;
  const bandGrad = (shift, alpha) => {
    const g = ctx.createLinearGradient(
      cx - rx, cy - ry * 0.55, cx + rx, cy + ry * 0.85
    );
    const n = skin.bands.length;
    const stops = n * CYCLES * 2;
    for (let i = 0; i <= stops; i++) {
      const o = i / stops;
      const cyc = (((o * CYCLES + shift) % 1) + 1) % 1;
      const idx = Math.floor(cyc * n) % n;
      const flare = 0.30 + 0.70 * Math.abs(Math.sin((o + shift) * Math.PI * 2.4));
      g.addColorStop(o, withAlpha(skin.bands[idx], alpha * flare));
    }
    return g;
  };

  // Clipping throws away the outer half of every stroke, so a stroke of width W
  // paints from the edge inward to W/2. Painting progressively narrower strokes
  // on top therefore leaves each one surviving as a *ring at a fixed inset* — and
  // that is how the shell gets thickness: a dark inner surface, then the bright
  // iridescent band, then the specular right at the edge.
  //
  // These are deliberately narrow. An arm is 0.26 across, so a band wide enough
  // to fill it turns the whole creature into a rainbow sticker instead of glass.
  const drift = (t * 0.00003 + seed * 0.13) % 1;

  // Round joins, or the cusp where each arm tucks back into the hip gets mitred
  // into a hard little spike that reads as a drawing error.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const shell = (width, style) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = unit * width;
    trace();
    ctx.stroke();
  };

  // The perimeter is meant to read *clearer* than the middle, so there is no
  // darkening pass here any more — only light. The bands are down to a whisper:
  // the spec asks for very subtle iridescence along the edges, and what used to
  // be a 0.80 band was reading as colour rather than as a hint of one.
  ctx.globalCompositeOperation = 'screen';
  shell(0.048, bandGrad(drift, 0.34));               // the iridescent band
  shell(0.020, bandGrad(drift + 0.42, 0.42));        // a second, tighter band

  // The rim light. This is what defines the form now that nothing is outlined:
  // a translucent object with a clear perimeter and no edge light at all stops
  // having a silhouette, and the arms simply dissolve into the torso.
  shell(0.034, scaleAlpha(mat.highlight, 0.42));
  shell(0.010, scaleAlpha(mat.highlight, 0.92));
  ctx.restore();

  // No contour. The spec says no outline, and it is right: a stroke around the
  // silhouette is the single thing that most makes a soft translucent object
  // read as a sticker of one.
}

/**
 * Where the arm meets the torso. The silhouette is continuous there on purpose,
 * so without this line the arms read as lumps rather than limbs.
 */
function creases(ctx, skin, paint, armLift) {
  const R = armSwing(armLift);
  ctx.save();
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const p = (x, y) => {
      const [sx, sy] = R(x, y);
      return [side * sx, sy];
    };

    // Faded at both ends. A crease that starts and stops at full strength reads
    // as a scratch on the surface rather than as a fold in it.
    const fade = (colour, peak) => {
      const g = ctx.createLinearGradient(0, -0.30, 0, 0.46);
      g.addColorStop(0, withAlpha(colour, 0));
      g.addColorStop(0.28, withAlpha(colour, peak));
      g.addColorStop(0.72, withAlpha(colour, peak));
      g.addColorStop(1, withAlpha(colour, 0));
      return g;
    };

    // A groove, not a line: a soft dark trough with a bright edge just outside
    // it. This is the whole reason the arms read as limbs rather than as lumps
    // on the side of a slab, since the silhouette is continuous there.
    ctx.beginPath();
    ctx.moveTo(...p(0.474, -0.260));
    ctx.bezierCurveTo(...p(0.508, 0.010), ...p(0.520, 0.250), ...p(0.498, 0.440));
    ctx.strokeStyle = fade(paint, 0.44);
    ctx.lineWidth = 0.050;
    ctx.stroke();
    ctx.strokeStyle = fade(skin.bands[4], 0.34);
    ctx.lineWidth = 0.022;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(...p(0.514, -0.250));
    ctx.bezierCurveTo(...p(0.548, 0.010), ...p(0.560, 0.250), ...p(0.538, 0.430));
    ctx.strokeStyle = fade('#FFFFFF', 0.42);
    ctx.lineWidth = 0.014;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Speculars. The dome gets the big soft one; the limbs get streaks along their
 * length, which is what stops them reading as flat in the reference.
 */
function highlights(ctx, skin, mat) {
  /**
   * A soft streak: an ellipse filled with a radial falloff rather than a flat
   * colour. Solid-filled ellipses on the dome read as horns; the same shapes
   * with a gradient read as a curved surface catching a window.
   */
  //
  // `--bubble-blur` sets how soft they are. It is spent on the gradient's falloff
  // rather than on a real `ctx.filter` blur, because a filter's radius is not
  // reliably independent of the current transform across browsers, and this
  // canvas is scaled by the body unit — the same declared radius would come out a
  // different softness at every canvas size.
  const soft = 0.45;
  const sheen = (x, y, rx, ry, rot, alpha, colour = mat.highlight) => {
    const a = alpha;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, scaleAlpha(colour, a));
    g.addColorStop(Math.max(0.12, 0.62 - soft * 0.5), scaleAlpha(colour, a * 0.6));
    g.addColorStop(1, scaleAlpha(colour, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    ctx.restore();
  };

  // Soft studio lighting: diffuse and frontal, with the specular on the right.
  // The dome keeps a gentler left sheen as the fill light.
  sheen(0.268, -0.870, 0.058, 0.235, 0.15, 0.60);
  sheen(0.196, -0.575, 0.030, 0.078, 0.15, 0.30);
  sheen(-0.238, -0.905, 0.036, 0.115, -0.19, 0.26);

  // the arms
  sheen(0.630, 0.140, 0.032, 0.175, 0.08, 0.36);
  sheen(-0.630, 0.140, 0.030, 0.175, -0.08, 0.22);

  // the legs
  sheen(0.352, 0.955, 0.034, 0.122, 0, 0.28);
  sheen(-0.352, 0.955, 0.032, 0.122, 0, 0.19);

  // a cool counter-light down the left edge, so she is not lit from one side only
  sheen(-0.428, -0.310, 0.028, 0.300, -0.06, 0.26, skin.bands[5]);
}

/* ---------------------------------------------------------------- the face
 *
 * Positions come straight from the design system, expressed as fractions of the
 * body so they hold at every size:
 *
 *   eye line     36% down from the apex   (spec 34-38)
 *   eye spacing  20% of body width        (spec 18-22)
 *   mouth line   45% down                 (spec 43-47)
 *   mouth width  12% of body width        (spec 10-14)
 *   eyes         8% wide, 11.5% tall of body width, fully rounded
 *
 * Which puts the face at the middle of the body rather than up on the dome —
 * lower than it sat before, and the thing that most changes how she reads.
 */

const BODY_W = HALF_WIDTH * 2;
const HEIGHT = BOTTOM - TOP;
const down = (f) => TOP + f * HEIGHT;

const EYE_Y = down(0.36);
const EYE_DX = BODY_W * 0.10;
const EYE_RX = BODY_W * 0.040;
const EYE_RY = BODY_W * 0.0575;
const MOUTH_Y = down(0.45);
const MOUTH_HALF = BODY_W * 0.06;
const STROKE = BODY_W * 0.022;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{face: string, blink: number, look: number}} state
 * @param {string} ink
 */
function face(ctx, state, ink) {
  const variant = state.face;
  // A blink overrides whatever she is doing, because it is involuntary.
  const blinking = state.blink > 0.5;
  const dx = EYE_DX + state.look * BODY_W * 0.012;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;

  /** A solid vertical capsule. The default eye. */
  const dot = (x) => {
    ctx.beginPath();
    ctx.roundRect(x - EYE_RX, EYE_Y - EYE_RY, EYE_RX * 2, EYE_RY * 2, EYE_RX);
    ctx.fill();
  };
  /** An arc: up = a happy eye, down = a closed sleeping one. */
  const arc = (x, up) => {
    ctx.lineWidth = STROKE;
    ctx.beginPath();
    if (up) ctx.arc(x, EYE_Y + EYE_RY * 0.55, EYE_RX * 1.25, Math.PI * 1.15, Math.PI * 1.85);
    else ctx.arc(x, EYE_Y - EYE_RY * 0.55, EYE_RX * 1.25, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  };
  /** A short flat line: the blink. */
  const line = (x) => {
    ctx.lineWidth = STROKE;
    ctx.beginPath();
    ctx.moveTo(x - EYE_RX, EYE_Y);
    ctx.lineTo(x + EYE_RX, EYE_Y);
    ctx.stroke();
  };
  /** A sideways closed eye: the wink. */
  const winkMark = (x) => {
    ctx.lineWidth = STROKE;
    ctx.beginPath();
    ctx.moveTo(x - EYE_RX * 0.9, EYE_Y - EYE_RY * 0.75);
    ctx.lineTo(x + EYE_RX * 0.9, EYE_Y);
    ctx.lineTo(x - EYE_RX * 0.9, EYE_Y + EYE_RY * 0.75);
    ctx.stroke();
  };

  const smile = (w = MOUTH_HALF, depth = 0.62) => {
    ctx.lineWidth = STROKE;
    ctx.beginPath();
    ctx.moveTo(-w, MOUTH_Y - w * depth * 0.5);
    ctx.quadraticCurveTo(0, MOUTH_Y + w * depth, w, MOUTH_Y - w * depth * 0.5);
    ctx.stroke();
  };
  const flat = () => {
    ctx.lineWidth = STROKE;
    ctx.beginPath();
    ctx.moveTo(-MOUTH_HALF * 0.7, MOUTH_Y);
    ctx.lineTo(MOUTH_HALF * 0.7, MOUTH_Y);
    ctx.stroke();
  };
  const openMouth = (rx, ry) => {
    ctx.beginPath();
    ctx.ellipse(0, MOUTH_Y + ry * 0.35, rx, ry, 0, 0, TAU);
    ctx.fill();
  };
  /** Flat on top, round underneath: an open smile rather than a dot. */
  const openSmile = (rx, ry) => {
    ctx.beginPath();
    ctx.moveTo(-rx, MOUTH_Y);
    ctx.quadraticCurveTo(0, MOUTH_Y + ry * 2.35, rx, MOUTH_Y);
    ctx.quadraticCurveTo(0, MOUTH_Y + ry * 0.30, -rx, MOUTH_Y);
    ctx.closePath();
    ctx.fill();
  };

  const eyes = { L: 'dot', R: 'dot' };
  let mouth = 'smile';

  switch (blinking ? 'blink' : variant) {
    case 'happy':     eyes.L = eyes.R = 'up'; break;
    case 'neutral':   mouth = 'flat'; break;
    case 'wink':      eyes.R = 'wink'; break;
    case 'sleepy':    eyes.L = eyes.R = 'down'; mouth = 'dot'; break;
    case 'blink':     eyes.L = eyes.R = 'line'; break;
    case 'cheerful':  mouth = 'open'; break;
    case 'content':   eyes.L = eyes.R = 'up'; break;
    case 'surprised': mouth = 'round'; break;
    case 'playful':   eyes.L = 'up'; eyes.R = 'wink'; break;
    default: break;
  }

  const drawEye = (kind, x) => {
    if (kind === 'up') arc(x, true);
    else if (kind === 'down') arc(x, false);
    else if (kind === 'line') line(x);
    else if (kind === 'wink') winkMark(x);
    else dot(x);
  };
  drawEye(eyes.L, -dx);
  drawEye(eyes.R, dx);

  if (mouth === 'flat') flat();
  else if (mouth === 'dot') openMouth(MOUTH_HALF * 0.16, MOUTH_HALF * 0.12);
  else if (mouth === 'open') openSmile(MOUTH_HALF * 0.66, MOUTH_HALF * 0.42);
  else if (mouth === 'round') openMouth(MOUTH_HALF * 0.34, MOUTH_HALF * 0.40);
  else smile();
}

/**
 * The aura: soft concentric bands drifting behind her.
 *
 * This is the only place the home screen comments on consistency, and it does it
 * without a number. `energy` runs 0..1 — bright and a little faster when she has
 * moved today, dim and slow after a gap. It brightens on good news and fades
 * quietly otherwise; it never announces a bad week.
 *
 * It stays on the scheme's accent rather than on the skin, so coral, teal and
 * mint still read as different schemes behind a creature that is always soap.
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
 * @param {{mood?: string, energy?: number, aura?: boolean, logo?: boolean,
 *          skin?: string}} [opts]
 */
export function createBuddy(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  let raf = 0;
  let running = false;
  let w = 0, h = 0;
  let last = 0;

  const state = {
    // `face` in the design system's language; `mood` is still accepted from
    // callers that predate it.
    face: opts.face || opts.mood || 'default',
    energy: opts.energy ?? 0.55,
    aura: opts.aura !== false,
    skin: skinFor(opts.bodyColor || opts.skin),
    // Read once and cached. getComputedStyle is not cheap enough for a per-frame
    // call, and these tokens are global — they do not vary by colour scheme — so
    // refreshing alongside resize() is enough.
    material: MATERIAL_DEFAULTS,
    // Logo mode draws the aura and one plain bubble to sit behind the wordmark —
    // no face, no limbs. Same material, so the mark and the character can never
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
  // Posture is sprung too, so changing mood is her settling into a new stance
  // rather than teleporting into it.
  const tilt = makeSpring(0, 90, 14);
  const slump = makeSpring(0, 90, 14);
  const droop = makeSpring(0, 90, 14);
  let bob = 1, rate = 1;

  let spin = 0;
  let spinVel = 0;
  // Accumulated rather than derived from the clock, so changing breathing rate
  // speeds her up instead of jumping her to a different point in the cycle.
  let phase = 0;
  let puff = null;
  const queue = [];
  let busyUntil = 0;

  function resize() {
    state.material = readMaterial();
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

  // The design system's animation states, mapped onto the one-shots that already
  // exist. Keeping both means the states are a vocabulary rather than a rewrite.
  const STATES = {
    idle: null,
    bounce: 'bounce',
    celebrate: 'wave',
    thinking: 'wobble',
    sleepy: 'yawn',
    success: 'pop',
  };

  function run(name) {
    const mapped = name in STATES ? STATES[name] : name;
    if (mapped === null) return;
    if (mapped !== name) return run(mapped);
    switch (name) {
      // Both arms, not one: with a single outline the halves are mirrored, so a
      // two-armed cheer is what the geometry gives — and it suits her better.
      case 'wave': nudge(armLift, 9); nudge(lean, 1.6); busyUntil = 700; break;
      case 'spin': spinVel = 7.4; busyUntil = 900; break;
      case 'bounce': nudge(lift, 9); nudge(squash, 5); busyUntil = 620; break;
      case 'yawn': state.face = 'sleepy'; nudge(squash, -4.5); busyUntil = 800; break;
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

    // Read once at the top of the frame: the posture step below needs it, and so
    // does everything that draws.
    const mat = state.material;

    // one-shot animations, queued rather than interrupting each other
    busyUntil -= dt * 1000;
    if (busyUntil <= 0 && queue.length) run(queue.shift());

    stepSpring(squash, dt);
    stepSpring(lift, dt);
    stepSpring(lean, dt);
    stepSpring(armLift, dt);

    // Every channel is scaled toward neutral by --bubble-expression. Note that
    // bob and rate are multipliers around 1, so "less expressive" means moving
    // them toward 1 rather than toward 0 — scaling those the same way as tilt
    // would freeze her breathing instead of calming it.
    const post = postureFor(state.face);
    const e = mat.expression;
    tilt.target = post.tilt * e;
    slump.target = post.slump * e;
    droop.target = post.droop * e;
    stepSpring(tilt, dt);
    stepSpring(slump, dt);
    stepSpring(droop, dt);
    bob += ((1 + (post.bob - 1) * e) - bob) * Math.min(1, dt * 4);
    rate += ((1 + (post.rate - 1) * e) - rate) * Math.min(1, dt * 4);
    if (Math.abs(spinVel) > 0.001) {
      spin += spinVel * dt;
      spinVel *= Math.pow(0.12, dt);
      if (Math.abs(spinVel) < 0.02) { spinVel = 0; spin = 0; }
    }

    // idle: a slow float with a matching breath, so she feels buoyant. Both the
    // travel and the speed come from the mood, which is what makes an excited
    // creature visibly different from a sulking one with no face on either.
    phase += dt * 0.0011 * rate * 1000;
    const float = Math.sin(phase) * 0.03 * bob;
    const breathe = Math.sin(phase + Math.PI / 2) * 0.025 * bob;

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
    // Sized to the full reach, not the resting width, so a cheer stays in frame.
    const u = Math.min(w / (MAX_HALF_WIDTH * 2), h / 2.80);
    const skin = state.skin;
    const wash = washFor(skin.id, mat);

    ctx.save();
    ctx.translate(cx, cy);

    if (state.aura) drawAura(ctx, u * 1.05, tint(), time, state.energy);

    if (state.logo) {
      // One soft bubble, breathing, for the wordmark to sit in front of. Still in
      // pixel units here — the body-unit scale happens further down.
      const r = u * (1.05 + breathe * 0.5);
      ctx.globalAlpha = mat.bodyOpacity;
      glossy(ctx, () => circlePath(ctx, 0, 0, r), {
        skin, wash, mat, t: time, seed: 0, unit: r,
        box: { cx: 0, cy: 0, rx: r, ry: r },
      });
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }

    ctx.translate(0, (float + lift.value * 0.06) * u);
    if (spin) ctx.rotate(spin);
    ctx.rotate(lean.value * 0.05 + tilt.value);
    ctx.scale(
      (1 + breathe + squash.value * 0.05 + slump.value * 0.35) * u,
      (1 - breathe - squash.value * 0.035 - slump.value * 0.30) * u
    );

    // Ground shadow, so she reads as standing on something. The material names
    // the colour; the falloff is the renderer's job — flat-filled at this alpha
    // it reads as a grey blob parked under her rather than as contact.
    ctx.save();
    // The blur token is in px at a nominal 100px-wide mascot, so it scales with
    // her rather than staying a fixed size as the canvas grows.
    const spread = 1 + (mat.shadowBlur / 100) * 1.4;
    ctx.translate(0, 1.26);
    ctx.scale(0.52 * spread, 0.085 * spread);
    const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    shade.addColorStop(0, mat.shadow);
    shade.addColorStop(0.55, scaleAlpha(mat.shadow, 0.55));
    shade.addColorStop(1, scaleAlpha(mat.shadow, 0));
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    ctx.restore();

    // A drooping arm is a lowered one, so the posture rides the same channel the
    // cheer does.
    const arm = armLift.value - droop.value;
    const trace = () => traceOutline(ctx, arm);
    // The shell itself is translucent — you should see the background through
    // her. The face stays fully opaque outside this block, because eyes that
    // fade into the wallpaper stop reading as eyes.
    ctx.save();
    ctx.globalAlpha = mat.bodyOpacity;
    glossy(ctx, trace, {
      skin, wash, mat, t: time, seed: 0, unit: 1,
      box: { cx: 0, cy: 0, rx: HALF_WIDTH, ry: BOTTOM },
    });
    creases(ctx, skin, wash, arm);
    highlights(ctx, skin, mat);
    ctx.restore();

    face(ctx, state, mat.faceInk);

    if (puff) {
      puff.r += dt * 0.34;
      puff.y -= dt * 0.9;
      puff.alpha -= dt * 0.6;
      if (puff.alpha <= 0) puff = null;
      else {
        ctx.globalAlpha = puff.alpha;
        const px = 0.42 + puff.x, py = -0.52 + puff.y;
        glossy(ctx, () => circlePath(ctx, px, py, puff.r), {
          skin, wash, mat, t: time, seed: 8, unit: puff.r,
          box: { cx: px, cy: py, rx: puff.r, ry: puff.r },
        });
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }

  const api = {
    setFace(f) { if (FACES.includes(f)) state.face = f; },
    /** Kept for callers that predate the design system's naming. */
    setMood(m) { api.setFace(m); },
    setEnergy(e) { state.energy = Math.max(0, Math.min(1, e)); },
    setSkin(id) { state.skin = skinFor(id); },

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

  if (days === null) return { face: 'cheerful', anim: 'celebrate', gap: 'new' };
  if (days >= 14) return { face: 'playful', anim: 'celebrate', gap: 'ages' };
  if (days >= 5) return { face: 'wink', anim: 'bounce', gap: 'a while' };
  if (hour >= 22 || hour < 5) return { face: 'sleepy', anim: 'sleepy', gap: 'late' };
  if (days <= 1) return { face: 'cheerful', anim: 'bounce', gap: 'recent' };
  return { face: 'content', anim: 'idle', gap: 'normal' };
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
