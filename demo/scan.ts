import type { Color } from '../src/core/cube';
import { t } from '../src/i18n';
import { type Capture, type ReadCubeResult, captureOf, readCube } from '../src/scan/readCube';
import { type Hint, type Turn, TurnGuide } from '../src/scan/turnHint';
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

const colorName = (c: Color) => t(`color.${c}`);
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

// Which way to turn the cube for a face that is still missing (camera only: a recording or a
// photo cannot be turned).
const guide = new TurnGuide();
let hint: Hint | null = null;
/** The face being held is one that was scanned before. */
let dupHold = false;
const TURN_KEY: Record<Turn, string> = { x: 'scan.turnX', "x'": 'scan.turnXp', y: 'scan.turnY', "y'": 'scan.turnYp', y2: 'scan.turnY2' };
const hintText = () => (hint ? t(TURN_KEY[hint.turn]) : '');
function refreshHint() {
  hint = mode === 'camera' ? guide.next(slots.flatMap((s) => (s ? [s.colors[4]] : []))) : null;
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

/** Counts camera starts and stops, so a camera that answers after it was stopped is turned off. */
let cameraSeq = 0;

async function startCamera() {
  stopAll();
  const seq = cameraSeq;
  let got: MediaStream;
  try {
    got = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (err) {
    if (seq === cameraSeq) statusEl.textContent = t('scan.cameraUnavailable', { error: (err as Error).message });
    return;
  }
  if (seq !== cameraSeq) {
    // Stopped, or started again, while the permission prompt was open.
    got.getTracks().forEach((t) => t.stop());
    return;
  }
  stream = got;
  video.srcObject = stream;
  try {
    await video.play();
  } catch (err) {
    if (seq !== cameraSeq) return;
    stopAll();
    statusEl.textContent = t('scan.cameraUnavailable', { error: (err as Error).message });
    return;
  }
  if (seq === cameraSeq) setMode('camera');
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
    statusEl.textContent = t('scan.chooseFiles');
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

const photoPrefix = () => (mode === 'photo' && photos.length > 1 ? t('scan.photoPrefix', { i: photoIdx + 1, n: photos.length }) : '');

function nextPhoto() {
  if (mode !== 'photo' && photoIdx >= 0) return; // left photo mode meanwhile
  photoIdx++;
  if (photoIdx >= photos.length || filled() === 6) {
    photoDone = true;
    const n = filled();
    const seen = photos.length > 1 ? t('scan.lookedAt', { n: photos.length }) : '';
    statusEl.textContent = seen + (n === 6 ? t('scan.allDone') : t('scan.foundSome', { n }));
    return;
  }
  photoDone = false;
  photo.onload = () => {
    setMode('photo');
    newPicture();
    photoStart = performance.now();
    statusEl.textContent = photoPrefix() + t('scan.looking');
  };
  // A picture the browser cannot show (HEIC, a broken file): say so and go on to the next one.
  photo.onerror = () => {
    statusEl.textContent = (photos.length > 1 ? t('scan.photoPrefix', { i: photoIdx + 1, n: photos.length }) : '') + t('scan.noFace');
    setTimeout(nextPhoto, photos.length > 1 ? 800 : 0);
  };
  photo.src = fileSrc(photos[photoIdx]);
}

/** Turn the camera off and go back to the start screen; captured faces are kept. */
function stopCamera(message?: string) {
  if (mode !== 'camera' && !stream) return;
  stopAll();
  setMode('idle');
  statusEl.textContent = message ?? t('scan.stopped', { n: filled() });
}

function loadVideo(file: File) {
  stopAll();
  video.loop = false;
  video.src = fileSrc(file); // 'loadedmetadata' switches to video mode
  void video.play().catch(() => (statusEl.textContent = t('scan.videoUnplayable')));
}

function stopAll() {
  cameraSeq++;
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
  guide.reset();
  hint = null;
}

function setMode(m: Mode) {
  mode = m;
  video.classList.toggle('hidden', m !== 'camera' && m !== 'video');
  photo.classList.toggle('hidden', m !== 'photo');
  placeholder.classList.toggle('hidden', m !== 'idle');
  btnCamera.textContent = t(m === 'camera' ? 'scan.restart' : 'scan.start');
  btnStop.classList.toggle('hidden', m !== 'camera');
  const { w, h } = sourceSize();
  if (w && h) stage.style.aspectRatio = `${w} / ${h}`;
  resetView();
}

function resetView() {
  last = null;
  drawOverlay(); // nothing is drawn while idle, so wipe the last frame's outline and turn hint
  perf.textContent = '';
  renderLive(null);
  if (mode !== 'idle') statusEl.textContent = t('scan.looking');
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
    if (dup < 0 && idx >= 0) {
      slots[idx] = { capture, colors: update.capture.colors };
      onCapture();
    }
    if (mode === 'camera') {
      // The face in front of the camera is known now: point to one that is still missing.
      const seen = slots[dup >= 0 ? dup : idx];
      if (seen) guide.see(seen.colors[4]);
      refreshHint();
    }
    dupHold = dup >= 0;
    if (mode === 'camera') renderStatus(face, colors, update); // with the new hint
    else if (dupHold) statusEl.textContent = duplicateText();
  }
  if (mode === 'photo' && (update.capture || now - photoStart > PHOTO_TIMEOUT)) {
    photoDone = true;
    if (!update.capture) statusEl.textContent = photoPrefix() + t('scan.noFace');
    setTimeout(nextPhoto, photos.length > 1 ? 800 : 0);
  }
};

// ---------------------------------------------------------------- UI

/** "Already scanned", with the turn toward a missing face when one is known. */
function duplicateText(): string {
  if (mode === 'photo') return photoPrefix() + t('scan.duplicate');
  return hint ? `${t('scan.duplicate')} ${hintText()}` : t('scan.duplicateTurn');
}

function renderStatus(face: FaceReading | null, colors: Color[], u: TrackUpdate) {
  const pre = photoPrefix();
  if (u.status !== 'captured') dupHold = false;
  if (dupHold) return void (statusEl.textContent = duplicateText());
  if (!face) statusEl.textContent = pre + t('scan.looking');
  else if (u.status === 'steadying') statusEl.textContent = pre + t('scan.reading', { color: colorName(colors[4]) });
  else if (u.status === 'captured') {
    const color = colorName(colors[4]);
    if (hint) statusEl.textContent = `${t('scan.captured', { color })} ${hintText()}`;
    else statusEl.textContent = pre + t(mode === 'photo' ? 'scan.captured' : 'scan.capturedNext', { color });
  }
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
    slot.title = t(s ? 'scan.rescan' : 'scan.notYet', { i: i + 1 });
    slot.classList.toggle('filled', !!s);
    slot.disabled = !s;
    slot.onclick = () => {
      slots[i] = null;
      tracker.reset();
      refreshHint();
      renderCaptured();
      handlers.onIncomplete();
    };
    if (s?.capture.strip) slot.classList.add('has-strip');
    capturedEl.append(slot);
  });
  countEl.textContent = t('scan.count', { n: filled() });
}

let audio: AudioContext | null = null;
function onCapture() {
  renameSlots();
  renderCaptured();
  if (filled() === 6) {
    if (mode === 'video') {
      video.pause();
      statusEl.textContent = t('scan.allDone');
    } else if (mode === 'camera') stopCamera(t('scan.allDoneStopped'));
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
  drawHint(ctx, dpr);
}

const TURN_DIR: Record<Turn, [number, number]> = { x: [0, -1], "x'": [0, 1], y: [-1, 0], "y'": [1, 0], y2: [-1, 0] };

/** An arrow of length `len` centered on (cx, cy), pointing along (dx, dy); two heads for a half turn. */
function drawArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, [dx, dy]: [number, number], len: number, double: boolean) {
  const head = len * 0.34;
  const half = len * 0.07; // half the shaft width
  const wing = len * 0.22;
  const at = (along: number, across: number): [number, number] => [cx + dx * along - dy * across, cy + dy * along + dx * across];
  const tip = len / 2;
  const heads = double ? [tip, tip - head * 0.75] : [tip];
  const base = heads[heads.length - 1] - head;
  ctx.beginPath();
  const pts = [at(-tip, -half), at(base, -half), at(base, half), at(-tip, half)];
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  for (const h of heads) {
    const tri = [at(h, 0), at(h - head, -wing), at(h - head, wing)];
    tri.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, len * 0.05);
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

/**
 * The turn toward a face that is still missing: a tag in the corner for as long as one is known,
 * and a large arrow across the face just read, sliding the way the face should go.
 */
function drawHint(ctx: CanvasRenderingContext2D, dpr: number) {
  if (!hint || mode !== 'camera') return;
  const dir = TURN_DIR[hint.turn];
  const double = hint.turn === 'y2';

  const pad = 8 * dpr;
  const h = 34 * dpr;
  ctx.font = `700 ${18 * dpr}px ui-monospace, 'SF Mono', Menlo, monospace`;
  ctx.textBaseline = 'middle';
  const textW = ctx.measureText(hint.turn).width;
  const dot = hint.color ? 14 * dpr + pad : 0;
  const w = pad + h + textW + pad + dot + pad / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.roundRect(pad, pad, w, h, 8 * dpr);
  ctx.fill();
  drawArrow(ctx, pad + pad / 2 + h / 2, pad + h / 2, dir, h * 0.62, double);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(hint.turn, pad + h + pad / 2, pad + h / 2 + dpr);
  if (hint.color) {
    ctx.fillStyle = CSS_HEX[hint.color];
    ctx.fillRect(pad + h + pad / 2 + textW + pad, pad + h / 2 - 7 * dpr, 14 * dpr, 14 * dpr);
  }

  const f = last?.face;
  if (!f || last!.update.status !== 'captured' || !proc.width) return;
  const k = overlay.width / proc.width;
  const pitch = (Math.hypot(f.corners[0][0] - f.corners[1][0], f.corners[0][1] - f.corners[1][1]) / 3) * k;
  const slide = ((performance.now() % 1100) / 1100 - 0.5) * pitch * 0.7;
  const [cx, cy] = f.stickers[4].center;
  ctx.globalAlpha = 0.9;
  drawArrow(ctx, cx * k + dir[0] * slide, cy * k + dir[1] * slide, dir, pitch * 2.2, double);
  ctx.globalAlpha = 1;
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
  refreshHint();
  renderCaptured();
  handlers.onIncomplete();
};
video.addEventListener('loadedmetadata', () => {
  setMode(video.srcObject ? 'camera' : 'video');
  newPicture();
});
video.addEventListener('ended', () => {
  if (mode !== 'video' || filled() === 6) return;
  statusEl.textContent = t('scan.videoEnded', { n: filled() });
});
if (!navigator.mediaDevices?.getUserMedia) {
  btnCamera.disabled = true;
  btnCamera.title = t('scan.needsHttps');
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
  cameraSeq++; // a camera still waiting for permission must not start behind the closed panel
  if (mode === 'camera') stopCamera();
  else if (mode === 'video') video.pause();
}

