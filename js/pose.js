/**
 * pose.js — camera plumbing plus the MediaPipe Pose Landmarker.
 *
 * The model runs entirely on-device: no frame ever leaves the phone. The
 * library and the .task weights are fetched from a CDN on first use and then
 * cached by the browser (and by the service worker for the library itself).
 */

const DEFAULT_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

/**
 * Everything can be self-hosted for fully offline use: drop vision_bundle.mjs,
 * the wasm/ folder and the .task model in one directory and point the app at it
 * with ?poseBase=/vendor (remembered afterwards). See README.
 */
function poseBase() {
  try {
    const fromUrl = new URLSearchParams(location.search).get('poseBase');
    if (fromUrl) localStorage.setItem('aura.poseBase', fromUrl);
    return fromUrl || localStorage.getItem('aura.poseBase') || '';
  } catch { return ''; }
}

const BASE = poseBase();
const CDN = BASE || DEFAULT_CDN;
const WASM = `${CDN}/wasm`;
const MODELS = BASE
  ? { lite: `${BASE}/pose_landmarker_lite.task`, full: `${BASE}/pose_landmarker_full.task` }
  : {
      lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
    };

let visionModule = null;
let landmarker = null;
let landmarkerKey = '';
let loadingPromise = null;

async function loadVision() {
  if (visionModule) return visionModule;
  // jsDelivr serves the ESM bundle directly; the bare package URL is kept as a
  // fallback in case the file layout changes in a future release.
  const candidates = [`${CDN}/vision_bundle.mjs`, CDN];
  let lastErr;
  for (const url of candidates) {
    try {
      visionModule = await import(/* @vite-ignore */ url);
      return visionModule;
    } catch (err) { lastErr = err; }
  }
  throw new Error(`Could not load the pose library (${lastErr?.message || lastErr}). Check your connection.`);
}

/**
 * Loads (once) and returns the shared PoseLandmarker.
 *
 * `segmentation` asks the model for a per-pixel body mask as well as landmarks —
 * that mask is what makes the ghost contour to your actual body instead of being
 * a stick figure. `players` is how many bodies to look for at once.
 */
export async function getLandmarker({ model = 'lite', segmentation = true, players = 1 } = {}) {
  const wanted = `${model}:${segmentation}:${players}`;
  if (landmarker && landmarkerKey === wanted) return landmarker;
  if (loadingPromise && landmarkerKey === wanted) return loadingPromise;

  // Options are baked in at creation, so changing them means a new instance.
  if (landmarker) { try { landmarker.close(); } catch { /* already gone */ } landmarker = null; }
  landmarkerKey = wanted;

  loadingPromise = (async () => {
    const vision = await loadVision();
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODELS[model] || MODELS.lite, delegate },
      runningMode: 'VIDEO',
      numPoses: Math.max(1, Math.min(4, players)),
      outputSegmentationMasks: segmentation,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      landmarker = await vision.PoseLandmarker.createFromOptions(fileset, options('GPU'));
    } catch (err) {
      // Plenty of phones have no usable WebGL delegate; CPU is slower but works.
      console.warn('GPU delegate unavailable, falling back to CPU.', err);
      landmarker = await vision.PoseLandmarker.createFromOptions(fileset, options('CPU'));
    }
    return landmarker;
  })();
  try {
    return await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

export const POSE_CONNECTIONS = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [27, 31],
  [28, 30], [30, 32], [28, 32],
];

/** Landmarks we draw fatter — the feet do most of the work in this app. */
export const FOOT_POINTS = [27, 28, 29, 30, 31, 32];

/* --------------------------------------------------------------- rotation */

/**
 * Pose models are trained almost entirely on upright people, and every workout
 * here happens lying down — so a body that is horizontal in the frame detects
 * far worse than one that is vertical. The fix: rotate the frame before
 * inference until the person looks upright to the model, then map the
 * landmarks back into video space for drawing.
 *
 * Candidates are tried head-up first because that is what the model likes.
 */
export const ROTATIONS = [0, 90, 270, 180];

/** Maps a landmark from rotated-frame space back to video space. */
export function mapFromRotated(p, rotation) {
  switch (((rotation % 360) + 360) % 360) {
    case 90: return { ...p, x: p.y, y: 1 - p.x };
    case 180: return { ...p, x: 1 - p.x, y: 1 - p.y };
    case 270: return { ...p, x: 1 - p.y, y: p.x };
    default: return p;
  }
}

/** Points used to score how well a rotation is working. */
const SCORE_POINTS = [11, 12, 23, 24, 25, 26, 27, 28];

function scoreLandmarks(landmarks) {
  if (!landmarks || landmarks.length < 33) return 0;
  let sum = 0;
  for (const i of SCORE_POINTS) sum += landmarks[i]?.visibility ?? 1;
  const visibility = sum / SCORE_POINTS.length;
  // Prefer the orientation where the head ends up above the hips: the model is
  // more accurate there, and it keeps tracking stable as the body moves.
  const hipY = (landmarks[23].y + landmarks[24].y) / 2;
  const headUp = landmarks[0].y < hipY ? 0.4 : 0;
  return visibility + headUp;
}

export async function startCamera(video, { facing = 'user' } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser has no camera API. Try Chrome or Safari.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: facing,
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();
  await new Promise((resolve) => {
    if (video.videoWidth) return resolve();
    video.onloadedmetadata = () => resolve();
  });
  return stream;
}

export function stopCamera(video) {
  const stream = video?.srcObject;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (video) video.srcObject = null;
}

/**
 * Drives the detect loop. `onFrame(landmarks, tMs)` is called once per
 * animation frame; `landmarks` is null when nobody is detected.
 */
export function createPoseLoop(video, model, onFrame, opts = {}) {
  let running = false;
  let raf = 0;
  let lastVideoTime = -1;
  let lastLandmarks = null;
  let lastPeople = [];      // [{ landmarks, mask, maskRotation }]
  let inferMs = 0;          // smoothed cost of one detection
  let nextInferAt = 0;

  // Rotation state.
  let rotation = 0;
  let probing = false;
  let probeIndex = 0;
  let probeFrames = 0;
  let probeScores = [];
  let lostDetections = 0;
  const PROBE_FRAMES = 3;           // detections spent on each candidate
  const GOOD_ENOUGH = 1.15;         // a confident, head-up detection: stop early
  const LOST_BEFORE_REPROBE = 45;   // ~2-4s of seeing nobody

  // Rotated frames are drawn here before being handed to the model.
  const work = document.createElement('canvas');
  const wctx = work.getContext('2d');

  function sourceFor(deg) {
    if (!deg) return video;
    const vw = video.videoWidth, vh = video.videoHeight;
    const swap = deg % 180 !== 0;
    work.width = swap ? vh : vw;
    work.height = swap ? vw : vh;
    wctx.setTransform(1, 0, 0, 1, 0, 0);
    if (deg === 90) { wctx.translate(work.width, 0); wctx.rotate(Math.PI / 2); }
    else if (deg === 270) { wctx.translate(0, work.height); wctx.rotate(-Math.PI / 2); }
    else { wctx.translate(work.width, work.height); wctx.rotate(Math.PI); }
    wctx.drawImage(video, 0, 0, vw, vh);
    return work;
  }

  function startProbe() {
    probing = true;
    probeIndex = 0;
    probeFrames = 0;
    probeScores = ROTATIONS.map(() => 0);
    opts.onOrientation?.({ probing: true, rotation });
  }

  function advanceProbe(score) {
    probeScores[probeIndex] = Math.max(probeScores[probeIndex], score);
    // A clearly good rotation ends the search immediately — trying the rest
    // would waste a second or more of the countdown on a slow phone.
    if (score >= GOOD_ENOUGH) {
      probing = false;
      rotation = ROTATIONS[probeIndex];
      lostDetections = 0;
      opts.onOrientation?.({ probing: false, rotation, found: true });
      return;
    }
    probeFrames += 1;
    if (probeFrames < PROBE_FRAMES) return;
    probeFrames = 0;
    probeIndex += 1;
    if (probeIndex < ROTATIONS.length) return;
    // Done: keep the best candidate, or fall back to upright if nothing worked.
    let best = 0;
    for (let i = 1; i < probeScores.length; i++) if (probeScores[i] > probeScores[best]) best = i;
    probing = false;
    rotation = probeScores[best] > 0 ? ROTATIONS[best] : 0;
    lostDetections = 0;
    opts.onOrientation?.({ probing: false, rotation, found: probeScores[best] > 0 });
  }

  const tick = () => {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    if (video.readyState < 2) return;
    const now = performance.now();

    // detectForVideo is synchronous, so on a slow device it would eat every
    // frame and freeze the HUD. Once inference costs more than a frame budget,
    // space detections out and keep drawing from the last known pose.
    const budget = inferMs > 45 ? Math.min(inferMs * 1.2, 300) : 0;
    const due = now >= nextInferAt;

    if (video.currentTime !== lastVideoTime && due) {
      lastVideoTime = video.currentTime;
      const deg = probing ? ROTATIONS[probeIndex] : rotation;
      const t0 = performance.now();
      let raw = null;
      let masks = null;
      try {
        const result = model.detectForVideo(sourceFor(deg), now);
        raw = result?.landmarks || null;
        // Masks returned by this call are copies we own, so pull the pixels out
        // and close them immediately — holding them across frames leaks GPU
        // memory and the data is stale by the next detection anyway.
        if (result?.segmentationMasks?.length) {
          masks = result.segmentationMasks.map((m) => {
            try {
              return { data: m.getAsUint8Array(), width: m.width, height: m.height };
            } catch (err) {
              console.debug('mask read failed', err);
              return null;
            } finally {
              try { m.close(); } catch { /* already released */ }
            }
          });
        }
      } catch (err) {
        // A dropped frame is not worth killing the session over.
        console.debug('pose frame skipped', err);
      }
      const cost = performance.now() - t0;
      inferMs = inferMs ? inferMs * 0.8 + cost * 0.2 : cost;
      nextInferAt = performance.now() + budget;

      if (probing) {
        advanceProbe(scoreLandmarks(raw?.[0] || null));
        lastPeople = [];
      } else {
        lastPeople = (raw || []).map((lm, i) => ({
          landmarks: lm.map((p) => mapFromRotated(p, deg)),
          mask: masks?.[i] || null,
          maskRotation: deg,
        }));
        // If everyone disappears for a while, the phone was probably moved or we
        // rolled onto our side: go looking for the right rotation again.
        lostDetections = lastPeople.length ? 0 : lostDetections + 1;
        if (lostDetections >= LOST_BEFORE_REPROBE) startProbe();
      }
      lastLandmarks = lastPeople[0]?.landmarks || null;
    }
    onFrame(lastLandmarks, now, { probing, rotation, people: lastPeople, inferenceMs: inferMs });
  };

  return {
    start() { if (!running) { running = true; raf = requestAnimationFrame(tick); } },
    stop() { running = false; cancelAnimationFrame(raf); },
    get running() { return running; },
    /** Smoothed ms per detection — used to warn about struggling devices. */
    get inferenceMs() { return inferMs; },
    /** Everyone currently detected, with their body masks. */
    get people() { return lastPeople; },
    /** Work out which way up the body is. Called at the start of each move. */
    probeOrientation() { startProbe(); },
    get probing() { return probing; },
    get rotation() { return rotation; },
    setRotation(deg) { rotation = ((deg % 360) + 360) % 360; probing = false; },
  };
}

export function isSecureForCamera() {
  return window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}
