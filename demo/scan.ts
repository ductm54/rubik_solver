import type { Color } from '../src/core/cube';
import { type Capture, type ReadCubeResult, captureOf, readCube } from '../src/scan/readCube';
import { type RGB, nameTogether } from '../src/vision/color';
import type { FaceReading } from '../src/vision/detect';
import { findDuplicate } from '../src/vision/duplicate';
import { CaptureTracker, type TrackUpdate } from '../src/vision/tracker';

export interface ScannerHandlers {
  /** All 6 faces are in: the whole-cube reading. */
  onCube(r: ReadCubeResult): void;
  /** A face was removed (rescan or clear): the last reading no longer stands. */
  onIncomplete(): void;
}
let handlers: ScannerHandlers = { onCube() {}, onIncomplete() {} };

const COLOR_NAMES: Record<Color, string> = { W: 'white', Y: 'yellow', G: 'green', B: 'blue', R: 'red', O: 'orange' };
const CSS: Record<Color, string> = { W: 'var(--W)', Y: 'var(--Y)', G: 'var(--G)', B: 'var(--B)', R: 'var(--R)', O: 'var(--O)' };
const CSS_HEX: Record<Color, string> = { W: '#ffffff', Y: '#ffd500', G: '#009b48', B: '#0046ad', R: '#b71234', O: '#ff5800' };
const PROC_MAX = 480; // longest side of the frame given to the free-hand detector
const PHOTO_TIMEOUT = 2000; // ms to look for a face in one uploaded photo before moving on

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>('video');
const photo = $<HTMLImageElement>('photo');
const overlay = $<HTMLCanvasElement>('overlay');
const stage = $('stage');
const placeholder = $('placeholder');
const statusEl = $('scan-status');
const perf = $('perf');
const live = $('live');
const capturedEl = $('captured');
const countEl = $('count');
const btnCamera = $<HTMLButtonElement>('btn-camera');
const btnStop = $<HTMLButtonElement>('btn-stop');

type Mode = 'idle' | 'camera' | 'photo' | 'video';
let mode: Mode = 'idle';
let stream: MediaStream | null = null;

// Captured faces, in the order they were scanned. Which face each one is gets decided at the end
// from all six centers together, so a single odd center reading cannot mislabel a face.
interface Slot {
  capture: Capture;
  /** Colours for the thumbnail: the single-face guess, replaced by the whole-cube reading. */
  colors: Color[];
}
const slots: (Slot | null)[] = [null, null, null, null, null, null];
const filled = () => slots.filter(Boolean).length;

// Preview colours. Red and orange are close; telling them apart is easier with every sticker seen
// so far in view, so a face in the camera is named together with the captured ones.
const capturedRgbs = (): RGB[] => slots.flatMap((s) => s?.capture.rgbs ?? []);
const nameLive = (rgbs: RGB[]): Color[] => nameTogether([...capturedRgbs(), ...rgbs]).slice(-9);
/** Name the captured faces again, now that there is one more to compare with. */
function renameSlots() {
  const names = nameTogether(capturedRgbs());
  let k = 0;
  for (const s of slots) if (s) s.colors = names.slice(k, (k += 9));
}

// face detection
const proc = document.createElement('canvas');
const procCtx = proc.getContext('2d', { willReadFrequently: true })!;
const tracker = new CaptureTracker();
let busy = false;
let reqId = 0;
/** Worker results for requests before this one belong to an earlier picture and are dropped. */
let minReq = 0;
let last: { face: FaceReading | null; colors: Color[]; update: TrackUpdate } | null = null;
let fps = 0;
let lastFrameT = 0;

const worker = new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module' });

// ---------------------------------------------------------------- sources

async function startCamera() {
  stopAll();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (err) {
    statusEl.textContent = `Camera unavailable: ${(err as Error).message}`;
    return;
  }
  video.srcObject = stream;
  await video.play();
  setMode('camera');
}

// Uploaded files: either one video, played like the camera, or photos looked at one after another.
// Each photo gets a short while to show a face; then the next one is shown.
let photos: File[] = [];
let photoIdx = 0;
let photoStart = 0;
/** The current photo is finished with (a face was found, or none turned up in time). */
let photoDone = false;
let fileUrl = '';

function fileSrc(file: File): string {
  if (fileUrl) URL.revokeObjectURL(fileUrl);
  return (fileUrl = URL.createObjectURL(file));
}

function loadFiles(files: File[]) {
  const clip = files.find((f) => f.type.startsWith('video/'));
  if (clip) return loadVideo(clip);
  const imgs = files.filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) {
    statusEl.textContent = 'Choose one or more photos, or a video.';
    return;
  }
  stopAll();
  photos = imgs;
  photoIdx = -1;
  nextPhoto();
}

/** The picture changed completely: start detection and the steady clock afresh. */
function newPicture() {
  tracker.reset();
  worker.postMessage({ reset: true });
  minReq = reqId + 1;
  last = null;
}

const photoPrefix = () => (mode === 'photo' && photos.length > 1 ? `Photo ${photoIdx + 1} of ${photos.length}: ` : '');

function nextPhoto() {
  if (mode !== 'photo' && photoIdx >= 0) return; // left photo mode meanwhile
  photoIdx++;
  if (photoIdx >= photos.length || filled() === 6) {
    photoDone = true;
    const n = filled();
    const seen = photos.length > 1 ? `Looked at ${photos.length} photos. ` : '';
    statusEl.textContent =
      n === 6 ? `${seen}All 6 faces are scanned.` : `${seen}Found ${n} of 6 faces. Upload more photos, or use the camera for the rest.`;
    return;
  }
  photoDone = false;
  photo.onload = () => {
    setMode('photo');
    newPicture();
    photoStart = performance.now();
    statusEl.textContent = `${photoPrefix()}Looking for a face…`;
  };
  photo.src = fileSrc(photos[photoIdx]);
}

/** Turn the camera off and go back to the start screen; captured faces are kept. */
function stopCamera(message?: string) {
  if (mode !== 'camera' && !stream) return;
  stopAll();
  setMode('idle');
  statusEl.textContent = message ?? `Camera stopped. ${filled()} of 6 faces scanned.`;
}

function loadVideo(file: File) {
  stopAll();
  video.loop = false;
  video.src = fileSrc(file); // 'loadedmetadata' switches to video mode
  void video.play().catch(() => (statusEl.textContent = 'This video cannot be played in this browser.'));
}

function stopAll() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.pause();
  video.srcObject = null;
  if (video.getAttribute('src')) {
    video.removeAttribute('src');
    video.load();
  }
  photos = [];
  photoDone = false;
  last = null;
}

function setMode(m: Mode) {
  mode = m;
  video.classList.toggle('hidden', m !== 'camera' && m !== 'video');
  photo.classList.toggle('hidden', m !== 'photo');
  placeholder.classList.toggle('hidden', m !== 'idle');
  btnCamera.textContent = m === 'camera' ? 'Restart camera' : 'Start camera';
  btnStop.classList.toggle('hidden', m !== 'camera');
  const { w, h } = sourceSize();
  if (w && h) stage.style.aspectRatio = `${w} / ${h}`;
  resetView();
}

function resetView() {
  last = null;
  perf.textContent = '';
  renderLive(null);
  if (mode !== 'idle') statusEl.textContent = 'Looking for a face…';
}

function sourceSize(): { w: number; h: number; el: CanvasImageSource | null } {
  if (mode === 'camera' || mode === 'video') return { w: video.videoWidth, h: video.videoHeight, el: video };
  if (mode === 'photo') return { w: photo.naturalWidth, h: photo.naturalHeight, el: photo };
  return { w: 0, h: 0, el: null };
}

// ---------------------------------------------------------------- loop

function tick(t: number) {
  requestAnimationFrame(tick);
  const { w, h, el } = sourceSize();
  if (!el || !w || !h) return;
  if (mode === 'photo' && photoDone) return drawOverlay();
  if (!busy) {
    const k = PROC_MAX / Math.max(w, h);
    proc.width = Math.round(w * k);
    proc.height = Math.round(h * k);
    procCtx.drawImage(el, 0, 0, proc.width, proc.height);
    const data = procCtx.getImageData(0, 0, proc.width, proc.height);
    busy = true;
    reqId++;
    worker.postMessage({ id: reqId, width: proc.width, height: proc.height, buffer: data.data.buffer }, [data.data.buffer]);
  }
  drawOverlay();
}

const uncertain = (s: { margin: number; purity?: number }) => s.margin < 10 || (s.purity ?? 1) < 0.6;

worker.onmessage = (e) => {
  busy = false;
  const { id, face, ms } = e.data as { id: number; face: FaceReading | null; ms: number };
  if (mode === 'idle' || id < minReq || (mode === 'photo' && photoDone)) return;
  const now = performance.now();
  if (lastFrameT) fps = 0.8 * fps + 0.2 * (1000 / (now - lastFrameT));
  lastFrameT = now;
  perf.textContent = `${ms.toFixed(0)} ms/frame · ${fps.toFixed(0)} fps`;
  const update = tracker.update(face, now);
  const colors = face ? nameLive(face.stickers.map((s) => s.rgb)) : [];
  last = { face, colors, update };
  renderLive(face ? colors : null, face?.stickers.map(uncertain));
  renderStatus(face, colors, update);
  if (update.capture) {
    const capture = captureOf(update.capture);
    const dup = findDuplicate(capture.labs, slots.map((s) => s?.capture.labs));
    const idx = slots.indexOf(null);
    if (dup >= 0)
      statusEl.textContent = mode === 'photo' ? `${photoPrefix()}This face is already scanned.` : 'This face is already scanned. Turn to another face.';
    else if (idx >= 0) {
      slots[idx] = { capture, colors: update.capture.colors };
      onCapture();
    }
  }
  if (mode === 'photo' && (update.capture || now - photoStart > PHOTO_TIMEOUT)) {
    photoDone = true;
    if (!update.capture) statusEl.textContent = `${photoPrefix()}No face found in this photo.`;
    setTimeout(nextPhoto, photos.length > 1 ? 800 : 0);
  }
};

// ---------------------------------------------------------------- UI

function renderStatus(face: FaceReading | null, colors: Color[], u: TrackUpdate) {
  const pre = photoPrefix();
  if (!face) statusEl.textContent = `${pre}Looking for a face…`;
  else if (u.status === 'steadying') statusEl.textContent = `${pre}Reading the ${COLOR_NAMES[colors[4]]} face…`;
  else if (u.status === 'captured')
    statusEl.textContent = `${pre}Captured the ${COLOR_NAMES[colors[4]]} face ✓${mode === 'photo' ? '' : ' Turn to the next one.'}`;
}

function miniFace(colors: Color[] | null, unsure: boolean[] = []): HTMLElement {
  const g = document.createElement('div');
  g.className = 'mini-grid';
  for (let i = 0; i < 9; i++) {
    const c = document.createElement('span');
    if (colors) {
      c.style.background = CSS[colors[i]];
      if (unsure[i]) c.classList.add('uncertain');
    }
    g.append(c);
  }
  return g;
}

function renderLive(colors: Color[] | null, unsure: boolean[] = []) {
  live.replaceChildren(miniFace(colors, unsure));
}

function renderCaptured() {
  capturedEl.replaceChildren();
  slots.forEach((s, i) => {
    const slot = document.createElement('button');
    slot.className = 'slot';
    slot.append(miniFace(s?.colors ?? null));
    slot.title = s ? `Scan face ${i + 1} again` : `Face ${i + 1} not scanned yet`;
    slot.classList.toggle('filled', !!s);
    slot.disabled = !s;
    slot.onclick = () => {
      slots[i] = null;
      tracker.reset();
      renderCaptured();
      handlers.onIncomplete();
    };
    if (s?.capture.strip) slot.classList.add('has-strip');
    capturedEl.append(slot);
  });
  countEl.textContent = `${filled()} / 6`;
}

let audio: AudioContext | null = null;
function onCapture() {
  renameSlots();
  renderCaptured();
  if (filled() === 6) {
    if (mode === 'video') {
      video.pause();
      statusEl.textContent = 'All 6 faces are scanned.';
    } else if (mode === 'camera') stopCamera('All 6 faces are scanned. Camera stopped.');
    runReview();
  }
  navigator.vibrate?.(60);
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.08, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.15);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.16);
  } catch {
    /* no audio */
  }
}

function drawOverlay() {
  const rect = overlay.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (overlay.width !== Math.round(rect.width * dpr) || overlay.height !== Math.round(rect.height * dpr)) {
    overlay.width = Math.round(rect.width * dpr);
    overlay.height = Math.round(rect.height * dpr);
  }
  const ctx = overlay.getContext('2d')!;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  drawDetected(ctx, dpr);
}

function drawDetected(ctx: CanvasRenderingContext2D, dpr: number) {
  if (!last || !proc.width) return;
  const k = overlay.width / proc.width;
  ctx.save();
  ctx.scale(k, k);
  const lw = 1 / k;
  const f = last.face;
  if (f) {
    const st = last.update.status;
    const color = st === 'captured' ? '#2ecc71' : '#ffffff';
    ctx.lineWidth = 3 * dpr * lw;
    ctx.strokeStyle = color;
    ctx.beginPath();
    f.corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    const pitch = Math.hypot(f.corners[0][0] - f.corners[1][0], f.corners[0][1] - f.corners[1][1]) / 3;
    for (const [i, s] of f.stickers.entries()) {
      ctx.beginPath();
      ctx.arc(s.center[0], s.center[1], pitch * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = CSS_HEX[last.colors[i]];
      ctx.fill();
      ctx.lineWidth = 2 * dpr * lw;
      ctx.strokeStyle = s.margin < 10 ? '#ff3b30' : 'rgba(0,0,0,0.6)';
      ctx.stroke();
    }
    if (st === 'steadying') {
      const c = f.stickers[4].center;
      ctx.beginPath();
      ctx.arc(c[0], c[1], pitch * 0.42, -Math.PI / 2, -Math.PI / 2 + last.update.progress * Math.PI * 2);
      ctx.lineWidth = 4 * dpr * lw;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- hand-off to the page

function runReview() {
  const r = readCube(slots.map((s) => s!.capture));
  // Thumbnails now show the whole-cube reading (centers matched one-to-one, 9 of each colour).
  slots.forEach((s, i) => (s!.colors = r.faces[i]));
  renderCaptured();
  handlers.onCube(r);
}

// ---------------------------------------------------------------- wiring

btnCamera.onclick = () => void startCamera();
btnStop.onclick = () => stopCamera();
$<HTMLInputElement>('file').onchange = (e) => {
  const input = e.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = ''; // so choosing the same files again still fires
  if (files.length) loadFiles(files);
};
stage.onclick = () => {
  if (mode === 'video' && video.ended && filled() < 6) {
    newPicture();
    void video.play();
  }
};
$('btn-clear').onclick = () => {
  tracker.reset();
  slots.fill(null);
  renderCaptured();
  handlers.onIncomplete();
};
video.addEventListener('loadedmetadata', () => {
  setMode(video.srcObject ? 'camera' : 'video');
  newPicture();
});
video.addEventListener('ended', () => {
  if (mode !== 'video' || filled() === 6) return;
  statusEl.textContent = `Video ended: found ${filled()} of 6 faces. Tap the picture to play it again, or upload another.`;
});
if (!navigator.mediaDevices?.getUserMedia) {
  btnCamera.disabled = true;
  btnCamera.title = 'Camera needs HTTPS and a browser that supports getUserMedia';
}

/** Wire the scanner to the page. Call once; the camera only starts when the user asks. */
export function initScanner(h: ScannerHandlers) {
  handlers = h;
  resetView();
  renderCaptured();
  requestAnimationFrame(tick);
  // For automated tests / debugging.
  Object.assign(window, { scanner: { tracker, slots, get mode() { return mode; } } });
}

/** Turn the camera / video off (the panel was closed); captured faces are kept. */
export function pauseScanner() {
  if (mode === 'camera') stopCamera();
  else if (mode === 'video') video.pause();
}

