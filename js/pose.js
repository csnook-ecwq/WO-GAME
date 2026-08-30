/**
 * pose.js — the camera, and finding a body in it.
 *
 * Deliberately thin. Everything that decides anything lives in zone.js, where it
 * can be tested without a camera; this file only opens the device, runs frames
 * through the model and hands the landmarks on.
 *
 * The video never leaves the phone. There is no upload, no server and no
 * recording — frames go from the camera into the model and are gone. Nothing
 * here writes a file or opens a connection, and that is not an accident.
 */

/*
 * Vendored, not fetched from a CDN. This is a workout app you open on the floor
 * with a toddler on you — if it needs jsdelivr and Google Storage to both be up
 * and reachable before you can start, then some mornings it just does not work,
 * and there is nothing you can do about it standing in your own front room.
 * Everything it needs is in the repository and served from the same origin.
 *
 * It costs about 15MB on first open, cached by the browser afterwards.
 */
const VISION_LIB = new URL('../vendor/tasks-vision/vision_bundle.mjs', import.meta.url).href;
const WASM_PATH = new URL('../vendor/tasks-vision/wasm', import.meta.url).href;
const MODEL = new URL('../vendor/models/pose_landmarker_lite.task', import.meta.url).href;

/** Why we could not start, in words worth showing someone. */
export const FAILURES = {
  insecure: 'The camera only works over https. Open the saved link, not a copy.',
  unsupported: 'This phone’s browser won’t give a web app the camera.',
  denied: 'Camera access was turned down. You can turn it back on in Settings.',
  nocamera: 'No camera found on this device.',
  model: 'Couldn’t start the movement model on this phone.',
  unknown: 'Something went wrong starting the camera.',
};

function classify(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'nocamera';
  if (name === 'NotReadableError') return 'unknown';
  return 'unknown';
}

let landmarkerPromise = null;

/** Loaded once per session and reused; it is several megabytes. */
async function getLandmarker() {
  if (landmarkerPromise) return landmarkerPromise;
  landmarkerPromise = (async () => {
    const { PoseLandmarker, FilesetResolver } = await import(VISION_LIB);
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      // Two, not one. The whole point of the zone is choosing between
      // candidates — with one pose the model hands back whatever it liked best
      // and there is nothing left to choose from.
      numPoses: 2,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  })().catch((err) => {
    landmarkerPromise = null;
    throw Object.assign(new Error('model'), { code: 'model', cause: err });
  });
  return landmarkerPromise;
}

/**
 * @param {HTMLVideoElement} video
 * @param {{ onFrame: (bodies: Array, video: HTMLVideoElement) => void,
 *           onError?: (code: string, err?: Error) => void,
 *           facing?: 'user' | 'environment' }} opts
 */
export function createCamera(video, opts) {
  let stream = null;
  let landmarker = null;
  let raf = 0;
  let running = false;
  let lastTs = -1;

  const fail = (code, err) => {
    running = false;
    opts.onError?.(code, err);
  };

  async function start() {
    if (running) return;
    running = true;

    if (!window.isSecureContext) return fail('insecure');
    if (!navigator.mediaDevices?.getUserMedia) return fail('unsupported');

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: opts.facing || 'user',
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
      });
    } catch (err) {
      return fail(classify(err), err);
    }
    if (!running) return stop();          // stopped while the prompt was open

    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    try {
      await video.play();
    } catch (err) {
      return fail('unknown', err);
    }

    try {
      landmarker = await getLandmarker();
    } catch (err) {
      return fail('model', err);
    }
    if (!running) return stop();

    const tick = () => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      if (video.readyState < 2) return;
      // MediaPipe rejects a repeated timestamp, and a paused tab happily hands
      // back the same frame time forever.
      const ts = performance.now();
      if (ts <= lastTs) return;
      lastTs = ts;
      try {
        const out = landmarker.detectForVideo(video, ts);
        opts.onFrame(out?.landmarks || [], video);
      } catch { /* one bad frame is not worth tearing the camera down */ }
    };
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    for (const track of stream?.getTracks() || []) track.stop();
    stream = null;
    video.srcObject = null;
  }

  return { start, stop, get running() { return running; } };
}
