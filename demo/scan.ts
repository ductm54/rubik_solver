import { COLORS, type Color, type CubeState, FACES, applyMoves, randomMoves, solvedState } from '../src/core/cube';
import { validate } from '../src/core/validate';
import { type Capture, captureOf, readCube } from '../src/scan/readCube';
import type { FaceReading, Region } from '../src/vision/detect';
import { type GuideFit, type GuideReading, type SteadyUpdate, SteadyDetector, findDuplicate, fitCorners, fitGuide, guideSquare, readGuide } from '../src/vision/guide';
import { neighboursOf, renderCube } from '../src/vision/synth';
import { CaptureTracker, type TrackUpdate } from '../src/vision/tracker';
import { createNet, encodeCube } from './net';

const COLOR_NAMES: Record<Color, string> = { W: 'white', Y: 'yellow', G: 'green', B: 'blue', R: 'red', O: 'orange' };
const CSS: Record<Color, string> = { W: 'var(--W)', Y: 'var(--Y)', G: 'var(--G)', B: 'var(--B)', R: 'var(--R)', O: 'var(--O)' };
const CSS_HEX: Record<Color, string> = { W: '#ffffff', Y: '#ffd500', G: '#009b48', B: '#0046ad', R: '#b71234', O: '#ff5800' };
const PROC_MAX = 640; // longest side of the frame given to the free-hand detector
const GUIDE_PX = 120; // the guide square is read at this size...
const GUIDE_MARGIN = 0.3; // ...with this much of its surroundings on each side, for a cube that is off the grid
const GUIDE_CANVAS = Math.round(GUIDE_PX * (1 + 2 * GUIDE_MARGIN));
const GUIDE_INTERVAL = 70; // ms between guide readings

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>('video');
const sim = $<HTMLCanvasElement>('sim');
const photo = $<HTMLImageElement>('photo');
const overlay = $<HTMLCanvasElement>('overlay');
const stage = $('stage');
const placeholder = $('placeholder');
const statusEl = $('status');
const perf = $('perf');
const live = $('live');
const capturedEl = $('captured');
const countEl = $('count');
const debug = $<HTMLInputElement>('debug');
const auto = $<HTMLInputElement>('auto');
const btnCamera = $<HTMLButtonElement>('btn-camera');
const btnSim = $<HTMLButtonElement>('btn-sim');
const btnCapture = $<HTMLButtonElement>('btn-capture');

type Mode = 'idle' | 'camera' | 'sim' | 'photo';
/** guide: line the face up with a fixed square. free: find the face anywhere in the frame. */
type ScanMode = 'guide' | 'free';
let mode: Mode = 'idle';
let scanMode: ScanMode = localStorage.getItem('scan-mode') === 'free' ? 'free' : 'guide';
let stream: MediaStream | null = null;

/** A photo cannot be lined up with the square, so it always uses the free-hand detector. */
const activeScan = (): ScanMode => (mode === 'photo' ? 'free' : scanMode);

// Captured faces, in the order they were scanned. Which face each one is gets decided at the end
// from all six centers together, so a single odd center reading cannot mislabel a face.
interface Slot {
  capture: Capture;
  /** Colours for the thumbnail: the single-face guess, replaced by the whole-cube reading. */
  colors: Color[];
}
const slots: (Slot | null)[] = [null, null, null, null, null, null];
const filled = () => slots.filter(Boolean).length;

// guide mode
const guideCanvas = document.createElement('canvas');
guideCanvas.width = guideCanvas.height = GUIDE_CANVAS;
const guideSq = { x: Math.round(GUIDE_PX * GUIDE_MARGIN), y: Math.round(GUIDE_PX * GUIDE_MARGIN), size: GUIDE_PX };
const guideCtx = guideCanvas.getContext('2d', { willReadFrequently: true })!;
const steady = new SteadyDetector();
let guide: { reading: GuideReading; update: SteadyUpdate; fit: GuideFit } | null = null;
let guideAt = 0;
let flash: { kind: 'captured' | 'duplicate'; until: number } | null = null;
let liveKey = '';

// free-hand mode
const proc = document.createElement('canvas');
const procCtx = proc.getContext('2d', { willReadFrequently: true })!;
const tracker = new CaptureTracker();
let busy = false;
let reqId = 0;
let last: { face: FaceReading | null; regions: Region[]; update: TrackUpdate } | null = null;
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

// Simulated cube: a random scrambled cube rendered in 3D, with a blue logo on the white center.
// It shows one face at a time with some hand jitter and turns to the next face after each capture.
// Guide mode: straight on, filling the square. Free-hand: anywhere, tilted so a side strip shows.
const simState = applyMoves(solvedState(), randomMoves(25));
let simFace = 0;
let simSwitchAt = 0;
function startSim() {
  stopAll();
  simFace = 0;
  simSwitchAt = performance.now();
  sim.width = 360;
  sim.height = 270;
  setMode('sim');
}
function drawSim(t: number) {
  const front = FACES[simFace % 6];
  const up = neighboursOf(front)[(simFace * 3 + 1) % 4];
  const wobble = Math.max(0, 1 - (t - simSwitchAt) / 900); // settles after switching faces
  const guided = scanMode === 'guide';
  const img = renderCube(
    simState,
    guided
      ? {
          // held roughly on the square, the way a hand does it: a bit small or big, turned, off-center
          front,
          up,
          distance: 8.9 + 1.1 * Math.sin(simFace * 2.3),
          pitch: 4 * Math.sin(simFace * 1.7) + 25 * wobble * Math.sin(t / 120),
          yaw: 4 * Math.sin(simFace * 2.1) + 25 * wobble * Math.sin(t / 150),
          roll: 8 * Math.sin(simFace * 1.3) + 0.4 * Math.sin(t / 700),
          shift: [9 * Math.sin(simFace * 2.9) + Math.sin(t / 90) * 30 * wobble, 8 * Math.cos(simFace * 1.9) + Math.cos(t / 110) * 20 * wobble],
        }
      : {
          front,
          up,
          pitch: 22 + 10 * wobble * Math.sin(t / 120),
          yaw: 4 * Math.sin(simFace * 2.1) + 12 * wobble * Math.sin(t / 150),
          roll: 12 * Math.sin(simFace * 1.3) + 0.6 * Math.sin(t / 700),
          shift: [Math.sin(t / 90) * 14 * wobble, Math.cos(t / 110) * 10 * wobble],
        },
    { noise: 4, logo: [25, 70, 200] },
  );
  sim.getContext('2d')!.putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
}
function simNextFace() {
  if (mode !== 'sim' || filled() === 6) return;
  setTimeout(() => {
    simFace = (simFace + 1) % 6;
    simSwitchAt = performance.now();
  }, 500);
}

function loadPhoto(file: File) {
  stopAll();
  photo.onload = () => {
    setMode('photo');
    tracker.reset();
  };
  photo.src = URL.createObjectURL(file);
}

function stopAll() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  last = null;
  guide = null;
}

function setMode(m: Mode) {
  mode = m;
  video.classList.toggle('hidden', m !== 'camera');
  sim.classList.toggle('hidden', m !== 'sim');
  photo.classList.toggle('hidden', m !== 'photo');
  placeholder.classList.toggle('hidden', m !== 'idle');
  btnCamera.textContent = m === 'camera' ? 'Restart camera' : 'Start camera';
  const { w, h } = sourceSize();
  if (w && h) stage.style.aspectRatio = `${w} / ${h}`;
  renderScanMode();
}

function renderScanMode() {
  const g = activeScan() === 'guide';
  for (const el of document.querySelectorAll<HTMLElement>('[data-scan]')) el.classList.toggle('hidden', el.dataset.scan !== (g ? 'guide' : 'free'));
  btnCapture.disabled = mode === 'idle';
  last = null;
  guide = null;
  flash = null;
  liveKey = '';
  steady.reset();
  perf.textContent = '';
  renderLive(null);
  if (mode !== 'idle') statusEl.textContent = g ? 'Line a face up with the grid' : 'Looking for a face…';
}

function sourceSize(): { w: number; h: number; el: CanvasImageSource | null } {
  if (mode === 'camera') return { w: video.videoWidth, h: video.videoHeight, el: video };
  if (mode === 'sim') return { w: sim.width, h: sim.height, el: sim };
  if (mode === 'photo') return { w: photo.naturalWidth, h: photo.naturalHeight, el: photo };
  return { w: 0, h: 0, el: null };
}

// ---------------------------------------------------------------- loop

function tick(t: number) {
  requestAnimationFrame(tick);
  if (mode === 'sim') drawSim(t);
  const { w, h, el } = sourceSize();
  if (!el || !w || !h) return;
  if (activeScan() === 'guide') tickGuide(el, w, h, t);
  else if (!busy) {
    const k = PROC_MAX / Math.max(w, h);
    proc.width = Math.round(w * k);
    proc.height = Math.round(h * k);
    procCtx.drawImage(el, 0, 0, proc.width, proc.height);
    const data = procCtx.getImageData(0, 0, proc.width, proc.height);
    busy = true;
    reqId++;
    worker.postMessage({ id: reqId, width: proc.width, height: proc.height, buffer: data.data.buffer }, [data.data.buffer]);
  }
  drawOverlay(w, h, t);
}

// Guide mode: the face is somewhere near the square, so only the square and its surroundings are
// looked at. The grid is fitted to where the face really is, then its 9 cells are read.
function tickGuide(el: CanvasImageSource, w: number, h: number, t: number) {
  if (t - guideAt < GUIDE_INTERVAL) return;
  guideAt = t;
  const sq = guideSquare(w, h);
  const m = sq.size * GUIDE_MARGIN;
  guideCtx.fillStyle = '#000';
  guideCtx.fillRect(0, 0, GUIDE_CANVAS, GUIDE_CANVAS);
  guideCtx.drawImage(el, sq.x - m, sq.y - m, sq.size + 2 * m, sq.size + 2 * m, 0, 0, GUIDE_CANVAS, GUIDE_CANVAS);
  const img = guideCtx.getImageData(0, 0, GUIDE_CANVAS, GUIDE_CANVAS);
  const t0 = performance.now();
  const fit = fitGuide(img, guideSq);
  const reading = readGuide(img, guideSq, fit);
  perf.textContent = `${(performance.now() - t0).toFixed(0)} ms/frame`;
  const update = steady.update(reading, t);
  guide = { reading, update, fit };
  const key = reading.stickers.map((s) => s.color + (uncertain(s) ? '?' : '')).join('');
  if (key !== liveKey) {
    liveKey = key;
    renderLive(reading.colors, reading.stickers.map(uncertain));
  }
  if (update.fire && auto.checked) captureGuide(false);
  if (flash && t > flash.until) flash = null;
  if (!flash) {
    if (filled() === 6) statusEl.textContent = 'All 6 faces are scanned. Tap a face below to scan it again.';
    else if (!update.clear) statusEl.textContent = 'Line a face up with the grid';
    else if (!auto.checked) statusEl.textContent = 'Press Capture';
    else if (update.progress < 1) statusEl.textContent = 'Hold still…';
  }
}
const uncertain = (s: { margin: number; purity?: number }) => s.margin < 10 || (s.purity ?? 1) < 0.6;

/** Capture what is under the guide now. A manual capture of a face already scanned replaces it. */
function captureGuide(manual: boolean) {
  if (!guide || activeScan() !== 'guide') return;
  const { reading } = guide;
  const capture = captureOf({ stickers: reading.stickers });
  const dup = findDuplicate(capture.labs, slots.map((s) => s?.capture.labs));
  const now = performance.now();
  if (dup >= 0 && !manual) {
    flash = { kind: 'duplicate', until: now + 1500 };
    statusEl.textContent = 'This face is already scanned. Turn to another face.';
    simNextFace();
    return;
  }
  const idx = dup >= 0 ? dup : slots.indexOf(null);
  if (idx < 0) {
    if (manual) statusEl.textContent = 'All 6 faces are scanned. Tap a face below to scan it again.';
    return;
  }
  slots[idx] = { capture, colors: reading.colors };
  flash = { kind: 'captured', until: now + 1500 };
  statusEl.textContent = dup >= 0 ? `Scanned face ${idx + 1} again ✓` : `Captured face ${filled()} of 6 ✓${filled() < 6 ? ' Turn to the next face.' : ''}`;
  onCapture();
}

worker.onmessage = (e) => {
  busy = false;
  const { face, regions, ms } = e.data as { face: FaceReading | null; regions: Region[]; ms: number };
  if (mode === 'idle' || activeScan() !== 'free') return;
  const now = performance.now();
  if (lastFrameT) fps = 0.8 * fps + 0.2 * (1000 / (now - lastFrameT));
  lastFrameT = now;
  perf.textContent = `${ms.toFixed(0)} ms/frame · ${fps.toFixed(0)} fps`;
  const update = tracker.update(face, now);
  last = { face, regions, update };
  renderLive(face?.colors ?? null, face?.stickers.map(uncertain));
  renderStatus(face, update);
  if (update.capture) {
    const capture = captureOf(update.capture);
    const dup = findDuplicate(capture.labs, slots.map((s) => s?.capture.labs));
    const idx = slots.indexOf(null);
    if (dup >= 0) statusEl.textContent = 'This face is already scanned. Turn to another face.';
    if (dup >= 0 || idx < 0) return;
    slots[idx] = { capture, colors: update.capture.colors };
    onCapture();
  }
};

// ---------------------------------------------------------------- UI

function renderStatus(face: FaceReading | null, u: TrackUpdate) {
  if (!face) statusEl.textContent = 'Looking for a face…';
  else if (u.status === 'steadying') statusEl.textContent = `Hold still… ${COLOR_NAMES[face.colors[4]]} center`;
  else if (u.status === 'captured') statusEl.textContent = `Captured the ${COLOR_NAMES[face.colors[4]]} face ✓ Turn to the next one.`;
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
      steady.reset();
      tracker.reset();
      renderCaptured();
      reviewEl.classList.add('hidden');
    };
    if (s?.capture.strip) slot.classList.add('has-strip');
    capturedEl.append(slot);
  });
  countEl.textContent = `${filled()} / 6`;
}

let audio: AudioContext | null = null;
function onCapture() {
  renderCaptured();
  if (filled() === 6) runReview();
  else reviewEl.classList.add('hidden');
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
  simNextFace();
}

function drawOverlay(w: number, h: number, t: number) {
  const rect = overlay.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (overlay.width !== Math.round(rect.width * dpr) || overlay.height !== Math.round(rect.height * dpr)) {
    overlay.width = Math.round(rect.width * dpr);
    overlay.height = Math.round(rect.height * dpr);
  }
  const ctx = overlay.getContext('2d')!;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (activeScan() === 'guide') drawGuide(ctx, w, dpr, t);
  else drawDetected(ctx, dpr);
}

function drawGuide(ctx: CanvasRenderingContext2D, w: number, dpr: number, t: number) {
  const k = overlay.width / w;
  const sq = guideSquare(w, overlay.height / k);
  const x = sq.x * k;
  const y = sq.y * k;
  const size = sq.size * k;
  const pitch = size / 3;
  // dim everything outside the square
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.rect(0, 0, overlay.width, overlay.height);
  ctx.rect(x, y, size, size);
  ctx.fill('evenodd');
  const color = flash && t < flash.until ? (flash.kind === 'captured' ? '#2ecc71' : '#f5a623') : '#ffffff';
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * dpr;
  ctx.strokeRect(x, y, size, size);
  ctx.lineWidth = 1.5 * dpr;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  for (const i of [1, 2]) {
    ctx.moveTo(x + i * pitch, y);
    ctx.lineTo(x + i * pitch, y + size);
    ctx.moveTo(x, y + i * pitch);
    ctx.lineTo(x + size, y + i * pitch);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (!guide) return;
  // The grid as fitted to the face, with the colour read in each cell. Fit coordinates are in the
  // small guide canvas; map them back onto the square on screen.
  const g = size / GUIDE_PX;
  const map = ([px, py]: number[]): [number, number] => [x + (px - guideSq.x) * g, y + (py - guideSq.y) * g];
  const [tl, tr, br, bl] = fitCorners(guideSq, guide.fit).map(map);
  const at = (u: number, v: number): [number, number] => {
    const top = [tl[0] + (tr[0] - tl[0]) * u, tl[1] + (tr[1] - tl[1]) * u];
    const bot = [bl[0] + (br[0] - bl[0]) * u, bl[1] + (br[1] - bl[1]) * u];
    return [top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v];
  };
  if (guide.update.clear) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    for (const i of [0, 1, 2, 3]) {
      ctx.moveTo(...at(i / 3, 0));
      ctx.lineTo(...at(i / 3, 1));
      ctx.moveTo(...at(0, i / 3));
      ctx.lineTo(...at(1, i / 3));
    }
    ctx.stroke();
  }
  guide.reading.stickers.forEach((s, i) => {
    const [cx, cy] = at(((i % 3) + 0.5) / 3, (Math.floor(i / 3) + 0.5) / 3);
    ctx.beginPath();
    ctx.arc(cx, cy, pitch * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = CSS_HEX[s.color];
    ctx.fill();
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = uncertain(s) ? '#ff3b30' : 'rgba(0,0,0,0.7)';
    ctx.stroke();
  });
  const p = guide.update.progress;
  if (auto.checked && !flash && p > 0 && p < 1 && filled() < 6) {
    const [cx, cy] = at(0.5, 0.5);
    ctx.beginPath();
    ctx.arc(cx, cy, pitch * 0.3, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    ctx.lineWidth = 4 * dpr;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
}

function drawDetected(ctx: CanvasRenderingContext2D, dpr: number) {
  if (!last || !proc.width) return;
  const k = overlay.width / proc.width;
  ctx.save();
  ctx.scale(k, k);
  const lw = 1 / k;
  if (debug.checked) {
    ctx.fillStyle = 'rgba(255,0,255,0.8)';
    for (const r of last.regions) {
      ctx.beginPath();
      ctx.arc(r.cx, r.cy, 3 * dpr * lw * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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
    for (const s of f.stickers) {
      ctx.beginPath();
      ctx.arc(s.center[0], s.center[1], pitch * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = CSS_HEX[s.color];
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

// ---------------------------------------------------------------- review / manual fix

const reviewEl = $('review');
const reviewSummary = $('review-summary');
const reviewStatus = $('review-status');
const btnAlt = $<HTMLButtonElement>('btn-alt');
const btnScramble = $<HTMLAnchorElement>('btn-scramble');
const btnLearn = $<HTMLAnchorElement>('btn-learn');
const net = createNet($('net'), $('palette'), (s) => renderReviewStatus(s));
let alternatives: CubeState[] = [];
let altIndex = 0;

function runReview() {
  const r = readCube(slots.map((s) => s!.capture));
  // Thumbnails now show the whole-cube reading (centers matched one-to-one, 9 of each colour).
  slots.forEach((s, i) => (s!.colors = r.faces[i]));
  renderCaptured();
  alternatives = r.states;
  altIndex = 0;
  net.set(r.guess);
  const how = r.usedStrips
    ? `Face rotations came from neighbour strips on ${r.usedStrips} of 6 faces${r.combinationsTried > 1 ? `, plus a search of ${r.combinationsTried} combinations` : ''}.`
    : `Each face's rotation was worked out by trying all ${r.combinationsTried.toLocaleString()} combinations.`;
  if (r.states.length === 1) reviewSummary.textContent = `Read a valid cube. ${how}`;
  else if (r.states.length > 1)
    reviewSummary.textContent = `${r.states.length} valid cubes match these faces. ${how} Check each one against your cube.`;
  else
    reviewSummary.textContent = `No valid cube matches; a sticker was probably misread. Showing the closest guess: compare it with your cube and fix the wrong stickers.`;
  btnAlt.classList.toggle('hidden', r.states.length < 2);
  renderReviewStatus(net.get());
  reviewEl.classList.remove('hidden');
  reviewEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderReviewStatus(s: CubeState) {
  const v = validate(s);
  reviewStatus.className = `status ${v.ok ? 'ok' : 'bad'}`;
  reviewStatus.replaceChildren();
  if (v.ok) reviewStatus.textContent = 'Valid cube ✓';
  else {
    const ul = document.createElement('ul');
    for (const e of v.errors) {
      const li = document.createElement('li');
      li.textContent = e;
      ul.append(li);
    }
    reviewStatus.append(ul);
  }
  btnScramble.href = `./index.html#cube=${encodeCube(s)}&from=scan`;
  btnLearn.href = `./learn.html#cube=${encodeCube(s)}`;
  for (const b of [btnScramble, btnLearn]) {
    b.classList.toggle('disabled', !v.ok);
    b.setAttribute('aria-disabled', String(!v.ok));
  }
}

btnAlt.onclick = () => {
  altIndex = (altIndex + 1) % alternatives.length;
  net.set(alternatives[altIndex]);
  renderReviewStatus(net.get());
  btnAlt.textContent = `Next possibility (${altIndex + 1}/${alternatives.length})`;
};
btnScramble.onclick = (e) => {
  if (btnScramble.classList.contains('disabled')) e.preventDefault();
};

// ---------------------------------------------------------------- wiring

btnCamera.onclick = () => void startCamera();
btnSim.onclick = () => startSim();
$<HTMLInputElement>('file').onchange = (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) loadPhoto(file);
};
btnCapture.onclick = () => captureGuide(true);
stage.onclick = () => captureGuide(true);
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || (e.target as HTMLElement).closest('button, input, a, label')) return;
  e.preventDefault();
  captureGuide(true);
});
for (const input of document.querySelectorAll<HTMLInputElement>('input[name="scan-mode"]')) {
  input.checked = input.value === scanMode;
  input.onchange = () => {
    scanMode = input.value as ScanMode;
    localStorage.setItem('scan-mode', scanMode);
    simSwitchAt = performance.now();
    renderScanMode();
  };
}
$('btn-clear').onclick = () => {
  tracker.reset();
  steady.reset();
  slots.fill(null);
  renderCaptured();
  reviewEl.classList.add('hidden');
};
video.addEventListener('loadedmetadata', () => setMode('camera'));
if (!navigator.mediaDevices?.getUserMedia) {
  btnCamera.disabled = true;
  btnCamera.title = 'Camera needs HTTPS and a browser that supports getUserMedia';
}

renderScanMode();
renderCaptured();
requestAnimationFrame(tick);
// For automated tests / debugging.
Object.assign(window, { scanner: { tracker, slots, simState, get mode() { return mode; }, getNet: () => encodeCube(net.get()) } });
