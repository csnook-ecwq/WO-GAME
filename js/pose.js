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
    if (fromUrl) localStorage.setItem('slothmode.poseBase', fromUrl);
    return fromUrl || localStorage.getItem('slothmode.poseBase') || '';
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

/** Loads (once) and returns the shared PoseLandmarker. */
export async function getLandmarker({ model = 'lite' } = {}) {
  if (landmarker) return landmarker;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const vision = await loadVision();
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
    try {
      landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODELS[model] || MODELS.lite, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch (err) {
      // Plenty of phones have no usable WebGL delegate; CPU is slower but works.
      console.warn('GPU delegate unavailable, falling back to CPU.', err);
      landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODELS[model] || MODELS.lite, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
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

/** Landmarks we draw fatter, because this app is fundamentally about feet. */
export const FOOT_POINTS = [27, 28, 29, 30, 31, 32];

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
export function createPoseLoop(video, model, onFrame) {
  let running = false;
  let raf = 0;
  let lastVideoTime = -1;
  let lastLandmarks = null;
  let inferMs = 0;          // smoothed cost of one detection
  let nextInferAt = 0;

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
      const t0 = performance.now();
      try {
        const result = model.detectForVideo(video, now);
        lastLandmarks = result?.landmarks?.[0] || null;
      } catch (err) {
        // A dropped frame is not worth killing the session over.
        console.debug('pose frame skipped', err);
      }
      const cost = performance.now() - t0;
      inferMs = inferMs ? inferMs * 0.8 + cost * 0.2 : cost;
      nextInferAt = performance.now() + budget;
    }
    onFrame(lastLandmarks, now);
  };

  return {
    start() { if (!running) { running = true; raf = requestAnimationFrame(tick); } },
    stop() { running = false; cancelAnimationFrame(raf); },
    get running() { return running; },
    /** Smoothed ms per detection — used to warn about struggling devices. */
    get inferenceMs() { return inferMs; },
  };
}

export function isSecureForCamera() {
  return window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}
