/**
 * Turn six captured face readings into a cube state.
 *
 *   1. The 6 center readings are matched one-to-one to colours; they name the faces.
 *   2. All 54 stickers are classified against the centers with exactly 9 per colour.
 *   3. Neighbour strips are classified against the centers too.
 *   4. assemble() works out each face's rotation (strips first, search otherwise).
 *   5. If no valid cube fits, a best guess is returned for the manual fix screen.
 */
import {
  type Color,
  type CubeState,
  type EdgeSide,
  FACES,
  type FaceName,
  STANDARD_SCHEME,
  fromColorArray,
  rotateFace,
} from '../core/cube';
import { CORNER_FACELETS, EDGE_FACELETS } from '../core/validate';
import { type Lab, type RGB, assignCenters, chromaDistance, classifyBalanced, stickerDistance } from '../vision/color';
import { type ScannedFace, assemble } from '../core/orient';
import type { FaceReading } from '../vision/detect';

export interface Capture {
  /** 9 sticker readings row by row as seen by the camera (index 4 = center). */
  labs: Lab[];
  /** The same readings in sRGB (used for brightness-independent strip matching). */
  rgbs?: RGB[];
  strip?: { edge: EdgeSide; labs: Lab[]; rgbs?: RGB[] };
}

export interface ReadCubeResult {
  /** Valid cube states consistent with the captures (usually exactly one). */
  states: CubeState[];
  /** Best guess when `states` is empty (most pieces valid); otherwise states[0]. */
  guess: CubeState;
  /** Classified colours of each capture, in capture order and camera orientation. */
  faces: Color[][];
  /** Which face each capture is. */
  faceOf: FaceName[];
  usedStrips: number;
  combinationsTried: number;
  errors: string[];
}

export function readCube(captures: Capture[], scheme: Record<FaceName, Color> = STANDARD_SCHEME): ReadCubeResult {
  if (captures.length !== 6) throw new Error(`Need 6 faces, got ${captures.length}`);
  const centers = captures.map((c) => c.labs[4]);
  const centerColors = assignCenters(centers);
  const colorToFace = new Map<Color, FaceName>(FACES.map((f) => [scheme[f], f]));
  const faceOf = centerColors.map((c) => colorToFace.get(c)!);

  // Balanced classification needs URFDLB order; rotation within a face does not matter.
  const order = FACES.map((f) => faceOf.indexOf(f));
  const labs = order.flatMap((i) => captures[i].labs);
  const flat = classifyBalanced(labs);
  const faces: Color[][] = captures.map(() => []);
  order.forEach((capIdx, k) => (faces[capIdx] = flat.slice(k * 9, k * 9 + 9)));

  // Strip colours: nearest center (centers are the best reference under this lighting). The strip
  // is a side face turned away from the camera and usually darker, so compare colour proportions
  // when RGB is available, and use white/non-white from Lab chroma to keep white apart.
  const centerRgbs = captures.map((c) => c.rgbs?.[4]);
  const nearestCenter = (lab: Lab, rgb?: RGB): Color => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < 6; i++) {
      const cr = centerRgbs[i];
      const d = rgb && cr ? chromaDistance(rgb, cr) * 300 + Math.abs(lab[0] - centers[i][0]) * 0.1 : stickerDistance(lab, centers[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return centerColors[best];
  };
  const scans: ScannedFace[] = captures.map((c, i) => ({
    stickers: faces[i],
    ...(c.strip
      ? { stripEdge: c.strip.edge, strip: c.strip.labs.map((lab, k) => nearestCenter(lab, c.strip!.rgbs?.[k])) }
      : {}),
  }));

  let res = assemble(scans, scheme);
  let usedStrips = scans.filter((s) => s.strip).length;
  if (!res.states.length && usedStrips) {
    // A misread strip should not block the scan: fall back to the plain rotation search.
    res = assemble(
      scans.map((s) => ({ stickers: s.stickers })),
      scheme,
    );
    usedStrips = 0;
  }

  const guess = res.states[0] ?? bestGuess(scans, faceOf);
  return {
    states: res.states,
    guess,
    faces,
    faceOf,
    usedStrips,
    combinationsTried: res.combinationsTried,
    errors: res.states.length ? [] : res.errors,
  };
}

/** Rotation combination with the most real corner/edge pieces: a good start for manual fixing. */
function bestGuess(scans: ScannedFace[], faceOf: FaceName[]): CubeState {
  const byFace = FACES.map((f) => scans[faceOf.indexOf(f)].stickers);
  const realCorners = new Set<string>();
  const realEdges = new Set<string>();
  const solved = FACES.flatMap((f) => Array(9).fill(f) as FaceName[]);
  for (const idx of CORNER_FACELETS) for (let k = 0; k < 3; k++) realCorners.add([0, 1, 2].map((j) => solved[idx[(j + k) % 3]]).join(''));
  for (const idx of EDGE_FACELETS) {
    realEdges.add(idx.map((i) => solved[i]).join(''));
    realEdges.add([...idx].reverse().map((i) => solved[i]).join(''));
  }
  const colorToFace = new Map<Color, FaceName>(FACES.map((f, i) => [byFace[i][4], f]));
  let best = { score: -1, rot: [0, 0, 0, 0, 0, 0] };
  const rot = [0, 0, 0, 0, 0, 0];
  const rec = (i: number) => {
    if (i === 6) {
      const arr = FACES.flatMap((_, k) => rotateFace(byFace[k], rot[k]).map((c) => colorToFace.get(c) ?? '?'));
      let score = 0;
      for (const idx of CORNER_FACELETS) if (realCorners.has(idx.map((j) => arr[j]).join(''))) score++;
      for (const idx of EDGE_FACELETS) if (realEdges.has(idx.map((j) => arr[j]).join(''))) score++;
      if (score > best.score) best = { score, rot: [...rot] };
      return;
    }
    for (let r = 0; r < 4; r++) {
      rot[i] = r;
      rec(i + 1);
    }
  };
  rec(0);
  return fromColorArray(FACES.flatMap((_, k) => rotateFace(byFace[k], best.rot[k])));
}

/** Capture data from a detector reading. */
export function captureOf(face: Pick<FaceReading, 'strip'> & { stickers: { lab: Lab; rgb: RGB }[] }): Capture {
  return {
    labs: face.stickers.map((s) => s.lab),
    rgbs: face.stickers.map((s) => s.rgb),
    strip: face.strip && {
      edge: face.strip.edge,
      labs: face.strip.stickers.map((s) => s.lab),
      rgbs: face.strip.stickers.map((s) => s.rgb),
    },
  };
}
