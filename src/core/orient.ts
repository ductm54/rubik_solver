/**
 * Assemble six free-hand scans into a cube state.
 *
 * Each scan holds a face's 9 stickers as the camera saw them: the face is identified by its
 * center colour, but its rotation is unknown. An optional neighbour strip (the 3 stickers of the
 * adjacent side, seen because the cube was tilted) pins the rotation without a search.
 */
import {
  type Color,
  type CubeState,
  EDGE_SIDES,
  type EdgeSide,
  FACES,
  type FaceName,
  STANDARD_SCHEME,
  fromColorArray,
  neighbourStrip,
  rotateFace,
  toColorArray,
} from './cube';
import { isValid } from './validate';

export interface ScannedFace {
  /** 9 colours row by row as seen by the camera; index 4 is the center. */
  stickers: Color[];
  /**
   * Optional strip of the neighbouring side: 3 colours, aligned with the scan's edge stickers
   * listed clockwise (top: 0,1,2 · right: 2,5,8 · bottom: 8,7,6 · left: 6,3,0).
   */
  strip?: Color[];
  /** Which edge of the scan the strip touches. */
  stripEdge?: EdgeSide;
}

export interface AssembleResult {
  /** Every valid cube state consistent with the scans. */
  states: CubeState[];
  /** How many rotation combinations were tested for validity (1 means no search was needed). */
  combinationsTried: number;
  errors: string[];
}

/** Side of the canonical face that a scan edge ends up on after rotating the scan `turns` × 90° CW. */
function rotateSide(side: EdgeSide, turns: number): EdgeSide {
  return EDGE_SIDES[(EDGE_SIDES.indexOf(side) + turns) % 4];
}

export function assemble(
  scans: readonly ScannedFace[],
  scheme: Record<FaceName, Color> = STANDARD_SCHEME,
): AssembleResult {
  const errors: string[] = [];
  if (scans.length !== 6) return { states: [], combinationsTried: 0, errors: [`Need 6 faces, got ${scans.length}`] };

  const colorToFace = new Map<Color, FaceName>(FACES.map((f) => [scheme[f], f]));
  const byFace = {} as Record<FaceName, ScannedFace>;
  for (const scan of scans) {
    if (scan.stickers.length !== 9) errors.push('Each scan needs 9 stickers');
    const f = colorToFace.get(scan.stickers[4]);
    if (!f) errors.push(`Center colour ${scan.stickers[4]} is not in the colour scheme`);
    else if (byFace[f]) errors.push(`Two scans have a ${scan.stickers[4]} center`);
    else byFace[f] = scan;
  }
  if (errors.length) return { states: [], combinationsTried: 0, errors };

  // Candidate rotations per face. rotated(scan, r) = the face in canonical orientation.
  const allowed = {} as Record<FaceName, Set<number>>;
  for (const f of FACES) allowed[f] = new Set([0, 1, 2, 3]);

  // Neighbour strips: if scan X takes rotation r, its strip lies on a known canonical side of X,
  // next to a known face N, so it must equal N's stickers along that edge under N's rotation rn.
  interface StripOption {
    x: FaceName;
    r: number;
    n: FaceName;
    rns: Set<number>; // rotations of N that match the strip
  }
  const stripOptions: StripOption[] = [];
  for (const x of FACES) {
    const scan = byFace[x];
    if (!scan.strip || !scan.stripEdge) continue;
    if (scan.strip.length !== 3) {
      errors.push(`Neighbour strip on the ${scan.stickers[4]} face must have 3 stickers`);
      continue;
    }
    for (let r = 0; r < 4; r++) {
      const { face: n, facelets } = neighbourStrip(x, rotateSide(scan.stripEdge, r));
      const rns = new Set<number>();
      for (let rn = 0; rn < 4; rn++) {
        const nFace = rotateFace(byFace[n].stickers, rn);
        if (facelets.every((fi, k) => nFace[fi % 9] === scan.strip![k])) rns.add(rn);
      }
      stripOptions.push({ x, r, n, rns });
    }
  }
  if (errors.length) return { states: [], combinationsTried: 0, errors };

  // Arc consistency: drop rotations that no longer have a matching partner, until stable.
  let changed = true;
  while (changed) {
    changed = false;
    for (const o of stripOptions) {
      if (!allowed[o.x].has(o.r)) continue;
      if (![...o.rns].some((rn) => allowed[o.n].has(rn))) {
        allowed[o.x].delete(o.r);
        changed = true;
      }
    }
    // If every remaining rotation of X puts its strip next to the same face N, N is limited to
    // the rotations those options allow.
    for (const x of FACES) {
      const live = stripOptions.filter((o) => o.x === x && allowed[x].has(o.r));
      if (!live.length || new Set(live.map((o) => o.n)).size !== 1) continue;
      const n = live[0].n;
      const ok = new Set(live.flatMap((o) => [...o.rns]));
      for (const rn of [...allowed[n]]) {
        if (!ok.has(rn)) {
          allowed[n].delete(rn);
          changed = true;
        }
      }
    }
  }

  for (const f of FACES) {
    if (allowed[f].size === 0) {
      return {
        states: [],
        combinationsTried: 0,
        errors: [`The neighbour strip on the ${byFace[f].stickers[4]} face does not match any other scan`],
      };
    }
  }

  // Search the remaining combinations (at most 4^6 = 4096) and keep the valid cubes.
  const options = FACES.map((f) => [...allowed[f]]);
  const states: CubeState[] = [];
  const seen = new Set<string>();
  let tried = 0;
  const choice = new Array<number>(6).fill(0);
  const recurse = (i: number) => {
    if (i === 6) {
      tried++;
      const colors = FACES.flatMap((f, k) => rotateFace(byFace[f].stickers, choice[k]));
      const state = fromColorArray(colors);
      if (!isValid(state)) return;
      // Strips must agree with the final state too.
      for (const x of FACES) {
        const scan = byFace[x];
        if (!scan.strip || !scan.stripEdge) continue;
        const side = rotateSide(scan.stripEdge, choice[FACES.indexOf(x)]);
        const { facelets } = neighbourStrip(x, side);
        if (!facelets.every((fi, k) => colors[fi] === scan.strip![k])) return;
      }
      const k = toColorArray(state).join('');
      if (!seen.has(k)) {
        seen.add(k);
        states.push(state);
      }
      return;
    }
    for (const r of options[i]) {
      choice[i] = r;
      recurse(i + 1);
    }
  };
  recurse(0);

  if (!states.length) errors.push('No valid cube matches these scans; check the colours or rescan a face');
  return { states, combinationsTried: tried, errors };
}

/** Make a scan from a known state: the face as the camera would see it after `turns` CW rotations. */
export function scanOf(
  state: CubeState,
  face: FaceName,
  turns = 0,
  stripEdge?: EdgeSide,
): ScannedFace {
  // Camera image = canonical face rotated by -turns, so rotating the scan by +turns restores it.
  const stickers = rotateFace(state[face], -turns);
  if (!stripEdge) return { stickers };
  const colors = toColorArray(state);
  const side = rotateSide(stripEdge, ((turns % 4) + 4) % 4);
  const { facelets } = neighbourStrip(face, side);
  return { stickers, stripEdge, strip: facelets.map((i) => colors[i]) };
}
