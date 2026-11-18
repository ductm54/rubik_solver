/**
 * How to recognise an OLL or PLL case fast, read from the cube as it is before the step (before
 * any U turn): what the top and the sides show, the order to read them in, and for PLL the
 * two-side picture (front and right) that is enough to tell every case apart. Shown on the Learn
 * page under the algorithm (SolveStep.tips).
 */
import type { Color } from '../../core/cube';
import { andList, cap, t } from '../../i18n';
import { colorNames, colorWord } from '../mask';
import type { Stickers } from '../pieces';

/** Top row of each side, left to right as seen when facing that side. */
export const SIDE_ROWS = { F: [18, 19, 20], R: [9, 10, 11], B: [45, 46, 47], L: [36, 37, 38] } as const;
export type Side = keyof typeof SIDE_ROWS;
const SIDES: Side[] = ['F', 'R', 'B', 'L'];
/** Side faces' centers. */
const CENTER: Record<Side, number> = { F: 22, R: 13, B: 49, L: 40 };
const OPPOSITE: Record<Side, Side> = { F: 'B', B: 'F', R: 'L', L: 'R' };

const sideWord = (s: Side) => t(`tip.side${s}`);

/** Which side a colour belongs to (by the side centers). */
const sideOfColor = (st: Stickers, c: Color): Side | undefined => SIDES.find((s) => st[CENTER[s]] === c);

export type LLKind = 'oll' | 'eo' | 'ocll' | 'pll' | 'cpll' | 'epll';

/** Shape of the top-colour edges on top. */
export function edgeShape(st: Stickers): 'dot' | 'line' | 'L' | 'cross' {
  const top = st[4];
  const up = [1, 3, 5, 7].map((i) => st[i] === top);
  const n = up.filter(Boolean).length;
  if (n === 4) return 'cross';
  if (n === 0) return 'dot';
  return (up[0] && up[3]) || (up[1] && up[2]) ? 'line' : 'L';
}

const topCorners = (st: Stickers) => [0, 2, 6, 8].filter((i) => st[i] === st[4]).length;

/** Where the top colour shows on each side, e.g. "front: headlights". Sides without it are left out. */
function ollSides(st: Stickers): string[] {
  const top = st[4];
  return SIDES.flatMap((s) => {
    const row = SIDE_ROWS[s].map((i) => st[i] === top);
    const n = row.filter(Boolean).length;
    if (!n) return [];
    const side = sideWord(s);
    if (n === 3) return [t('tip.ollSideBar', { side })];
    if (row[0] && row[2]) return [t('tip.ollSideLights', { side })];
    return [t('tip.ollSideCount', { side, count: n })];
  });
}

/** One side as a PLL solver reads it: a bar, headlights, a block, or three colours. */
export const pllSide = (st: Stickers, s: Side): string => cap(readSide(st, s));

function readSide(st: Stickers, s: Side): string {
  const [a, e, b] = SIDE_ROWS[s].map((i) => st[i]);
  const side = sideWord(s);
  if (a === e && e === b) return t('tip.pllBar', { side, color: colorWord(a) });
  if (a === b) {
    const sa = sideOfColor(st, a);
    const opposite = sa && sideOfColor(st, e) === OPPOSITE[sa];
    return t(opposite ? 'tip.pllLightsOpp' : 'tip.pllLightsAdj', { side, color: colorWord(a), edge: colorWord(e) });
  }
  if (a === e) return t('tip.pllBlockLeft', { side, color: colorWord(a), lone: colorWord(b) });
  if (e === b) return t('tip.pllBlockRight', { side, color: colorWord(b), lone: colorWord(a) });
  return t('tip.pllMixed', { side, colors: colorNames([a, e, b]) });
}

/** Sides whose two corner stickers match (headlights, or a bar). */
export const headlightSides = (st: Stickers): Side[] => SIDES.filter((s) => st[SIDE_ROWS[s][0]] === st[SIDE_ROWS[s][2]]);

/**
 * Tips for a last-layer step. `st` is the cube before the step, `top` the top colour's name,
 * `caseLabel` the case the solver found (shown as the answer of the two-side read).
 */
export function llTips(st: Stickers, kind: LLKind, top: string, caseLabel: string): string[] {
  const out: string[] = [];
  if (kind === 'oll' || kind === 'eo' || kind === 'ocll') {
    const shape = edgeShape(st);
    if (kind === 'eo') {
      out.push(t('tip.eoOnly', { top }));
      out.push(t(`tip.ollShape.${shape}`, { top }));
      return out;
    }
    const corners = topCorners(st);
    if (kind === 'oll') {
      out.push(t('tip.ollOrder', { top }));
      out.push(t(`tip.ollShape.${shape}`, { top }));
    }
    out.push(t('tip.ollCorners', { count: corners, top }));
    const sides = ollSides(st);
    if (sides.length) out.push(t('tip.ollSides', { top, list: andList(sides) }));
    if (shape === 'cross') {
      out.push(t('tip.ocllCount', { top }));
      if (corners === 1) out.push(t('tip.ocllSune', { top }));
      if (corners === 0) out.push(t('tip.ocllZero'));
      if (corners === 2) out.push(t('tip.ocllTwo', { top }));
    }
    if (kind === 'oll') out.push(t('tip.ollAngles'), t('tip.ollLookahead'));
    return out;
  }

  // PLL: read the front and the right side, as they are.
  out.push(t(kind === 'cpll' ? 'tip.cpllTwoSides' : 'tip.pllTwoSides'));
  out.push(pllSide(st, 'F'), pllSide(st, 'R'));
  if (kind === 'cpll') {
    out.push(t('tip.cpllRule'));
    const lights = headlightSides(st);
    out.push(lights.length ? t('tip.cpllLightsHere', { sides: andList(lights.map(sideWord)) }) : t('tip.cpllNoLights'));
    return out;
  }
  out.push(t('tip.pllOnly', { name: caseLabel }));
  if (kind === 'epll') {
    out.push(t('tip.epllRule'), t('tip.epllU'));
    return out;
  }
  out.push(t('tip.pllLights'), t('tip.pllColours'), t('tip.pllAngles'));
  return out;
}
