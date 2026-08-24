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

export const MOODS = ['happy', 'content', 'excited', 'sleepy', 'squint', 'sulk'];

/* -------------------------------------------------------------------- skins
 *
 * Every colourway is one entry. The renderer never learns a colour name, so
 * adding a hue is adding an object here and nothing else.
 *
 * All six are measured, not invented, and all six come out of the same pipeline:
 * each reference photograph is decoded, its silhouette found, its interior taken
 * as the median of a grid across the lower torso — low enough to miss the dome
 * specular — and its bands read off a ring just inside the outline, all the way
 * round, where the interference colours actually live.
 *
 * `wash` is then solved rather than picked, and solved for the *ratio* rather
 * than the colour. A bubble is a filter: what it does is multiply whatever is
 * behind it. So each entry reproduces how much its reference darkened its own
 * ground, applied to this app's background. Matching absolute colours instead
 * turns pearl into charcoal, because her lilac reference stands on cream while
 * the app stands on near-white.
 *
 * The band search relaxes its thresholds until each skin yields seven. Peach and
 * butter are genuinely narrow-hue objects — their whole interference range sits
 * in a slice a fifth the width of blossom's — so fixed thresholds would hand back
 * two bands for them and seven for the others.
 */

export const SKINS = [
  {
    id: 'pearl',
    name: 'Pearl',
    wash: '#908FBF',
    bands: [
      '#C8EDF8', '#BFD0E6', '#B1B8DA', '#B5AAD8',
      '#D8C1ED', '#F4D0BF', '#F6E5C8',
    ],
    contour: 'rgba(124,123,171,0.32)',
    specular: 'rgba(255,255,255,0.92)',
  },   // interior #C4B9C1 on #E8DAD1 -> #D6D1E0 here, 7 bands
  {
    id: 'blossom',
    name: 'Blossom',
    wash: '#C852A8',
    bands: [
      '#D5B0EB', '#E3BDE8', '#FEC4F7', '#ECABD6',
      '#EEA8C3', '#F9BEC6', '#F8D9D0',
    ],
    contour: 'rgba(180,62,148,0.32)',
    specular: 'rgba(255,255,255,0.92)',
  },   // interior #EABED9 on #FDFAF4 -> #EABBD8 here, 7 bands
  {
    id: 'sky',
    name: 'Sky',
    wash: '#51B7F3',
    bands: [
      '#D2FDFD', '#A1EFFE', '#99CAED', '#B7D6FE',
      '#CDD9FE', '#D6DAFE', '#DBD9FF',
    ],
    contour: 'rgba(61,163,223,0.32)',
    specular: 'rgba(255,255,255,0.92)',
  },   // interior #BFE2F6 on #FDF9F6 -> #BFDFF3 here, 7 bands
  {
    id: 'peach',
    name: 'Peach',
    wash: '#FD865E',
    bands: [
      '#FDD1D9', '#FCCBCC', '#FEC6B8', '#F7B28D',
      '#FED3A9', '#FCF0D5', '#FAF8E3',
    ],
    contour: 'rgba(233,114,74,0.32)',
    specular: 'rgba(255,255,255,0.92)',
  },   // interior #FED2BF on #FEFBF5 -> #FDCEBD here, 7 bands
  {
    id: 'mint',
    name: 'Mint',
    wash: '#54BD9D',
    bands: [
      '#E4F0CA', '#E0FAC9', '#D0F2C7', '#BEF1C4',
      '#A6F1C3', '#9EF4D4', '#C4FDF4',
    ],
    contour: 'rgba(64,169,137,0.32)',
    specular: 'rgba(255,255,255,0.92)',
  },   // interior #C1E6D5 on #FEFBF4 -> #C0E1D4 here, 7 bands
  {
    id: 'butter',
    name: 'Butter',
    wash: '#E7B23C',
    bands: [
      '#F9EEE6', '#F7E9D7', '#F6D48D', '#FEE991',
      '#FDFBD5', '#F3F4E3', '#EEF5E3',
    ],
    contour: 'rgba(211,158,40,0.32)',
    specular: 'rgba(255,255,255,0.92)',
  },   // interior #F5E1B2 on #FDFAF4 -> #F5DDB1 here, 7 bands
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
 * One material, shared by the creature and by everything she will wear, defined
 * in styles/tokens.css so the whole thing can be retuned from one place.
 *
 * Every value falls back if the stylesheet has not loaded or a name is
 * misspelled. That matters more than it sounds: a bad `--bubble-opacity` would
 * otherwise resolve to NaN, and a NaN globalAlpha silently draws nothing at all.
 */

export const MATERIAL_DEFAULTS = {
  opacity: 0.72,
  highlight: 'rgba(255,255,255,0.80)',
  edgeHighlight: 'rgba(255,255,255,0.55)',
  shadow: 'rgba(80,70,85,0.10)',
  iridescent: [
    'rgba(255,190,235,0.30)',
    'rgba(185,225,255,0.30)',
    'rgba(220,200,255,0.25)',
    'rgba(255,235,170,0.22)',
  ],
  blur: 10,
  gloss: 0.85,
};

const MATERIAL_VARS = {
  opacity: '--bubble-opacity',
  highlight: '--bubble-highlight',
  edgeHighlight: '--bubble-edge-highlight',
  shadow: '--bubble-shadow',
  blur: '--bubble-blur',
  gloss: '--bubble-gloss',
};

const IRIDESCENT_VARS = [
  '--bubble-iridescent-pink',
  '--bubble-iridescent-blue',
  '--bubble-iridescent-lilac',
  '--bubble-iridescent-yellow',
];

/**
 * @param {(name: string) => string} read a custom-property lookup
 * @returns {typeof MATERIAL_DEFAULTS}
 */
export function parseMaterial(read) {
  const num = (name, fallback) => {
    const v = parseFloat(String(read(name) ?? '').trim());
    return Number.isFinite(v) ? v : fallback;
  };
  const col = (name, fallback) => {
    const v = String(read(name) ?? '').trim();
    // Anything that isn't a colour we can actually reason about is refused, so a
    // typo degrades to the default rather than to a transparent creature.
    return scaleAlpha(v, 1) ? v : fallback;
  };

  return {
    opacity: Math.max(0, Math.min(1, num(MATERIAL_VARS.opacity, MATERIAL_DEFAULTS.opacity))),
    highlight: col(MATERIAL_VARS.highlight, MATERIAL_DEFAULTS.highlight),
    edgeHighlight: col(MATERIAL_VARS.edgeHighlight, MATERIAL_DEFAULTS.edgeHighlight),
    shadow: col(MATERIAL_VARS.shadow, MATERIAL_DEFAULTS.shadow),
    iridescent: IRIDESCENT_VARS.map((v, i) => col(v, MATERIAL_DEFAULTS.iridescent[i])),
    blur: Math.max(0, num(MATERIAL_VARS.blur, MATERIAL_DEFAULTS.blur)),
    gloss: Math.max(0, Math.min(2, num(MATERIAL_VARS.gloss, MATERIAL_DEFAULTS.gloss))),
  };
}

function readMaterial() {
  try {
    const cs = getComputedStyle(document.documentElement);
    return parseMaterial((name) => cs.getPropertyValue(name));
  } catch {
    return { ...MATERIAL_DEFAULTS };
  }
}

/* ------------------------------------------------------------------- shapes
 *
 * Body units, measured off the reference photograph rather than eyeballed: the
 * figure is 1.46 wide and 2.40 tall, centred on the origin.
 *
 *   apex          y = -1.20
 *   dome          ±0.455 at its widest — a shade narrower than the hips
 *   shoulder      y = -0.40   where the arm starts to swell outward
 *   arm outer         ±0.745  at its widest, y ≈ +0.26
 *   arm tip       y = +0.56
 *   hips              ±0.50
 *   leg arch apex y = +0.73, half-width 0.147
 *   feet          y = +1.20
 */

export const TOP = -1.20;
export const BOTTOM = 1.20;

/** How far the resting silhouette reaches. Gradients are sized to this. */
export const HALF_WIDTH = 0.75;

/**
 * How far she reaches with both arms up. The canvas is sized to this, not to
 * HALF_WIDTH, or a full cheer clips against the edge.
 */
export const MAX_HALF_WIDTH = 0.79;

/** Where the outline leaves the torso and the arm begins. */
const SHOULDER = [0.475, -0.40];

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
    // swell outward from the shoulder to the widest point
    [...R(0.562, -0.270), ...R(0.746, 0.010), ...R(0.750, 0.260)],
    // the outer half of the rounded tip
    [...R(0.752, 0.430), ...R(0.716, 0.556), ...R(0.606, 0.560)],
    // Back up the underside into a real notch. The reference's arms read as
    // separate lobes because there is a visible tuck here; without the depth
    // they merge into the torso and the whole thing becomes one slab.
    [...R(0.524, 0.566), ...R(0.482, 0.516), 0.474, 0.462],
  ];

  return [
    // The dome. Broad and low rather than tall and tapered — only a shade
    // narrower than the hips, which is what the reference actually measures at.
    [0.168, -1.200, 0.450, -1.018, 0.455, -0.700],
    // down the side of the head, widening into the shoulder
    [0.462, -0.598, 0.470, -0.488, SHOULDER[0], SHOULDER[1]],
    ...arm,
    // the torso, wider at the hip so she sits rather than floats
    [0.486, 0.720, 0.500, 0.900, 0.500, 1.040],
    // the outside of the foot
    [0.500, 1.152, 0.438, 1.200, 0.346, 1.200],
    // the inside of the foot
    [0.244, 1.200, 0.162, 1.160, 0.147, 1.060],
    // up into the arch between the legs
    [0.142, 0.880, 0.100, 0.730, 0.000, 0.730],
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
function glossy(ctx, trace, { skin, mat, t, seed = 0, unit = 1, box }) {
  const { cx, cy, rx, ry } = box;

  // 0 — the outer surface, a whisper of shadow just outside the edge. Soap has a
  // darker outer skin; without this the contour has nothing to sit against.
  ctx.save();
  trace();
  ctx.strokeStyle = withAlpha(skin.wash, 0.20);
  ctx.lineWidth = unit * 0.055;
  ctx.stroke();
  ctx.restore();

  // 1 — the interior. Near-uniform and *very* light: the reference is mostly the
  // background seen through a tint, not a filled shape.
  ctx.save();
  trace();
  ctx.clip();
  const wash = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
  // A narrow spread on purpose. The wash for a dark skin is a dark colour, so an
  // alpha range that reads as a gentle gradient on a pale one blows the bottom of
  // a dark one out towards black.
  wash.addColorStop(0, withAlpha(skin.wash, 0.33));
  wash.addColorStop(0.45, withAlpha(skin.wash, 0.36));
  wash.addColorStop(1, withAlpha(skin.wash, 0.40));
  ctx.fillStyle = wash;
  ctx.fillRect(cx - rx * 1.2, cy - ry * 1.2, rx * 2.4, ry * 2.4);

  // A broad internal reflection across the upper body, which is most of what
  // makes the reference look like a volume rather than a flat fill.
  const bloom = ctx.createRadialGradient(
    cx - rx * 0.18, cy - ry * 0.42, 0, cx - rx * 0.18, cy - ry * 0.42, ry * 0.95
  );
  bloom.addColorStop(0, scaleAlpha(mat.highlight, 0.38 * mat.gloss));
  bloom.addColorStop(0.55, scaleAlpha(mat.highlight, 0.14 * mat.gloss));
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

  shell(0.085, withAlpha(skin.wash, 0.34));          // inner surface of the shell
  shell(0.055, bandGrad(drift, 0.80));               // the iridescent band
  shell(0.022, bandGrad(drift + 0.42, 0.95));        // a second, tighter band
  ctx.globalCompositeOperation = 'screen';
  shell(0.009, bandGrad(drift + 0.18, 0.90));        // the skin's own edge colour
  shell(0.006, scaleAlpha(mat.edgeHighlight, mat.gloss));   // and the material's
  ctx.restore();

  // 3 — the contour, outside the clip so it stays crisp. Cool and thin, not a
  // white outline: the reference has no white line around it anywhere.
  ctx.save();
  ctx.lineJoin = 'round';
  trace();
  ctx.strokeStyle = skin.contour;
  ctx.lineWidth = unit * 0.013;
  ctx.stroke();
  ctx.restore();
}

/**
 * Where the arm meets the torso. The silhouette is continuous there on purpose,
 * so without this line the arms read as lumps rather than limbs.
 */
function creases(ctx, skin, armLift) {
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
    ctx.strokeStyle = fade(skin.wash, 0.44);
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
  const soft = Math.max(0, Math.min(0.9, mat.blur / 22));
  const sheen = (x, y, rx, ry, rot, alpha, colour = mat.highlight) => {
    const a = alpha * mat.gloss;
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

  // the dome
  sheen(-0.252, -0.880, 0.052, 0.215, -0.16, 0.62);
  sheen(-0.172, -0.600, 0.028, 0.070, -0.16, 0.32);
  sheen(0.244, -0.910, 0.034, 0.105, 0.20, 0.26);

  // the arms
  sheen(-0.652, 0.150, 0.030, 0.180, -0.08, 0.36);
  sheen(0.652, 0.150, 0.030, 0.180, 0.08, 0.24);

  // the legs
  sheen(-0.338, 0.965, 0.032, 0.125, 0, 0.28);
  sheen(0.338, 0.965, 0.032, 0.125, 0, 0.20);

  // a cool counter-light down the right edge, the way the reference has it
  sheen(0.406, -0.320, 0.028, 0.300, 0.06, 0.32, skin.bands[5]);
}

/**
 * The face, high on the dome.
 *
 * The reference mascot has no face at all. Hers keeps one because a creature that
 * can squint at you after a fortnight is worth more than a serene blank — but it
 * is drawn small and quiet so the silhouette still carries the character.
 *
 * `content` is the enamel-pin face: two closed happy curves and no mouth.
 */
function face(ctx, cy, u, state) {
  const { blink, mood, look } = state;
  const eyeY = cy;
  const dx = u * 0.17;
  const ink = 'rgba(46,36,48,0.78)';
  const closed = blink > 0.5 || mood === 'content';

  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const ex = side * dx + look * u * 0.04;
    if (closed) {
      // an arc opening downward: the classic happy closed eye
      ctx.strokeStyle = ink;
      ctx.lineWidth = u * 0.045;
      ctx.beginPath();
      ctx.arc(ex, eyeY + u * 0.045, u * 0.078, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    } else if (mood === 'squint' || mood === 'sleepy') {
      ctx.strokeStyle = ink;
      ctx.lineWidth = u * 0.045;
      ctx.beginPath();
      ctx.arc(ex, eyeY + u * 0.03, u * 0.072, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, u * 0.05, u * 0.066, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(ex - u * 0.016, eyeY - u * 0.024, u * 0.018, 0, TAU);
      ctx.fill();
    }
  }

  // The pin has no mouth, and `content` keeps it that way.
  if (mood === 'content') return;

  const my = eyeY + u * 0.16;
  ctx.strokeStyle = ink;
  ctx.lineWidth = u * 0.04;
  ctx.beginPath();
  if (mood === 'excited') {
    ctx.arc(0, my - u * 0.04, u * 0.092, 0.14 * Math.PI, 0.86 * Math.PI);
  } else if (mood === 'sulk') {
    ctx.arc(0, my + u * 0.10, u * 0.078, 1.2 * Math.PI, 1.8 * Math.PI);
  } else if (mood === 'sleepy') {
    ctx.moveTo(-u * 0.045, my);
    ctx.lineTo(u * 0.045, my);
  } else {
    ctx.arc(0, my - u * 0.03, u * 0.074, 0.2 * Math.PI, 0.8 * Math.PI);
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
    mood: opts.mood || 'happy',
    energy: opts.energy ?? 0.55,
    aura: opts.aura !== false,
    skin: skinFor(opts.skin),
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

  let spin = 0;
  let spinVel = 0;
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

  function run(name) {
    switch (name) {
      // Both arms, not one: with a single outline the halves are mirrored, so a
      // two-armed cheer is what the geometry gives — and it suits her better.
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
    // Sized to the full reach, not the resting width, so a cheer stays in frame.
    const u = Math.min(w / (MAX_HALF_WIDTH * 2), h / 2.80);
    const skin = state.skin;
    const mat = state.material;

    ctx.save();
    ctx.translate(cx, cy);

    if (state.aura) drawAura(ctx, u * 1.05, tint(), time, state.energy);

    if (state.logo) {
      // One soft bubble, breathing, for the wordmark to sit in front of. Still in
      // pixel units here — the body-unit scale happens further down.
      const r = u * (1.05 + breathe * 0.5);
      ctx.globalAlpha = mat.opacity;
      glossy(ctx, () => circlePath(ctx, 0, 0, r), {
        skin, mat, t: time, seed: 0, unit: r, box: { cx: 0, cy: 0, rx: r, ry: r },
      });
      ctx.globalAlpha = 1;
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

    // Ground shadow, so she reads as standing on something. The material names
    // the colour; the falloff is the renderer's job — flat-filled at this alpha
    // it reads as a grey blob parked under her rather than as contact.
    ctx.save();
    ctx.translate(0, 1.28);
    ctx.scale(0.50, 0.085);
    const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    shade.addColorStop(0, mat.shadow);
    shade.addColorStop(0.55, scaleAlpha(mat.shadow, 0.55));
    shade.addColorStop(1, scaleAlpha(mat.shadow, 0));
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    ctx.restore();

    const arm = armLift.value;
    const trace = () => traceOutline(ctx, arm);
    // The shell itself is translucent — you should see the background through
    // her. The face stays fully opaque outside this block, because eyes that
    // fade into the wallpaper stop reading as eyes.
    ctx.save();
    ctx.globalAlpha = mat.opacity;
    glossy(ctx, trace, {
      skin, mat, t: time, seed: 0, unit: 1,
      box: { cx: 0, cy: 0, rx: HALF_WIDTH, ry: BOTTOM },
    });
    creases(ctx, skin, arm);
    highlights(ctx, skin, mat);
    ctx.restore();

    face(ctx, -0.780, 1, state);

    if (puff) {
      puff.r += dt * 0.34;
      puff.y -= dt * 0.9;
      puff.alpha -= dt * 0.6;
      if (puff.alpha <= 0) puff = null;
      else {
        ctx.globalAlpha = puff.alpha;
        const px = 0.42 + puff.x, py = -0.52 + puff.y;
        glossy(ctx, () => circlePath(ctx, px, py, puff.r), {
          skin, mat, t: time, seed: 8, unit: puff.r,
          box: { cx: px, cy: py, rx: puff.r, ry: puff.r },
        });
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }

  const api = {
    setMood(m) { if (MOODS.includes(m)) state.mood = m; },
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
