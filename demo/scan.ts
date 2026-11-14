import { COLORS, type Color, type CubeState, FACES, applyMoves, randomMoves, solvedState } from '../src/core/cube';
import { validate } from '../src/core/validate';
import { captureOf, readCube } from '../src/scan/readCube';
import type { FaceReading, Region } from '../src/vision/detect';
import { neighboursOf, renderCube } from '../src/vision/synth';
import { CaptureTracker, type TrackUpdate } from '../src/vision/tracker';
import { createNet, encodeCube } from './net';

const COLOR_NAMES: Record<Color, string> = { W: 'white', Y: 'yellow', G: 'green', B: 'blue', R: 'red', O: 'orange' };
const CSS: Record<Color, string> = { W: 'var(--W)', Y: 'var(--Y)', G: 'var(--G)', B: 'var(--B)', R: 'var(--R)', O: 'var(--O)' };
const PROC_MAX = 360; // longest side of the frame given to the detector

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
const btnCamera = $<HTMLButtonElement>('btn-camera');
const btnSim = $<HTMLButtonElement>('btn-sim');

type Mode = 'idle' | 'camera' | 'sim' | 'photo';
let mode: Mode = 'idle';
let stream: MediaStream | null = null;
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

// Simulated cube: a random scrambled cube rendered in 3D. It shows one face at a time, tilted so
// a strip of the side above shows, with some hand jitter, and turns to the next face after each
// capture.
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
  const img = renderCube(
    simState,
    {
      front,
      up,
      pitch: 22 + 10 * wobble * Math.sin(t / 120),
      yaw: 4 * Math.sin(simFace * 2.1) + 12 * wobble * Math.sin(t / 150),
      roll: 12 * Math.sin(simFace * 1.3) + 0.6 * Math.sin(t / 700),
      shift: [Math.sin(t / 90) * 14 * wobble, Math.cos(t / 110) * 10 * wobble],
    },
    { noise: 4 },
  );
  sim.getContext('2d')!.putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
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
  statusEl.textContent = 'Looking for a face…';
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

worker.onmessage = (e) => {
  busy = false;
  const { face, regions, ms } = e.data as { face: FaceReading | null; regions: Region[]; ms: number };
  const now = performance.now();
  if (lastFrameT) fps = 0.8 * fps + 0.2 * (1000 / (now - lastFrameT));
  lastFrameT = now;
  perf.textContent = `${ms.toFixed(0)} ms/frame · ${fps.toFixed(0)} fps`;
  if (mode === 'idle') return;
  const update = tracker.update(face, now);
  last = { face, regions, update };
  renderLive(face);
  renderStatus(face, update);
  if (update.capture) onCapture(update.capture);
};

// ---------------------------------------------------------------- UI

function renderStatus(face: FaceReading | null, u: TrackUpdate) {
  if (!face) statusEl.textContent = 'Looking for a face…';
  else if (u.status === 'steadying') statusEl.textContent = `Hold still… ${COLOR_NAMES[face.colors[4]]} center`;
  else if (u.status === 'captured') statusEl.textContent = `Captured the ${COLOR_NAMES[face.colors[4]]} face ✓ Turn to the next one.`;
  else if (u.status === 'duplicate') statusEl.textContent = `Already have the ${COLOR_NAMES[face.colors[4]]} face. Tap it below to rescan.`;
}

function miniFace(colors: Color[] | null, uncertain: boolean[] = []): HTMLElement {
  const g = document.createElement('div');
  g.className = 'mini-grid';
  for (let i = 0; i < 9; i++) {
    const c = document.createElement('span');
    if (colors) {
      c.style.background = CSS[colors[i]];
      if (uncertain[i]) c.classList.add('uncertain');
    }
    g.append(c);
  }
  return g;
}

function renderLive(face: FaceReading | null) {
  live.replaceChildren(miniFace(face?.colors ?? null, face?.stickers.map((s) => s.margin < 10) ?? []));
}

function renderCaptured() {
  capturedEl.replaceChildren();
  for (const c of COLORS) {
    const slot = document.createElement('button');
    slot.className = 'slot';
    const f = tracker.captured.get(c);
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = CSS[c];
    slot.append(f ? miniFace(f.colors) : miniFace(null), dot);
    slot.title = f ? `Rescan the ${COLOR_NAMES[c]} face` : `${COLOR_NAMES[c]} face not captured yet`;
    slot.classList.toggle('filled', !!f);
    slot.disabled = !f;
    slot.onclick = () => {
      tracker.forget(c);
      renderCaptured();
      reviewEl.classList.add('hidden');
    };
    if (f?.strip) slot.classList.add('has-strip');
    capturedEl.append(slot);
  }
  countEl.textContent = `${tracker.captured.size} / 6`;
}

let audio: AudioContext | null = null;
function onCapture(face: FaceReading) {
  renderCaptured();
  if (tracker.captured.size === 6) runReview();
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
  if (mode === 'sim' && tracker.captured.size < 6) {
    // move to a face we don't have yet
    setTimeout(() => {
      for (let k = 1; k <= 6; k++) {
        const next = (simFace + k) % 6;
        if (!tracker.captured.has(simState[FACES[next]][4])) {
          simFace = next;
          break;
        }
      }
      simSwitchAt = performance.now();
    }, 500);
  }
  void face;
}

function drawOverlay() {
  const rect = overlay.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (overlay.width !== Math.round(rect.width * dpr)) {
    overlay.width = Math.round(rect.width * dpr);
    overlay.height = Math.round(rect.height * dpr);
  }
  const ctx = overlay.getContext('2d')!;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
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
    const color = st === 'captured' ? '#2ecc71' : st === 'duplicate' ? '#f5a623' : '#ffffff';
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

const CSS_HEX: Record<Color, string> = { W: '#ffffff', Y: '#ffd500', G: '#009b48', B: '#0046ad', R: '#b71234', O: '#ff5800' };

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
  const captures = COLORS.map((c) => tracker.captured.get(c)).filter((f): f is FaceReading => !!f).map(captureOf);
  const r = readCube(captures);
  alternatives = r.states;
  altIndex = 0;
  net.set(r.guess);
  const how = r.usedStrips
    ? `Face rotations came from neighbour strips on ${r.usedStrips} of 6 faces${r.combinationsTried > 1 ? `, plus a search of ${r.combinationsTried} combinations` : ''}.`
    : `No usable neighbour strips, so all ${r.combinationsTried.toLocaleString()} face-rotation combinations were tried.`;
  if (r.states.length === 1) reviewSummary.textContent = `Read a valid cube. ${how}`;
  else if (r.states.length > 1)
    reviewSummary.textContent = `${r.states.length} valid cubes match these faces. ${how} Check against your cube, or rescan a face with the cube tilted so a side strip shows.`;
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
$('btn-clear').onclick = () => {
  tracker.reset();
  renderCaptured();
  reviewEl.classList.add('hidden');
};
video.addEventListener('loadedmetadata', () => setMode('camera'));
if (!navigator.mediaDevices?.getUserMedia) {
  btnCamera.disabled = true;
  btnCamera.title = 'Camera needs HTTPS and a browser that supports getUserMedia';
}

renderLive(null);
renderCaptured();
requestAnimationFrame(tick);
// For automated tests / debugging.
Object.assign(window, { scanner: { tracker, simState, get mode() { return mode; }, getNet: () => encodeCube(net.get()) } });
