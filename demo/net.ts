/** Clickable 2D cube net with a colour palette: shared by the scramble and scan pages. */
import { COLORS, type Color, type CubeState, FACES, type FaceName, cloneState, solvedState } from '../src/core/cube';

export const COLOR_NAMES: Record<Color, string> = { W: 'White', Y: 'Yellow', G: 'Green', B: 'Blue', R: 'Red', O: 'Orange' };

// Net layout in a 12 × 9 grid: [row, col] of each face's top-left sticker.
const NET_POS: Record<FaceName, [number, number]> = { U: [0, 3], L: [3, 0], F: [3, 3], R: [3, 6], B: [3, 9], D: [6, 3] };

export interface NetEditor {
  get(): CubeState;
  set(s: CubeState): void;
}

export function createNet(netEl: HTMLElement, paletteEl: HTMLElement, onChange: (s: CubeState) => void): NetEditor {
  let state = solvedState();
  let paint: Color = 'W';

  const swatches: HTMLButtonElement[] = [];
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.dataset.color = c;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', COLOR_NAMES[c]);
    b.title = COLOR_NAMES[c];
    b.onclick = () => {
      paint = c;
      renderPalette();
    };
    swatches.push(b);
    paletteEl.append(b);
  }
  function renderPalette() {
    for (const b of swatches) {
      const on = b.dataset.color === paint;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-checked', String(on));
    }
  }

  const cells: Record<FaceName, HTMLButtonElement[]> = { U: [], R: [], F: [], D: [], L: [], B: [] };
  for (const f of FACES) {
    const [r0, c0] = NET_POS[f];
    for (let i = 0; i < 9; i++) {
      const b = document.createElement('button');
      b.className = 'sticker';
      b.style.gridRow = String(r0 + Math.floor(i / 3) + 1);
      b.style.gridColumn = String(c0 + (i % 3) + 1);
      if (i === 4) {
        b.classList.add('center');
        b.textContent = f;
        b.disabled = true;
      } else {
        b.onclick = () => {
          state = cloneState(state);
          state[f][i] = paint;
          render();
          onChange(state);
        };
      }
      cells[f].push(b);
      netEl.append(b);
    }
  }
  function render() {
    for (const f of FACES) cells[f].forEach((b, i) => (b.dataset.color = state[f][i]));
  }

  renderPalette();
  render();
  return {
    get: () => state,
    set(s) {
      state = cloneState(s);
      render();
    },
  };
}

/** Read-only net: draw a cube state into `el` (a `.net` grid). */
export function renderNetView(el: HTMLElement, s: CubeState) {
  el.replaceChildren();
  for (const f of FACES) {
    const [r0, c0] = NET_POS[f];
    for (let i = 0; i < 9; i++) {
      const d = document.createElement('span');
      d.className = i === 4 ? 'sticker center' : 'sticker';
      d.dataset.color = s[f][i];
      d.style.gridRow = String(r0 + Math.floor(i / 3) + 1);
      d.style.gridColumn = String(c0 + (i % 3) + 1);
      el.append(d);
    }
  }
}

/** Cube as 54 colour letters in URFDLB order, for passing in a URL. */
export function encodeCube(s: CubeState): string {
  return FACES.map((f) => s[f].join('')).join('');
}

export function decodeCube(str: string): CubeState | null {
  if (!/^[WYGBRO]{54}$/.test(str)) return null;
  const s = {} as CubeState;
  FACES.forEach((f, i) => (s[f] = [...str.slice(i * 9, i * 9 + 9)] as Color[]));
  return s;
}
